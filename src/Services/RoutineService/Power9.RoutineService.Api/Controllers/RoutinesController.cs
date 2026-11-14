using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Power9.RoutineService.Application.DTOs;
using Power9.RoutineService.Application.Interfaces;

namespace Power9.RoutineService.Api.Controllers;

[ApiController]
[Route("api/routines")]
public sealed class RoutinesController(IRoutineService routines) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<PagedResult<RoutineDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<RoutineDto>>> Get([FromQuery] RoutineFilterDto filter, CancellationToken cancellationToken) =>
        Ok(await routines.GetRoutinesAsync(filter, cancellationToken));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<RoutineDto>> GetById(int id, CancellationToken cancellationToken)
    {
        var result = await routines.GetByIdAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<RoutineDto>> Create(CreateRoutineDto request, CancellationToken cancellationToken)
    {
        var result = await routines.CreateAsync(request, cancellationToken);
        return result is null ? BadRequest(new { message = "Danh mục không tồn tại." }) : CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<RoutineDto>> Update(int id, CreateRoutineDto request, CancellationToken cancellationToken)
    {
        var result = await routines.UpdateAsync(id, request, cancellationToken);
        return result is null ? NotFound(new { message = "Routine hoặc danh mục không tồn tại." }) : Ok(result);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken) =>
        await routines.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();
}
