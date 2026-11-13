using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Power9.NotificationWorker.Data;
using Power9.NotificationWorker.Domain;

namespace Power9.NotificationWorker.Workers;

/// <summary>
/// Scheduled Background Job: định kỳ quét UserSchedules, gửi nhắc nhở (mô phỏng bằng log)
/// cho các lịch có ReminderTime rơi vào khoảng thời gian kể từ lần quét trước.
/// </summary>
public sealed class DailyScheduleReminderJob : BackgroundService
{
    private static readonly string[] DayCodes = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DailyScheduleReminderJob> _logger;
    private readonly TimeSpan _interval;

    public DailyScheduleReminderJob(IServiceScopeFactory scopeFactory, IConfiguration configuration,
        ILogger<DailyScheduleReminderJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _interval = TimeSpan.FromSeconds(configuration.GetValue("Reminder:IntervalSeconds", 60));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[REMINDER JOB] Started, interval {Interval}s", _interval.TotalSeconds);
        var windowStart = VietnamTime.Now;

        using var timer = new PeriodicTimer(_interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var windowEnd = VietnamTime.Now;
            try
            {
                await ScanAsync(windowStart, windowEnd, stoppingToken);
            }
            catch (SqlException ex)
            {
                _logger.LogWarning("[REMINDER JOB] Chưa đọc được database ({Message}) - sẽ thử lại lần sau", ex.Message);
            }
            windowStart = windowEnd;
        }
    }

    private async Task ScanAsync(DateTime fromLocal, DateTime toLocal, CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkerDbContext>();

        var schedules = await db.UserSchedules.AsNoTracking().Where(s => s.IsActive).ToListAsync(ct);
        var due = schedules.Where(s => IsDue(s, fromLocal, toLocal)).ToList();
        if (due.Count == 0) return;

        var routineIds = due.Select(s => s.RoutineId).Distinct().ToList();
        var titles = await db.Routines.AsNoTracking()
            .Where(r => routineIds.Contains(r.Id))
            .ToDictionaryAsync(r => r.Id, r => r.Title, ct);

        foreach (var s in due)
        {
            // TODO (mở rộng): gửi email / push notification thật qua SMTP hoặc FCM
            _logger.LogInformation("[REMINDER JOB] Nhắc User {UserId}: đến giờ '{Title}' lúc {Time:hh\\:mm}",
                s.UserId, titles.GetValueOrDefault(s.RoutineId, $"Routine #{s.RoutineId}"), s.ReminderTime);
        }
    }

    internal static bool IsDue(WorkerUserSchedule schedule, DateTime fromLocal, DateTime toLocal)
    {
        // Xử lý khoảng thời gian trong cùng một ngày; nếu cửa sổ vắt qua nửa đêm thì kiểm tra theo ngày của toLocal
        var day = DayCodes[(int)toLocal.DayOfWeek];
        var days = schedule.DaysOfWeek.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (days.Length > 0 && !days.Contains(day, StringComparer.OrdinalIgnoreCase)) return false;

        var from = fromLocal.Date == toLocal.Date ? fromLocal.TimeOfDay : TimeSpan.Zero;
        var to = toLocal.TimeOfDay;
        return schedule.ReminderTime > from && schedule.ReminderTime <= to;
    }
}
