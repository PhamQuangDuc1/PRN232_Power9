using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Power9.RoutineService.Api.Extensions;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------
// JWT Bearer (cấu hình kiểm tra token). Thành viên 1 sinh token trong AuthService
// với CÙNG Jwt:Key / Jwt:Issuer / Jwt:Audience và claim ClaimTypes.NameIdentifier = UserId.
// ---------------------------------------------------------------
var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Missing Jwt:Key");
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });
builder.Services.AddAuthorization();

// ---------------------------------------------------------------
// [THÀNH VIÊN 1] TODO: đăng ký Power9DbContext, Repositories, AuthService, RoutineService...
// ---------------------------------------------------------------

// [THÀNH VIÊN 2] gRPC client (RecommendationService) + Kafka producer
builder.Services.AddDistributedServices(builder.Configuration);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Power9 Routine API", Version = "v1" });
    var scheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Dán JWT token (không cần chữ 'Bearer ')",
        Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
    };
    c.AddSecurityDefinition("Bearer", scheme);
    c.AddSecurityRequirement(new OpenApiSecurityRequirement { { scheme, Array.Empty<string>() } });
});

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

// WebClient tĩnh (wwwroot/index.html) — plan Thành viên 1, bước 5.1
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

if (app.Environment.IsDevelopment())
{
    // Token test tạm thời cho Thành viên 2 khi AuthController của Thành viên 1 chưa xong. Chỉ bật ở Development.
    app.MapDevTokenEndpoint();
}

app.Run();
