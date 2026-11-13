FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/Common/Power9.Common/Power9.Common.csproj", "src/Common/Power9.Common/"]
COPY ["src/Common/Power9.GrpcContracts/Power9.GrpcContracts.csproj", "src/Common/Power9.GrpcContracts/"]
COPY ["src/Services/RecommendationService/Power9.RecommendationGrpc/Power9.RecommendationGrpc.csproj", "src/Services/RecommendationService/Power9.RecommendationGrpc/"]

RUN dotnet restore "src/Services/RecommendationService/Power9.RecommendationGrpc/Power9.RecommendationGrpc.csproj"
COPY . .
WORKDIR "/src/src/Services/RecommendationService/Power9.RecommendationGrpc"
RUN dotnet build "Power9.RecommendationGrpc.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Power9.RecommendationGrpc.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Power9.RecommendationGrpc.dll"]
