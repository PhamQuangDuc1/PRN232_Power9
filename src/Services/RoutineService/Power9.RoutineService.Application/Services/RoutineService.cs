using Power9.RoutineService.Application.DTOs;
using Power9.RoutineService.Application.Interfaces;
using Power9.RoutineService.Domain.Entities;

namespace Power9.RoutineService.Application.Services;

public sealed class RoutineService(IRoutineRepository routines) : IRoutineService
{
    public async Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken = default) =>
        (await routines.GetCategoriesAsync(cancellationToken)).Select(c => new CategoryDto(c.Id, c.Name, c.Description, c.Icon, c.DisplayOrder)).ToArray();

    public async Task<PagedResult<RoutineDto>> GetRoutinesAsync(RoutineFilterDto filter, CancellationToken cancellationToken = default)
    {
        var (items, total) = await routines.SearchAsync(filter.SearchKeyword?.Trim(), filter.CategoryId, filter.PageNumber, filter.PageSize, cancellationToken);
        return new PagedResult<RoutineDto>(items.Select(Map).ToArray(), filter.PageNumber, filter.PageSize, total, (int)Math.Ceiling(total / (double)filter.PageSize));
    }

    public async Task<RoutineDto?> GetByIdAsync(int id, CancellationToken cancellationToken = default) =>
        (await routines.GetByIdAsync(id, cancellationToken)) is { IsApproved: true } routine ? Map(routine) : null;

    public async Task<RoutineDto?> CreateAsync(CreateRoutineDto request, CancellationToken cancellationToken = default)
    {
        if (!await routines.CategoryExistsAsync(request.CategoryId, cancellationToken)) return null;
        var routine = new Routine();
        Apply(routine, request);
        await routines.AddAsync(routine, cancellationToken);
        await routines.SaveChangesAsync(cancellationToken);
        return (await routines.GetByIdAsync(routine.Id, cancellationToken)) is { } saved ? Map(saved) : null;
    }

    public async Task<RoutineDto?> UpdateAsync(int id, CreateRoutineDto request, CancellationToken cancellationToken = default)
    {
        var routine = await routines.GetByIdAsync(id, cancellationToken);
        if (routine is null || !await routines.CategoryExistsAsync(request.CategoryId, cancellationToken)) return null;
        Apply(routine, request);
        await routines.SaveChangesAsync(cancellationToken);
        return (await routines.GetByIdAsync(id, cancellationToken)) is { } saved ? Map(saved) : null;
    }

    public async Task<bool> DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var routine = await routines.GetByIdAsync(id, cancellationToken);
        if (routine is null) return false;
        routines.Remove(routine);
        await routines.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static void Apply(Routine routine, CreateRoutineDto dto)
    {
        routine.CategoryId = dto.CategoryId;
        routine.Title = dto.Title.Trim();
        routine.Description = dto.Description.Trim();
        routine.DurationMinutes = dto.DurationMinutes;
        routine.EnergyLevel = dto.EnergyLevel;
        routine.TargetTimeOfDay = dto.TargetTimeOfDay;
        routine.RewardPoints = dto.RewardPoints;
        routine.IsApproved = dto.IsApproved;
    }

    private static RoutineDto Map(Routine r) => new(r.Id, r.CategoryId, r.Category.Name, r.Title, r.Description,
        r.DurationMinutes, r.EnergyLevel, r.TargetTimeOfDay, r.RewardPoints, r.IsApproved);
}
