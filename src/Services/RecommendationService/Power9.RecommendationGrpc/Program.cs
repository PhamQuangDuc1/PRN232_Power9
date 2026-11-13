using Power9.RecommendationGrpc.Engine;
using Power9.RecommendationGrpc.Services;

var builder = WebApplication.CreateBuilder(args);

// Kestrel chỉ nghe HTTP/2 (h2c, không TLS) - cấu hình trong appsettings.json (Kestrel:EndpointDefaults:Protocols)
builder.Services.AddGrpc(options => options.EnableDetailedErrors = builder.Environment.IsDevelopment());
builder.Services.AddSingleton<IRecommendationEngine, RecommendationEngine>();

var app = builder.Build();

app.MapGrpcService<RecommendationGrpcService>();

app.Run();
