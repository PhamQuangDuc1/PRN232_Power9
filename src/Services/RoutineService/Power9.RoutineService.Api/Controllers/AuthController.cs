using Microsoft.AspNetCore.Mvc;
using Power9.RoutineService.Application.DTOs;
using Power9.RoutineService.Application.Interfaces;

namespace Power9.RoutineService.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(IAuthService auth) : ControllerBase
{
    [HttpPost("register")]
    [ProducesResponseType<AuthResponseDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Register(RegisterRequestDto request, CancellationToken cancellationToken)
    {
        var result = await auth.RegisterAsync(request, cancellationToken);
        return result is null ? Conflict(new { message = "Email hoặc username đã được sử dụng." }) : StatusCode(StatusCodes.Status201Created, result);
    }

    [HttpPost("login")]
    [ProducesResponseType<AuthResponseDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Login(LoginRequestDto request, CancellationToken cancellationToken)
    {
        var result = await auth.LoginAsync(request, cancellationToken);
        return result is null ? Unauthorized(new { message = "Email hoặc mật khẩu không đúng." }) : Ok(result);
    }
}
