using System.ComponentModel.DataAnnotations;

namespace Power9.RoutineService.Application.DTOs;

public sealed class LoginRequestDto
{
    [Required, EmailAddress] public string Email { get; init; } = string.Empty;
    [Required] public string Password { get; init; } = string.Empty;
}

public sealed class RegisterRequestDto
{
    [Required, StringLength(50, MinimumLength = 3)] public string Username { get; init; } = string.Empty;
    [Required, EmailAddress, StringLength(256)] public string Email { get; init; } = string.Empty;
    [Required, StringLength(100, MinimumLength = 8)] public string Password { get; init; } = string.Empty;
    [Required, StringLength(100)] public string FullName { get; init; } = string.Empty;
}

public sealed record AuthResponseDto(string Token, DateTime ExpiresAt, UserSummaryDto User);
public sealed record UserSummaryDto(int Id, string Username, string Email, string FullName, string Role, int TotalPoints, int CurrentStreak);
