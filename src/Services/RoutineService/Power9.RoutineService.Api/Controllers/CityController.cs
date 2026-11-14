using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Power9.RoutineService.Api.Extensions;
using Power9.RoutineService.Application.DTOs;
using Power9.RoutineService.Application.Interfaces;

namespace Power9.RoutineService.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public sealed class CityController : ControllerBase
{
    private readonly ICityService _cityService;
    private readonly ILogger<CityController> _logger;

    public CityController(ICityService cityService, ILogger<CityController> logger)
    {
        _cityService = cityService;
        _logger = logger;
    }

    [HttpGet("current")]
    public async Task<IActionResult> GetCurrent(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var room = await _cityService.GetCurrentRoomAsync(userId.Value, ct);
        if (room == null) return NoContent();

        return Ok(room);
    }

    [HttpGet("public-rooms")]
    public async Task<IActionResult> GetPublicRooms(CancellationToken ct)
    {
        var rooms = await _cityService.GetPublicRoomsAsync(ct);
        return Ok(rooms);
    }

    [HttpGet("archive")]
    public async Task<IActionResult> GetArchive(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var archive = await _cityService.GetArchivedRoomsAsync(userId.Value, ct);
        return Ok(archive);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var room = await _cityService.GetRoomByIdAsync(id, userId, ct);
        if (room == null) return NotFound(new { message = "Không tìm thấy thành phố" });

        return Ok(room);
    }

    [HttpGet("code/{code}")]
    public async Task<IActionResult> GetByCode(string code, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var room = await _cityService.GetRoomByCodeAsync(code, userId, ct);
        if (room == null) return NotFound(new { message = "Không tìm thấy phòng với mã này" });

        return Ok(room);
    }

    [HttpPost("create")]
    public async Task<IActionResult> Create([FromBody] CreateCityRoomRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var room = await _cityService.CreateRoomAsync(userId.Value, request, ct);
        return CreatedAtAction(nameof(GetById), new { id = room.Id }, room);
    }

    [HttpPost("quick-match")]
    public async Task<IActionResult> QuickMatch(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var room = await _cityService.QuickMatchAsync(userId.Value, ct);
        return Ok(room);
    }

    [HttpPost("join")]
    public async Task<IActionResult> Join([FromBody] JoinCityRoomRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        try
        {
            var room = await _cityService.JoinRoomAsync(userId.Value, request, ct);
            return Ok(room);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id:int}/toggle-privacy")]
    public async Task<IActionResult> TogglePrivacy(int id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var success = await _cityService.TogglePrivacyAsync(id, userId.Value, ct);
        if (!success) return Forbid();

        return Ok(new { message = "Đã cập nhật trạng thái riêng tư" });
    }

    [HttpPut("{id:int}/rooftop-status")]
    public async Task<IActionResult> UpdateRooftopStatus(int id, [FromBody] UpdateRooftopRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var success = await _cityService.UpdateRooftopStatusAsync(id, userId.Value, request, ct);
        if (!success) return BadRequest(new { message = "Không cập nhật được trạng thái nóc nhà" });

        return Ok(new { message = "Đã cập nhật trạng thái nóc nhà thành công" });
    }

    [HttpPost("{id:int}/interact")]
    public async Task<IActionResult> Interact(int id, [FromBody] InteractRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var success = await _cityService.InteractAsync(id, userId.Value, request, ct);
        if (!success) return BadRequest(new { message = "Tương tác không thành công" });

        return Ok(new { message = "Đã gửi tương tác thành công! Nhận thêm vật liệu xây dựng." });
    }

    [HttpPost("{id:int}/upgrade")]
    public async Task<IActionResult> Upgrade(int id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var result = await _cityService.UpgradeHouseAsync(id, userId.Value, ct);
        if (!result.Success) return BadRequest(new { message = result.Message });

        return Ok(result);
    }

    [HttpPost("{id:int}/leave")]
    public async Task<IActionResult> Leave(int id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var success = await _cityService.LeaveRoomAsync(id, userId.Value, ct);
        if (!success) return BadRequest(new { message = "Không thể rời phòng" });

        return Ok(new { message = "Đã rời phòng thành công (ngôi nhà của bạn vẫn được lưu giữ)" });
    }

    [HttpPut("{id:int}/admin-override")]
    public async Task<IActionResult> AdminOverride(int id, [FromBody] AdminOverrideCityRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var isAdmin = User.IsInRole("Administrator") || User.HasClaim(c => c.Type == System.Security.Claims.ClaimTypes.Role && c.Value == "Administrator");
        if (!isAdmin)
        {
            var currentRoom = await _cityService.GetRoomByIdAsync(id, userId.Value, ct);
            if (currentRoom == null || currentRoom.HostUserId != userId.Value)
            {
                return Forbid();
            }
        }

        var result = await _cityService.AdminOverrideCityAsync(id, request, ct);
        return Ok(new { success = true, data = result, message = "Đã cập nhật cấu hình thành phố thành công!" });
    }
}
