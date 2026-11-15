// Đăng ký Kafka producer và gRPC client mà Routine API dùng để gọi các dịch vụ khác.
using Power9.Common.Kafka;
using Power9.GrpcContracts;

namespace Power9.RoutineService.Api.Extensions;

/// <summary>
/// [THÀNH VIÊN 2] Đăng ký các thành phần phân tán: gRPC client + Kafka producer.
/// Program.cs chỉ cần gọi builder.Services.AddDistributedServices(builder.Configuration).
/// </summary>
public static class DistributedServiceExtensions
{
    public static IServiceCollection AddDistributedServices(this IServiceCollection services, IConfiguration configuration)
    {
        var grpcUrl = configuration["GrpcServices:RecommendationUrl"] ?? "http://localhost:50051";

        services.AddGrpcClient<RecommendationProtoService.RecommendationProtoServiceClient>(o =>
        {
            o.Address = new Uri(grpcUrl);
        });

        services.AddSingleton<IKafkaProducer, KafkaProducer>();

        return services;
    }
}
