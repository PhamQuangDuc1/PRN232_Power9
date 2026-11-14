using Microsoft.EntityFrameworkCore;
using Power9.RoutineService.Domain.Entities;

namespace Power9.RoutineService.Infrastructure.Data;

public class Power9DbContext(DbContextOptions<Power9DbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<RoutineCategory> RoutineCategories => Set<RoutineCategory>();
    public DbSet<Routine> Routines => Set<Routine>();
    public DbSet<UserSchedule> UserSchedules => Set<UserSchedule>();
    public DbSet<DailyLog> DailyLogs => Set<DailyLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Username).HasMaxLength(50).IsRequired();
            entity.Property(x => x.Email).HasMaxLength(256).IsRequired();
            entity.Property(x => x.PasswordHash).HasMaxLength(256).IsRequired();
            entity.Property(x => x.FullName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Role).HasConversion<string>().HasMaxLength(20);
            entity.HasIndex(x => x.Email).IsUnique();
            entity.HasIndex(x => x.Username).IsUnique();
        });
        modelBuilder.Entity<RoutineCategory>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(80).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(500).IsRequired();
            entity.Property(x => x.Icon).HasMaxLength(40).IsRequired();
            entity.HasIndex(x => x.Name).IsUnique();
        });
        modelBuilder.Entity<Routine>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Title).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(2000).IsRequired();
            entity.Property(x => x.EnergyLevel).HasMaxLength(20).IsRequired();
            entity.Property(x => x.TargetTimeOfDay).HasMaxLength(20).IsRequired();
            entity.HasOne(x => x.Category).WithMany(x => x.Routines).HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => new { x.CategoryId, x.IsApproved });
        });
        modelBuilder.Entity<UserSchedule>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.DaysOfWeek).HasMaxLength(100).IsRequired();
            entity.HasOne(x => x.User).WithMany(x => x.Schedules).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Routine).WithMany(x => x.Schedules).HasForeignKey(x => x.RoutineId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => new { x.UserId, x.IsActive });
        });
        modelBuilder.Entity<DailyLog>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Note).HasMaxLength(1000).IsRequired();
            entity.HasOne(x => x.User).WithMany(x => x.DailyLogs).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Routine).WithMany(x => x.DailyLogs).HasForeignKey(x => x.RoutineId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => new { x.UserId, x.CompletedAt });
        });
        base.OnModelCreating(modelBuilder);
    }
}
