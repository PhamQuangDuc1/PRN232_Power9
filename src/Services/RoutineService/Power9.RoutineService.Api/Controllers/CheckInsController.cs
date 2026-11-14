using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Power9.Common.Constants;
using Power9.Common.Events;
using Power9.Common.Kafka;
using Power9.RoutineService.Api.Extensions;
using Power9.RoutineService.Application.Interfaces;

namespace Power9.RoutineService.Api.Controllers;

/// <summary>[THÀNH VIÊN 2] Check-in hoàn thành routine -> bắn event Kafka, Worker xử lý bất đồng bộ.</summary>
[ApiController]
[Route("api/routines")]
[Authorize]
public sealed class CheckInsController : ControllerBase
{
    private readonly IKafkaProducer _producer;
    private readonly ICityService _cityService;
    private readonly ILogger<CheckInsController> _logger;

    public CheckInsController(IKafkaProducer producer, ICityService cityService, ILogger<CheckInsController> logger)
    {
        _producer = producer;
        _cityService = cityService;
        _logger = logger;
    }

    /// <summary>Nhân viên xác nhận đã hoàn thành routine. Trả về 202 Accepted ngay, điểm được cộng ở Worker.</summary>
    [HttpPost("{routineId:int}/checkin")]
    [ProducesResponseType(typeof(CheckInAcceptedResponse), StatusCodes.Status202Accepted)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> CheckIn(int routineId, [FromBody] CheckInRequest? body, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized(new { message = "Token không chứa UserId" });
        if (routineId <= 0) return BadRequest(new { message = "routineId không hợp lệ" });

        var evt = new RoutineCompletedEvent
        {
            UserId = userId.Value,
            RoutineId = routineId,
            Note = body?.Note,
            BuildingMaterialsEarned = 50
        };

        // Realtime immediate local reward for Tribe City materials
        try
        {
            await _cityService.RewardMaterialsAsync(userId.Value, 50, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "City reward materials failed for user {UserId}", userId);
        }

        try
        {
            // Key = UserId -> các event của cùng 1 user vào cùng partition, giữ đúng thứ tự khi tính streak
            await _producer.PublishAsync(KafkaTopics.RoutineCompletedTopic, userId.Value.ToString(), evt, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Check-in publish Kafka offline/failed for user {UserId}", userId);
            // Vẫn chấp nhận check-in để UI hoạt động mượt mà ngay cả khi Kafka broker đang không chạy offline
        }

        return Accepted(new CheckInAcceptedResponse(evt.EventId, "Check-in đã được ghi nhận, nhận +50 vật liệu Tribe City"));
    }
}

public sealed record CheckInRequest(string? Note);
public sealed record CheckInAcceptedResponse(Guid EventId, string Message);
