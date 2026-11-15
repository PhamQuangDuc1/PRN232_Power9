using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Power9.NotificationWorker.Data;
using Power9.NotificationWorker.Domain;
using Power9.NotificationWorker.Services;

namespace Power9.NotificationWorker.Workers;

/// <summary>
/// Scheduled Background Job: định kỳ quét UserSchedules, gửi email nhắc nhở thật qua SMTP
/// cho các lịch có ReminderTime rơi vào khoảng thời gian kể từ lần quét trước.
/// </summary>
public sealed class DailyScheduleReminderJob : BackgroundService
{
    private static readonly string[] DayCodes = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IEmailSender _emailSender;
    private readonly ILogger<DailyScheduleReminderJob> _logger;
    private readonly TimeSpan _interval;

    public DailyScheduleReminderJob(IServiceScopeFactory scopeFactory, IEmailSender emailSender,
        IConfiguration configuration, ILogger<DailyScheduleReminderJob> logger)
    {
        _scopeFactory = scopeFactory;
        _emailSender = emailSender;
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

        var userIds = due.Select(s => s.UserId).Distinct().ToList();
        var users = await db.Users.AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, ct);

        foreach (var s in due)
        {
            var routineTitle = titles.GetValueOrDefault(s.RoutineId, $"Routine #{s.RoutineId}");
            users.TryGetValue(s.UserId, out var user);
            var toEmail = user?.Email;
            var toName = string.IsNullOrWhiteSpace(user?.FullName) ? "bạn" : user.FullName;

            _logger.LogInformation("[REMINDER JOB] Nhắc User {UserId} ({Email}): đến giờ '{Title}' lúc {Time:hh\\:mm}",
                s.UserId, toEmail ?? "N/A", routineTitle, s.ReminderTime);

            if (!string.IsNullOrWhiteSpace(toEmail))
            {
                var subject = $"⏰ [Power9] Đã đến giờ thực hiện thói quen: {routineTitle}";
                var htmlBody = $@"
<div style='font-family: -apple-system, BlinkMacSystemFont, ""Segoe UI"", Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);'>
    <div style='background: linear-gradient(135deg, #3182ce 0%, #2b6cb0 100%); padding: 24px 20px; text-align: center; color: #ffffff;'>
        <h1 style='margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;'>Power9 Office Routine</h1>
        <p style='margin: 6px 0 0; font-size: 14px; opacity: 0.9;'>Chăm sóc sức khỏe & công thái học nơi công sở</p>
    </div>
    <div style='padding: 24px 20px;'>
        <p style='font-size: 16px; color: #2d3748; margin-top: 0;'>Chào <strong>{toName}</strong>,</p>
        <p style='font-size: 15px; color: #4a5568; line-height: 1.6;'>
            Đã đến giờ thực hiện thói quen <strong>{routineTitle}</strong> theo lịch nhắc cá nhân của bạn (<strong style='color:#3182ce;'>{s.ReminderTime:hh\\:mm}</strong>).
        </p>
        <div style='background-color: #ebf8ff; border-left: 4px solid #3182ce; padding: 16px; border-radius: 4px; margin: 20px 0;'>
            <p style='margin: 0; color: #2b6cb0; font-size: 15px; font-weight: 500;'>
                🌱 <em>Hãy tạm dừng công việc 2 - 5 phút để thư giãn, vận động hoặc uống nước để nạp lại năng lượng nhé!</em>
            </p>
        </div>
        <p style='font-size: 14px; color: #718096; line-height: 1.5;'>
            Sau khi hoàn thành, hãy truy cập hệ thống Power9 để <strong>Check-in</strong> nhận điểm thưởng và duy trì chuỗi Streak mỗi ngày.
        </p>
        <div style='text-align: center; margin: 28px 0 16px;'>
            <a href='http://localhost:5000/#/today' style='display: inline-block; background-color: #3182ce; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;'>Mở Power9 Dashboard</a>
        </div>
    </div>
    <div style='background-color: #f7fafc; padding: 16px 20px; text-align: center; border-top: 1px solid #edf2f7;'>
        <small style='color: #a0aec0; font-size: 12px;'>Email này được gửi tự động bởi hệ thống nhắc nhở thông minh Power9.</small>
    </div>
</div>";
                await _emailSender.SendEmailAsync(toEmail, toName, subject, htmlBody, ct);
            }
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
