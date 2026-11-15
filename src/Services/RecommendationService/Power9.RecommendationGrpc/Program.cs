// Điểm vào của dịch vụ gRPC Recommendation, phụ trách đăng ký bộ máy gợi ý và mở kết nối HTTP/2.
using Power9.RecommendationGrpc.Engine;
using Power9.RecommendationGrpc.Services;

var builder = WebApplication.CreateBuilder(args);

// Kestrel chỉ nghe HTTP/2 (h2c, không TLS) - cấu hình trong appsettings.json (Kestrel:EndpointDefaults:Protocols)
builder.Services.AddGrpc(options => options.EnableDetailedErrors = builder.Environment.IsDevelopment());
// Dùng chung một bộ máy gợi ý vì việc chọn thói quen không cần trạng thái theo người dùng.
builder.Services.AddSingleton<IRecommendationEngine, RecommendationEngine>();

var app = builder.Build();

// Mở endpoint gRPC để Routine API gọi qua HTTP/2.
app.MapGrpcService<RecommendationGrpcService>();

app.Run();
