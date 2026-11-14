using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Power9.RoutineService.Application.DTOs;
using Power9.RoutineService.Application.Interfaces;

namespace Power9.RoutineService.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/schedules")]
public sealed class SchedulesController(IScheduleService schedules) : ControllerBase
{
    [HttpGet("my-schedules")]
    public async Task<ActionResult<IReadOnlyList<ScheduleDto>>> GetMine(CancellationToken cancellationToken) =>
        Ok(await schedules.GetMineAsync(UserId, cancellationToken));

    [HttpPost]
    public async Task<ActionResult<ScheduleDto>> Create(CreateScheduleDto request, CancellationToken cancellationToken)
    {
        var result = await schedules.CreateAsync(UserId, request, cancellationToken);
        return result is null ? BadRequest(new { message = "Routine hoặc dữ liệu lịch không hợp lệ." }) : Created("/api/schedules/my-schedules", result);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ScheduleDto>> Update(int id, CreateScheduleDto request, CancellationToken cancellationToken)
    {
        var result = await schedules.UpdateAsync(UserId, id, request, cancellationToken);
        return result is null ? BadRequest(new { message = "Không tìm thấy lịch thuộc tài khoản hoặc dữ liệu không hợp lệ." }) : Ok(result);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken) =>
        await schedules.DeleteAsync(UserId, id, cancellationToken) ? NoContent() : NotFound();

    private int UserId => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
        ? id
        : throw new UnauthorizedAccessException("Token thiếu UserId.");
}
