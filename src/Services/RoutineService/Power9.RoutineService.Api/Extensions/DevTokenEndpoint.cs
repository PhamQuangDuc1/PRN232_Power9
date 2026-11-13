using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Power9.RoutineService.Api.Extensions;

public static class DevTokenEndpoint
{
    /// <summary>
    /// POST /api/dev/token?userId=1&amp;role=Employee  -> trả JWT để test Swagger.
    /// CHỈ dùng ở môi trường Development. Xoá khi AuthController thật đã hoàn thành.
    /// </summary>
    public static void MapDevTokenEndpoint(this WebApplication app)
    {
        app.MapPost("/api/dev/token", (int userId, string? role, IConfiguration config) =>
        {
            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
                new Claim(ClaimTypes.Role, string.IsNullOrWhiteSpace(role) ? "Employee" : role)
            };
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]!));
            var token = new JwtSecurityToken(
                issuer: config["Jwt:Issuer"],
                audience: config["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddHours(8),
                signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
            return Results.Ok(new { token = new JwtSecurityTokenHandler().WriteToken(token) });
        })
        .WithTags("Dev (chỉ Development)")
        .AllowAnonymous();
    }
}
