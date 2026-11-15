// Hiện thực các repository bằng truy vấn EF Core tới SQL Server.
using Microsoft.EntityFrameworkCore;
using Power9.RoutineService.Application.Interfaces;
using Power9.RoutineService.Domain.Entities;
using Power9.RoutineService.Infrastructure.Data;

namespace Power9.RoutineService.Infrastructure.Repositories;

public sealed class UserRepository(Power9DbContext db) : IUserRepository
{
    public Task<User?> FindByEmailAsync(string email, CancellationToken ct = default) => db.Users.SingleOrDefaultAsync(x => x.Email == email.ToLower(), ct);
    public Task<bool> UsernameExistsAsync(string username, CancellationToken ct = default) => db.Users.AnyAsync(x => x.Username == username.ToLower(), ct);
    public Task<User?> FindByIdAsync(int id, CancellationToken ct = default) => db.Users.FindAsync(new object[] { id }, ct).AsTask();
    public Task AddAsync(User user, CancellationToken ct = default) => db.Users.AddAsync(user, ct).AsTask();
    public Task SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);
}

// Tập trung truy vấn danh mục, phân trang và các thao tác ghi thói quen.
public sealed class RoutineRepository(Power9DbContext db) : IRoutineRepository
{
    public async Task<IReadOnlyList<RoutineCategory>> GetCategoriesAsync(CancellationToken ct = default) => await db.RoutineCategories.AsNoTracking().OrderBy(x => x.DisplayOrder).ToListAsync(ct);
    public Task<Routine?> GetByIdAsync(int id, CancellationToken ct = default) => db.Routines.Include(x => x.Category).SingleOrDefaultAsync(x => x.Id == id, ct);
    public async Task<(IReadOnlyList<Routine> Items, int TotalCount)> SearchAsync(string? keyword, int? categoryId, int page, int pageSize, CancellationToken ct = default)
    {
        var query = db.Routines.AsNoTracking().Include(x => x.Category).Where(x => x.IsApproved);
        if (categoryId.HasValue) query = query.Where(x => x.CategoryId == categoryId.Value);
        if (!string.IsNullOrWhiteSpace(keyword)) query = query.Where(x => x.Title.Contains(keyword) || x.Description.Contains(keyword));
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Category.DisplayOrder).ThenBy(x => x.Title).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return (items, total);
    }
    public Task<bool> CategoryExistsAsync(int id, CancellationToken ct = default) => db.RoutineCategories.AnyAsync(x => x.Id == id, ct);
    public Task AddAsync(Routine routine, CancellationToken ct = default) => db.Routines.AddAsync(routine, ct).AsTask();
    public void Remove(Routine routine) => db.Routines.Remove(routine);
    public Task SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);
}

// Giới hạn truy vấn lịch theo người dùng để lớp nghiệp vụ thao tác trên đúng lịch cá nhân.
public sealed class ScheduleRepository(Power9DbContext db) : IScheduleRepository
{
    public async Task<IReadOnlyList<UserSchedule>> GetByUserAsync(int userId, CancellationToken ct = default) => await db.UserSchedules.AsNoTracking().Include(x => x.Routine).Where(x => x.UserId == userId).OrderBy(x => x.ReminderTime).ToListAsync(ct);
    public Task<UserSchedule?> GetByIdForUserAsync(int id, int userId, CancellationToken ct = default) => db.UserSchedules.Include(x => x.Routine).SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
    public Task<bool> RoutineExistsAsync(int routineId, CancellationToken ct = default) => db.Routines.AnyAsync(x => x.Id == routineId && x.IsApproved, ct);
    public Task AddAsync(UserSchedule schedule, CancellationToken ct = default) => db.UserSchedules.AddAsync(schedule, ct).AsTask();
    public void Remove(UserSchedule schedule) => db.UserSchedules.Remove(schedule);
    public Task SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);
}
