using Grpc.Core;
using Power9.GrpcContracts;
using Power9.RecommendationGrpc.Engine;

namespace Power9.RecommendationGrpc.Services;

public sealed class RecommendationGrpcService : RecommendationProtoService.RecommendationProtoServiceBase
{
    private readonly IRecommendationEngine _engine;
    private readonly ILogger<RecommendationGrpcService> _logger;

    public RecommendationGrpcService(IRecommendationEngine engine, ILogger<RecommendationGrpcService> logger)
    {
        _engine = engine;
        _logger = logger;
    }

    public override Task<RecommendationReply> GetRoutineRecommendation(RecommendationRequest request, ServerCallContext context)
    {
        if (request.SittingMinutes < 0 || request.SittingMinutes > 24 * 60)
        {
            throw new RpcException(new Status(StatusCode.InvalidArgument, "sitting_minutes phải nằm trong khoảng 0..1440"));
        }

        var routine = _engine.Recommend(request.SittingMinutes, request.CurrentTimeOfDay, request.StressLevel);

        _logger.LogInformation(
            "[gRPC] User {UserId} sitting={Sitting}m time={Time} stress={Stress} -> routine {RoutineId} '{Title}'",
            request.UserId, request.SittingMinutes, request.CurrentTimeOfDay, request.StressLevel,
            routine.RoutineId, routine.Title);

        return Task.FromResult(new RecommendationReply
        {
            RoutineId = routine.RoutineId,
            Title = routine.Title,
            CategoryName = routine.CategoryName,
            DurationMinutes = routine.DurationMinutes,
            Instruction = routine.Instruction,
            PotentialPoints = routine.RewardPoints
        });
    }
}
