# Build dịch vụ Recommendation và đóng gói chỉ phần publish cần để phục vụ gRPC.
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/Common/Power9.Common/Power9.Common.csproj", "src/Common/Power9.Common/"]
COPY ["src/Common/Power9.GrpcContracts/Power9.GrpcContracts.csproj", "src/Common/Power9.GrpcContracts/"]
COPY ["src/Services/RecommendationService/Power9.RecommendationGrpc/Power9.RecommendationGrpc.csproj", "src/Services/RecommendationService/Power9.RecommendationGrpc/"]
RUN dotnet restore "src/Services/RecommendationService/Power9.RecommendationGrpc/Power9.RecommendationGrpc.csproj"

COPY src/Common/ src/Common/
COPY src/Services/RecommendationService/ src/Services/RecommendationService/
WORKDIR "/src/src/Services/RecommendationService/Power9.RecommendationGrpc"
RUN dotnet publish "Power9.RecommendationGrpc.csproj" -c Release -o /app/publish --no-restore

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Power9.RecommendationGrpc.dll"]
