// Ánh xạ các bảng SQL Server mà worker cần đọc hoặc cập nhật khi xử lý nhắc lịch, check-in và Tribe City.
using Microsoft.EntityFrameworkCore;

namespace Power9.NotificationWorker.Data;

// Read/Write model tối giản: Worker chỉ map những cột nó cần.
// Bảng và cột phải khớp schema do Thành viên 1 tạo bằng EF Migration
// (xem docs/contract_giua_2_thanh_vien.md).

public sealed class WorkerUser
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
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

public sealed class WorkerCityRoom
{
    public int Id { get; set; }
    public string Status { get; set; } = "Active";
    public int TotalCityScore { get; set; }
    public DateTime ExpiredAt { get; set; }
}

public sealed class WorkerCityResident
{
    public int Id { get; set; }
    public int RoomId { get; set; }
    public int UserId { get; set; }
    public int HouseFloors { get; set; }
    public int BuildingMaterials { get; set; }
    public DateTime? LastCheckInAt { get; set; }
    public bool IsActive { get; set; }
}

public sealed class WorkerDbContext : DbContext
{
    public WorkerDbContext(DbContextOptions<WorkerDbContext> options) : base(options) { }

    public DbSet<WorkerUser> Users => Set<WorkerUser>();
    public DbSet<WorkerRoutine> Routines => Set<WorkerRoutine>();
    public DbSet<WorkerUserSchedule> UserSchedules => Set<WorkerUserSchedule>();
    public DbSet<WorkerDailyLog> DailyLogs => Set<WorkerDailyLog>();
    public DbSet<WorkerCityRoom> CityRooms => Set<WorkerCityRoom>();
    public DbSet<WorkerCityResident> CityResidents => Set<WorkerCityResident>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<WorkerUser>().ToTable("Users");
        modelBuilder.Entity<WorkerRoutine>().ToTable("Routines");
        modelBuilder.Entity<WorkerUserSchedule>().ToTable("UserSchedules");
        modelBuilder.Entity<WorkerDailyLog>().ToTable("DailyLogs");
        modelBuilder.Entity<WorkerCityRoom>().ToTable("CityRooms");
        modelBuilder.Entity<WorkerCityResident>().ToTable("CityResidents");
    }
}
