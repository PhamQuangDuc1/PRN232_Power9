// Kiểm tra thói quen, ngày lặp và quyền sở hữu trước khi lưu hoặc sửa lịch nhắc.
using Power9.RoutineService.Application.DTOs;
using Power9.RoutineService.Application.Interfaces;
using Power9.RoutineService.Domain.Entities;

namespace Power9.RoutineService.Application.Services;

public sealed class ScheduleService(IScheduleRepository schedules) : IScheduleService
{
    private static readonly HashSet<string> ValidDays = new(StringComparer.OrdinalIgnoreCase) { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" };

    public async Task<IReadOnlyList<ScheduleDto>> GetMineAsync(int userId, CancellationToken cancellationToken = default) =>
        (await schedules.GetByUserAsync(userId, cancellationToken)).Select(Map).ToArray();

    public async Task<ScheduleDto?> CreateAsync(int userId, CreateScheduleDto request, CancellationToken cancellationToken = default)
    {
        if (!await IsValidAsync(request, cancellationToken)) return null;
        var entity = new UserSchedule { UserId = userId };
        Apply(entity, request);
        await schedules.AddAsync(entity, cancellationToken);
        await schedules.SaveChangesAsync(cancellationToken);
        return (await schedules.GetByIdForUserAsync(entity.Id, userId, cancellationToken)) is { } created ? Map(created) : null;
    }

    public async Task<ScheduleDto?> UpdateAsync(int userId, int id, CreateScheduleDto request, CancellationToken cancellationToken = default)
    {
        var entity = await schedules.GetByIdForUserAsync(id, userId, cancellationToken);
        if (entity is null || !await IsValidAsync(request, cancellationToken)) return null;
        Apply(entity, request);
        await schedules.SaveChangesAsync(cancellationToken);
        return (await schedules.GetByIdForUserAsync(id, userId, cancellationToken)) is { } updated ? Map(updated) : null;
    }

    public async Task<bool> DeleteAsync(int userId, int id, CancellationToken cancellationToken = default)
    {
        var entity = await schedules.GetByIdForUserAsync(id, userId, cancellationToken);
        if (entity is null) return false;
        schedules.Remove(entity);
        await schedules.SaveChangesAsync(cancellationToken);
        return true;
    }

    // Kiểm tra giờ, danh sách ngày lặp và thói quen trước khi ghi lịch.
    private async Task<bool> IsValidAsync(CreateScheduleDto dto, CancellationToken ct) =>
        dto.ReminderTime >= TimeSpan.Zero && dto.ReminderTime < TimeSpan.FromDays(1) &&
        await schedules.RoutineExistsAsync(dto.RoutineId, ct) &&
        dto.DaysOfWeek.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Length > 0 &&
        dto.DaysOfWeek.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).All(ValidDays.Contains);

    private static void Apply(UserSchedule entity, CreateScheduleDto dto)
    {
        entity.RoutineId = dto.RoutineId;
        entity.ReminderTime = dto.ReminderTime;
        entity.DaysOfWeek = string.Join(',', dto.DaysOfWeek.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Distinct(StringComparer.OrdinalIgnoreCase));
        entity.IsActive = dto.IsActive;
    }

    private static ScheduleDto Map(UserSchedule s) => new(s.Id, s.RoutineId, s.Routine.Title, s.ReminderTime, s.DaysOfWeek, s.IsActive);
}
