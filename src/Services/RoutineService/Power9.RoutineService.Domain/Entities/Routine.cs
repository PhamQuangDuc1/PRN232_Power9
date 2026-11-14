namespace Power9.RoutineService.Domain.Entities;

public class Routine
{
    public int Id { get; set; }
    public int CategoryId { get; set; }
    public RoutineCategory Category { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int DurationMinutes { get; set; }
    public string EnergyLevel { get; set; } = "Low";
    public string TargetTimeOfDay { get; set; } = "Anytime";
    public int RewardPoints { get; set; }
    public bool IsApproved { get; set; } = true;
    public ICollection<UserSchedule> Schedules { get; set; } = new List<UserSchedule>();
    public ICollection<DailyLog> DailyLogs { get; set; } = new List<DailyLog>();
}
