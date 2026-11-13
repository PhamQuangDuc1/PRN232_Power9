using Microsoft.EntityFrameworkCore;

namespace Power9.NotificationWorker.Data;

// Read/Write model tối giản: Worker chỉ map những cột nó cần.
// Bảng và cột phải khớp schema do Thành viên 1 tạo bằng EF Migration
// (xem docs/contract_giua_2_thanh_vien.md).

public sealed class WorkerUser
{
    public int Id { get; set; }
    public int TotalPoints { get; set; }
    public int CurrentStreak { get; set; }
}

public sealed class WorkerRoutine
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public int RewardPoints { get; set; }
}

public sealed class WorkerUserSchedule
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int RoutineId { get; set; }
    public TimeSpan ReminderTime { get; set; }
    public string DaysOfWeek { get; set; } = string.Empty;
    public bool IsActive { get; set; }
}

public sealed class WorkerDailyLog
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int RoutineId { get; set; }
    public DateTime CompletedAt { get; set; }
    public int PointsEarned { get; set; }
    public string? Note { get; set; }
    public Guid? EventId { get; set; }
}

public sealed class WorkerDbContext : DbContext
{
    public WorkerDbContext(DbContextOptions<WorkerDbContext> options) : base(options) { }

    public DbSet<WorkerUser> Users => Set<WorkerUser>();
    public DbSet<WorkerRoutine> Routines => Set<WorkerRoutine>();
    public DbSet<WorkerUserSchedule> UserSchedules => Set<WorkerUserSchedule>();
    public DbSet<WorkerDailyLog> DailyLogs => Set<WorkerDailyLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<WorkerUser>().ToTable("Users");
        modelBuilder.Entity<WorkerRoutine>().ToTable("Routines");
        modelBuilder.Entity<WorkerUserSchedule>().ToTable("UserSchedules");
        modelBuilder.Entity<WorkerDailyLog>().ToTable("DailyLogs");
    }
}
