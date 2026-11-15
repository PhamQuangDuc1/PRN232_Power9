using System.Text.Json;
using Confluent.Kafka;
using Microsoft.EntityFrameworkCore;
using Power9.Common.Constants;
using Power9.Common.Events;
using Power9.NotificationWorker.Data;
using Power9.NotificationWorker.Domain;
using Power9.NotificationWorker.Services;

namespace Power9.NotificationWorker.Workers;

/// <summary>
/// Kafka Consumer: lắng nghe topic power9-routine-completed, cộng điểm, tính streak, ghi DailyLogs.
/// Commit offset thủ công SAU khi lưu DB thành công (at-least-once) + chống xử lý trùng bằng EventId.
/// </summary>
public sealed class RoutineCompletedConsumerWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly IEmailSender _emailSender;
    private readonly ILogger<RoutineCompletedConsumerWorker> _logger;

    public RoutineCompletedConsumerWorker(IServiceScopeFactory scopeFactory, IConfiguration configuration,
        IEmailSender emailSender, ILogger<RoutineCompletedConsumerWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _emailSender = emailSender;
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

        // [Tribe City Integration]: Check if user is in an active City Room
        var resident = await db.CityResidents
            .Where(r => r.UserId == user.Id && r.IsActive)
            .OrderByDescending(r => r.Id)
            .FirstOrDefaultAsync(ct);

        if (resident != null)
        {
            var room = await db.CityRooms.FirstOrDefaultAsync(r => r.Id == resident.RoomId && r.Status == "Active", ct);
            if (room != null && room.ExpiredAt > DateTime.UtcNow)
            {
                var materialsEarned = evt.BuildingMaterialsEarned > 0 ? evt.BuildingMaterialsEarned : 50;
                resident.BuildingMaterials += materialsEarned;
                resident.LastCheckInAt = evt.CompletedAt;
                room.TotalCityScore += materialsEarned;

                // Threshold check: cứ 100 materials = +1 cấp (tối đa cấp 4)
                var nextFloorThreshold = resident.HouseFloors * 100;
                if (resident.BuildingMaterials >= nextFloorThreshold && resident.HouseFloors < 4)
                {
                    resident.HouseFloors += 1;
                    _logger.LogInformation("[TRIBE CITY] Resident {UserId} in Room {RoomId} upgraded house to floor {Floors}!",
                        user.Id, room.Id, resident.HouseFloors);
                }

                _logger.LogInformation(
                    "[TRIBE CITY] User {UserId} in Room {RoomId} received +{Materials} materials (Total: {TotalMat}, Floor: {Floor}). Room score: {Score}",
                    user.Id, room.Id, materialsEarned, resident.BuildingMaterials, resident.HouseFloors, room.TotalCityScore);
            }
        }

        await db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[KAFKA CONSUMER] User {UserId} hoàn thành '{Title}' +{Points} điểm -> Tổng {Total}, Streak {Streak} ngày",
            user.Id, routine.Title, routine.RewardPoints, user.TotalPoints, user.CurrentStreak);

        if (!string.IsNullOrWhiteSpace(user.Email))
        {
            var subject = $"🎉 [Power9] Check-in thành công: {routine.Title} (+{routine.RewardPoints} điểm)";
            var htmlBody = $@"
<div style='font-family: -apple-system, BlinkMacSystemFont, ""Segoe UI"", Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);'>
    <div style='background: linear-gradient(135deg, #38a169 0%, #276749 100%); padding: 24px 20px; text-align: center; color: #ffffff;'>
        <h1 style='margin: 0; font-size: 24px; font-weight: 700;'>Tuyệt vời, {(string.IsNullOrWhiteSpace(user.FullName) ? "bạn" : user.FullName)}! 🎉</h1>
        <p style='margin: 6px 0 0; font-size: 14px; opacity: 0.9;'>Bạn vừa hoàn thành một thói quen lành mạnh hôm nay</p>
    </div>
    <div style='padding: 24px 20px;'>
        <p style='font-size: 16px; color: #2d3748;'>Bạn đã check-in thành công bài tập: <strong>{routine.Title}</strong></p>
        <div style='background: #f0fff4; border: 1px solid #c6f6d5; border-radius: 8px; padding: 16px; margin: 20px 0;'>
            <div style='font-size: 15px; color: #22543d; margin-bottom: 8px;'>⭐ <strong>Điểm thưởng nhận được:</strong> +{routine.RewardPoints} điểm</div>
            <div style='font-size: 15px; color: #22543d; margin-bottom: 8px;'>🔥 <strong>Chuỗi Streak hiện tại:</strong> {user.CurrentStreak} ngày liên tiếp</div>
            <div style='font-size: 15px; color: #22543d;'>🏆 <strong>Tổng điểm tích lũy:</strong> {user.TotalPoints} điểm</div>
        </div>
        <p style='font-size: 14px; color: #718096; line-height: 1.5;'>
            Hãy tiếp tục duy trì thói quen mỗi ngày để nâng cấp công trình trong Tribe City và nâng cao sức khỏe làm việc!
        </p>
        <div style='text-align: center; margin: 28px 0 16px;'>
            <a href='http://localhost:5000/#/city' style='display: inline-block; background-color: #38a169; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;'>Xem Tribe City</a>
        </div>
    </div>
    <div style='background-color: #f7fafc; padding: 16px 20px; text-align: center; border-top: 1px solid #edf2f7;'>
        <small style='color: #a0aec0; font-size: 12px;'>Hệ thống thông báo tự động từ Power9 Office Routine.</small>
    </div>
</div>";
            await _emailSender.SendEmailAsync(user.Email, user.FullName, subject, htmlBody, ct);
        }
    }
}
