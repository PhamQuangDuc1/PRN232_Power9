// Lưu tài khoản, vai trò, điểm tích lũy, chuỗi ngày và các quan hệ tới lịch, nhật ký.
using Power9.RoutineService.Domain.Enums;

namespace Power9.RoutineService.Domain.Entities;

public class User
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.Employee;
    public int TotalPoints { get; set; }
    public int CurrentStreak { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<UserSchedule> Schedules { get; set; } = new List<UserSchedule>();
    public ICollection<DailyLog> DailyLogs { get; set; } = new List<DailyLog>();
}
