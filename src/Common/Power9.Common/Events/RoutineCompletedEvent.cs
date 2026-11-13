using System;

namespace Power9.Common.Events;

public class RoutineCompletedEvent
{
    public Guid EventId { get; set; } = Guid.NewGuid();
    public int UserId { get; set; }
    public int RoutineId { get; set; }
    public string RoutineTitle { get; set; } = string.Empty;
    public int PointsEarned { get; set; }
    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;
}
