// Khai báo các thao tác lưu và truy vấn mà lớp nghiệp vụ cần từ tầng dữ liệu.
using Power9.RoutineService.Domain.Entities;

namespace Power9.RoutineService.Application.Interfaces;

public interface IUserRepository
{
    Task<User?> FindByEmailAsync(string email, CancellationToken cancellationToken = default);
    Task<bool> UsernameExistsAsync(string username, CancellationToken cancellationToken = default);
    Task<User?> FindByIdAsync(int id, CancellationToken cancellationToken = default);
    Task AddAsync(User user, CancellationToken cancellationToken = default);
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}

public interface IRoutineRepository
{
    Task<IReadOnlyList<RoutineCategory>> GetCategoriesAsync(CancellationToken cancellationToken = default);
    Task<Routine?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<(IReadOnlyList<Routine> Items, int TotalCount)> SearchAsync(string? keyword, int? categoryId, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<bool> CategoryExistsAsync(int categoryId, CancellationToken cancellationToken = default);
    Task AddAsync(Routine routine, CancellationToken cancellationToken = default);
    void Remove(Routine routine);
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}

public interface IScheduleRepository
{
    Task<IReadOnlyList<UserSchedule>> GetByUserAsync(int userId, CancellationToken cancellationToken = default);
    Task<UserSchedule?> GetByIdForUserAsync(int id, int userId, CancellationToken cancellationToken = default);
    Task<bool> RoutineExistsAsync(int routineId, CancellationToken cancellationToken = default);
    Task AddAsync(UserSchedule schedule, CancellationToken cancellationToken = default);
    void Remove(UserSchedule schedule);
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
