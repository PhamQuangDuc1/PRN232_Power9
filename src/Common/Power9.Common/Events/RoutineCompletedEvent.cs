namespace Power9.Common.Events;

/// <summary>
/// Event bắn vào Kafka topic <c>power9-routine-completed</c> khi nhân viên check-in.
/// REST API chỉ cần điền UserId + RoutineId; Worker sẽ tự tra bảng Routines để lấy
/// tiêu đề và điểm thưởng (tránh để client tự khai điểm).
/// </summary>
public class RoutineCompletedEvent
{
    public Guid EventId { get; set; } = Guid.NewGuid();
    public int UserId { get; set; }
    public int RoutineId { get; set; }
    public string? Note { get; set; }
    public int BuildingMaterialsEarned { get; set; } = 50;
    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;
}
