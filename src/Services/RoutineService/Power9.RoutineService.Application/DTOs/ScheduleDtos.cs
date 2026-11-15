// Các kiểu dữ liệu tạo lịch và trả giờ nhắc, ngày lặp, trạng thái của lịch.
using System.ComponentModel.DataAnnotations;

namespace Power9.RoutineService.Application.DTOs;

public sealed class CreateScheduleDto
{
    [Range(1, int.MaxValue)] public int RoutineId { get; init; }
    public TimeSpan ReminderTime { get; init; }
    [Required, StringLength(100)] public string DaysOfWeek { get; init; } = string.Empty;
    public bool IsActive { get; init; } = true;
}

public sealed record ScheduleDto(int Id, int RoutineId, string RoutineTitle, TimeSpan ReminderTime, string DaysOfWeek, bool IsActive);
