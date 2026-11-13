using System.Text.Json;
using Confluent.Kafka;
using Microsoft.EntityFrameworkCore;
using Power9.Common.Constants;
using Power9.Common.Events;
using Power9.NotificationWorker.Data;
using Power9.NotificationWorker.Domain;

namespace Power9.NotificationWorker.Workers;

/// <summary>
/// Kafka Consumer: lắng nghe topic power9-routine-completed, cộng điểm, tính streak, ghi DailyLogs.
/// Commit offset thủ công SAU khi lưu DB thành công (at-least-once) + chống xử lý trùng bằng EventId.
/// </summary>
public sealed class RoutineCompletedConsumerWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<RoutineCompletedConsumerWorker> _logger;

    public RoutineCompletedConsumerWorker(IServiceScopeFactory scopeFactory, IConfiguration configuration,
        ILogger<RoutineCompletedConsumerWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    // Consume() là hàm blocking -> chạy trên thread riêng để không chặn quá trình khởi động Host
    protected override Task ExecuteAsync(CancellationToken stoppingToken) =>
        Task.Factory.StartNew(() => ConsumeLoop(stoppingToken), stoppingToken,
            TaskCreationOptions.LongRunning, TaskScheduler.Default).Unwrap();

    private async Task ConsumeLoop(CancellationToken stoppingToken)
    {
        var config = new ConsumerConfig
        {
            BootstrapServers = _configuration["Kafka:BootstrapServers"] ?? "localhost:9092",
            GroupId = _configuration["Kafka:GroupId"] ?? "power9-worker-group",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = false,
            AllowAutoCreateTopics = true
        };

        using var consumer = new ConsumerBuilder<string, string>(config)
            .SetErrorHandler((_, e) => _logger.LogWarning("[KAFKA CONSUMER] {Reason}", e.Reason))
            .Build();

        consumer.Subscribe(KafkaTopics.RoutineCompletedTopic);
        _logger.LogInformation("[KAFKA CONSUMER] Subscribed to {Topic} (group {Group})",
            KafkaTopics.RoutineCompletedTopic, config.GroupId);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                ConsumeResult<string, string>? result;
                try
                {
                    result = consumer.Consume(stoppingToken);
                }
                catch (ConsumeException ex)
                {
                    // Ví dụ topic chưa được tạo khi Kafka vừa khởi động
                    _logger.LogWarning("[KAFKA CONSUMER] Consume error: {Reason}", ex.Error.Reason);
                    await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
                    continue;
                }

                if (result?.Message is null) continue;

                try
                {
                    await HandleAsync(result.Message.Value, stoppingToken);
                    consumer.Commit(result);
                }
                catch (JsonException ex)
                {
                    _logger.LogError(ex, "[KAFKA CONSUMER] Bỏ qua message sai định dạng tại offset {Offset}", result.Offset.Value);
                    consumer.Commit(result);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // Lỗi tạm thời (DB down...) -> quay lại offset này và thử lại sau 5s
                    _logger.LogError(ex, "[KAFKA CONSUMER] Xử lý thất bại offset {Offset}, sẽ thử lại", result.Offset.Value);
                    consumer.Seek(result.TopicPartitionOffset);
                    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Host đang dừng
        }
        finally
        {
            consumer.Close();
        }
    }

    private async Task HandleAsync(string payload, CancellationToken ct)
    {
        var evt = JsonSerializer.Deserialize<RoutineCompletedEvent>(payload)
                  ?? throw new JsonException("Payload rỗng");

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkerDbContext>();

        if (await db.DailyLogs.AnyAsync(l => l.EventId == evt.EventId, ct))
        {
            _logger.LogInformation("[KAFKA CONSUMER] Event {EventId} đã xử lý trước đó -> bỏ qua", evt.EventId);
            return;
        }

        var routine = await db.Routines.AsNoTracking().FirstOrDefaultAsync(r => r.Id == evt.RoutineId, ct);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == evt.UserId, ct);
        if (routine is null || user is null)
        {
            _logger.LogWarning("[KAFKA CONSUMER] Bỏ qua event {EventId}: không tìm thấy User {UserId} hoặc Routine {RoutineId}",
                evt.EventId, evt.UserId, evt.RoutineId);
            return;
        }

        var lastCompletedUtc = await db.DailyLogs
            .Where(l => l.UserId == user.Id)
            .OrderByDescending(l => l.CompletedAt)
            .Select(l => (DateTime?)l.CompletedAt)
            .FirstOrDefaultAsync(ct);

        var today = VietnamTime.ToLocalDate(evt.CompletedAt);
        DateOnly? lastDate = lastCompletedUtc is null ? null : VietnamTime.ToLocalDate(lastCompletedUtc.Value);

        user.CurrentStreak = StreakCalculator.Next(user.CurrentStreak, lastDate, today);
        user.TotalPoints += routine.RewardPoints;

        db.DailyLogs.Add(new WorkerDailyLog
        {
            UserId = user.Id,
            RoutineId = routine.Id,
            CompletedAt = evt.CompletedAt,
            PointsEarned = routine.RewardPoints,
            Note = evt.Note,
            EventId = evt.EventId
        });

        await db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[KAFKA CONSUMER] User {UserId} hoàn thành '{Title}' +{Points} điểm -> Tổng {Total}, Streak {Streak} ngày",
            user.Id, routine.Title, routine.RewardPoints, user.TotalPoints, user.CurrentStreak);
    }
}
