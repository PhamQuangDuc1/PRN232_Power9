// Cung cấp các endpoint xem danh sách bạn bè, gửi lời mời và chấp nhận lời mời.
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Power9.RoutineService.Api.Extensions;
using Power9.RoutineService.Application.DTOs;
using Power9.RoutineService.Application.Interfaces;

namespace Power9.RoutineService.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public sealed class FriendsController : ControllerBase
{
    private readonly IFriendshipService _friendshipService;

    public FriendsController(IFriendshipService friendshipService)
    {
        _friendshipService = friendshipService;
    }

    [HttpGet]
    public async Task<IActionResult> GetFriends(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var friends = await _friendshipService.GetFriendsAsync(userId.Value, ct);
        return Ok(friends);
    }

    [HttpPost("request")]
    public async Task<IActionResult> SendRequest([FromBody] SendFriendRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var success = await _friendshipService.SendRequestAsync(userId.Value, request, ct);
        if (!success) return BadRequest(new { message = "Không thể gửi lời mời kết bạn (người dùng không tồn tại hoặc đã gửi trước đó)" });

        return Ok(new { message = "Đã gửi lời mời kết bạn thành công" });
    }

    [HttpPost("{id:int}/accept")]
    public async Task<IActionResult> AcceptRequest(int id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();

        var success = await _friendshipService.AcceptRequestAsync(userId.Value, id, ct);
        if (!success) return BadRequest(new { message = "Không tìm thấy lời mời kết bạn" });

        return Ok(new { message = "Đã đồng ý kết bạn thành công" });
    }
}
