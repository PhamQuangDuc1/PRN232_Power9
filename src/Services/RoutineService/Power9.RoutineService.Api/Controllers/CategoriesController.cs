using Microsoft.AspNetCore.Mvc;
using Power9.RoutineService.Application.DTOs;
using Power9.RoutineService.Application.Interfaces;

namespace Power9.RoutineService.Api.Controllers;

[ApiController]
[Route("api/categories")]
public sealed class CategoriesController(IRoutineService routines) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<CategoryDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<CategoryDto>>> Get(CancellationToken cancellationToken) =>
        Ok(await routines.GetCategoriesAsync(cancellationToken));
}
