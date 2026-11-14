using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Power9.NotificationWorker.Data;

namespace Power9.NotificationWorker.Workers;

/// <summary>
/// Background Job quản lý chu kỳ 7 ngày của Tribe City.
/// Quét định kỳ các CityRoom đã hết hạn (ExpiredAt <= DateTime.UtcNow) để tự động chuyển sang Archived.
/// </summary>
public sealed class CityCycleWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CityCycleWorker> _logger;
    private readonly TimeSpan _interval = TimeSpan.FromSeconds(60);

    public CityCycleWorker(IServiceScopeFactory scopeFactory, ILogger<CityCycleWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[CITY CYCLE WORKER] Started, scanning every {Interval}s", _interval.TotalSeconds);

        using var timer = new PeriodicTimer(_interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await ProcessExpiredRoomsAsync(stoppingToken);
            }
            catch (SqlException ex)
            {
                _logger.LogWarning("[CITY CYCLE WORKER] Lỗi DB tạm thời: {Message}", ex.Message);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "[CITY CYCLE WORKER] Lỗi khi quét phòng hết hạn");
            }
        }
    }

    private async Task ProcessExpiredRoomsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkerDbContext>();

        var expiredRooms = await db.CityRooms
            .Where(r => r.Status == "Active" && r.ExpiredAt <= DateTime.UtcNow)
            .ToListAsync(ct);

        if (expiredRooms.Count == 0) return;

        foreach (var room in expiredRooms)
        {
            room.Status = "Archived";
            _logger.LogInformation("[CITY CYCLE WORKER] Phòng #{RoomId} đã hoàn thành chu kỳ 7 ngày! Đã đóng và lưu vào Archive (Điểm tổng: {Score})",
                room.Id, room.TotalCityScore);
        }

        await db.SaveChangesAsync(ct);
    }
}
