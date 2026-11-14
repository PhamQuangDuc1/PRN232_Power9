using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Power9.RoutineService.Application.DTOs;
using Power9.RoutineService.Application.Interfaces;
using Power9.RoutineService.Domain.Entities;
using Power9.RoutineService.Domain.Enums;

namespace Power9.RoutineService.Application.Services;

public sealed class AuthService(IUserRepository users, IConfiguration configuration) : IAuthService
{
    public async Task<AuthResponseDto?> LoginAsync(LoginRequestDto request, CancellationToken cancellationToken = default)
    {
        var user = await users.FindByEmailAsync(request.Email.Trim().ToLowerInvariant(), cancellationToken);
        if (user is null || !PasswordHasher.Verify(request.Password, user.PasswordHash)) return null;
        return CreateResponse(user);
    }

    public async Task<AuthResponseDto?> RegisterAsync(RegisterRequestDto request, CancellationToken cancellationToken = default)
    {
        if (await users.FindByEmailAsync(request.Email.Trim().ToLowerInvariant(), cancellationToken) is not null ||
            await users.UsernameExistsAsync(request.Username.Trim(), cancellationToken)) return null;
        var user = new User
        {
            Username = request.Username.Trim().ToLowerInvariant(),
            Email = request.Email.Trim().ToLowerInvariant(),
            FullName = request.FullName.Trim(),
            PasswordHash = PasswordHasher.Hash(request.Password),
            Role = UserRole.Employee,
            CreatedAt = DateTime.UtcNow
        };
        await users.AddAsync(user, cancellationToken);
        await users.SaveChangesAsync(cancellationToken);
        return CreateResponse(user);
    }

    private AuthResponseDto CreateResponse(User user)
    {
        var keyText = configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured.");
        var issuer = configuration["Jwt:Issuer"] ?? "Power9";
        var audience = configuration["Jwt:Audience"] ?? "Power9Clients";
        var expires = DateTime.UtcNow.AddHours(8);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role.ToString())
        };
        var key = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(keyText));
        var token = new JwtSecurityToken(issuer, audience, claims, expires: expires,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new AuthResponseDto(new JwtSecurityTokenHandler().WriteToken(token), expires,
            new UserSummaryDto(user.Id, user.Username, user.Email, user.FullName, user.Role.ToString(), user.TotalPoints, user.CurrentStreak));
    }

}

public static class PasswordHasher
{
    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 120_000, HashAlgorithmName.SHA256, 32);
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string stored)
    {
        var parts = stored.Split('.', 2);
        if (parts.Length != 2) return false;
        try
        {
            var salt = Convert.FromBase64String(parts[0]);
            var expected = Convert.FromBase64String(parts[1]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, 120_000, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException) { return false; }
    }
}
