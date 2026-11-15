// Các kiểu dữ liệu cho thói quen, danh mục, bộ lọc và kết quả phân trang.
using System.ComponentModel.DataAnnotations;

namespace Power9.RoutineService.Application.DTOs;

public sealed record CategoryDto(int Id, string Name, string Description, string Icon, int DisplayOrder);
public sealed record RoutineDto(int Id, int CategoryId, string CategoryName, string Title, string Description, int DurationMinutes, string EnergyLevel, string TargetTimeOfDay, int RewardPoints, bool IsApproved);

public sealed class CreateRoutineDto
{
    [Range(1, int.MaxValue)] public int CategoryId { get; init; }
    [Required, StringLength(120)] public string Title { get; init; } = string.Empty;
    [Required, StringLength(2000)] public string Description { get; init; } = string.Empty;
    [Range(1, 1440)] public int DurationMinutes { get; init; }
    [Required, RegularExpression("^(Low|Medium|High)$")] public string EnergyLevel { get; init; } = "Low";
    [Required, RegularExpression("^(Morning|Afternoon|Evening|Anytime)$")] public string TargetTimeOfDay { get; init; } = "Anytime";
    [Range(0, 10000)] public int RewardPoints { get; init; }
    public bool IsApproved { get; init; } = true;
}

public sealed class RoutineFilterDto
{
    public string? SearchKeyword { get; init; }
    public int? CategoryId { get; init; }
    [Range(1, int.MaxValue)] public int PageNumber { get; init; } = 1;
    [Range(1, 100)] public int PageSize { get; init; } = 10;
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int PageNumber, int PageSize, int TotalCount, int TotalPages);
