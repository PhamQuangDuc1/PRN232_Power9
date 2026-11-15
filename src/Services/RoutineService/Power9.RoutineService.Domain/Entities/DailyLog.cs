// Lưu bản ghi hoàn thành thói quen và mã sự kiện dùng để chống ghi nhận trùng.
namespace Power9.RoutineService.Domain.Entities;

public class DailyLog
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public int RoutineId { get; set; }
    public Routine Routine { get; set; } = null!;
    public DateTime CompletedAt { get; set; }
    public int PointsEarned { get; set; }
    public string? Note { get; set; }
    public Guid? EventId { get; set; }
}
