using Power9.RoutineService.Application.DTOs;

namespace Power9.RoutineService.Application.Interfaces;

public interface IAuthService
{
    Task<AuthResponseDto?> LoginAsync(LoginRequestDto request, CancellationToken cancellationToken = default);
    Task<AuthResponseDto?> RegisterAsync(RegisterRequestDto request, CancellationToken cancellationToken = default);
}

public interface IRoutineService
{
    Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken = default);
    Task<PagedResult<RoutineDto>> GetRoutinesAsync(RoutineFilterDto filter, CancellationToken cancellationToken = default);
    Task<RoutineDto?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<RoutineDto?> CreateAsync(CreateRoutineDto request, CancellationToken cancellationToken = default);
    Task<RoutineDto?> UpdateAsync(int id, CreateRoutineDto request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(int id, CancellationToken cancellationToken = default);
}

public interface IScheduleService
{
    Task<IReadOnlyList<ScheduleDto>> GetMineAsync(int userId, CancellationToken cancellationToken = default);
    Task<ScheduleDto?> CreateAsync(int userId, CreateScheduleDto request, CancellationToken cancellationToken = default);
    Task<ScheduleDto?> UpdateAsync(int userId, int id, CreateScheduleDto request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(int userId, int id, CancellationToken cancellationToken = default);
}
