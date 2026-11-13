using Grpc.Core;
using Microsoft.AspNetCore.Authorization;
using GrpcStatusCode = Grpc.Core.StatusCode;
using Microsoft.AspNetCore.Mvc;
using Power9.GrpcContracts;
using Power9.RoutineService.Api.Extensions;

namespace Power9.RoutineService.Api.Controllers;

/// <summary>[THÀNH VIÊN 2] REST -> gRPC: lấy gợi ý bài tập từ RecommendationService.</summary>
[ApiController]
[Route("api/recommendations")]
[Authorize]
public sealed class RecommendationsController : ControllerBase
{
    private static readonly string[] AllowedTimes = { "Morning", "Afternoon", "Evening" };
    private static readonly string[] AllowedStress = { "Low", "Medium", "High" };

    private readonly RecommendationProtoService.RecommendationProtoServiceClient _client;
    private readonly ILogger<RecommendationsController> _logger;

    public RecommendationsController(RecommendationProtoService.RecommendationProtoServiceClient client,
        ILogger<RecommendationsController> logger)
    {
        _client = client;
        _logger = logger;
    }

    /// <summary>Gợi ý bài tập thông minh dựa trên thời gian ngồi, buổi trong ngày và mức stress.</summary>
    /// <param name="sittingMinutes">Số phút đã ngồi liên tục (0..1440)</param>
    /// <param name="timeOfDay">Morning | Afternoon | Evening (bỏ trống = tự tính theo giờ VN)</param>
    /// <param name="stressLevel">Low | Medium | High</param>
    [HttpGet("smart-suggest")]
    [ProducesResponseType(typeof(RecommendationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> SmartSuggest(
        [FromQuery] int sittingMinutes = 0,
        [FromQuery] string? timeOfDay = null,
        [FromQuery] string stressLevel = "Low",
        CancellationToken cancellationToken = default)
    {
        timeOfDay ??= CurrentTimeOfDay();
        if (!AllowedTimes.Contains(timeOfDay, StringComparer.OrdinalIgnoreCase))
            return BadRequest(new { message = "timeOfDay phải là Morning, Afternoon hoặc Evening" });
        if (!AllowedStress.Contains(stressLevel, StringComparer.OrdinalIgnoreCase))
            return BadRequest(new { message = "stressLevel phải là Low, Medium hoặc High" });

        var request = new RecommendationRequest
        {
            UserId = User.GetUserId() ?? 0,
            SittingMinutes = sittingMinutes,
            CurrentTimeOfDay = timeOfDay,
            StressLevel = stressLevel
        };

        try
        {
            var reply = await _client.GetRoutineRecommendationAsync(request,
                deadline: DateTime.UtcNow.AddSeconds(5), cancellationToken: cancellationToken);

            _logger.LogInformation("[REST->gRPC] User {UserId} got routine {RoutineId}", request.UserId, reply.RoutineId);

            return Ok(new RecommendationResponse(reply.RoutineId, reply.Title, reply.CategoryName,
                reply.DurationMinutes, reply.Instruction, reply.PotentialPoints));
        }
        catch (RpcException ex) when (ex.StatusCode == GrpcStatusCode.InvalidArgument)
        {
            return BadRequest(new { message = ex.Status.Detail });
        }
        catch (RpcException ex)
        {
            _logger.LogError(ex, "[REST->gRPC] Recommendation service unavailable");
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { message = "Dịch vụ gợi ý tạm thời không khả dụng", grpcStatus = ex.StatusCode.ToString() });
        }
    }

    private static string CurrentTimeOfDay()
    {
        var vnHour = TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Asia/Ho_Chi_Minh").Hour;
        return vnHour switch
        {
            < 12 => "Morning",
            < 18 => "Afternoon",
            _ => "Evening"
        };
    }
}

public sealed record RecommendationResponse(
    int RoutineId, string Title, string CategoryName, int DurationMinutes, string Instruction, int PotentialPoints);
