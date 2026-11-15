// Lưu thói quen được nhắc, giờ nhắc, ngày lặp và trạng thái bật của từng người dùng.
namespace Power9.RoutineService.Domain.Entities;

public class UserSchedule
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public int RoutineId { get; set; }
    public Routine Routine { get; set; } = null!;
    public TimeSpan ReminderTime { get; set; }
    public string DaysOfWeek { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}
