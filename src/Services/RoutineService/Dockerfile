FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/Common/Power9.Common/Power9.Common.csproj", "src/Common/Power9.Common/"]
COPY ["src/Common/Power9.GrpcContracts/Power9.GrpcContracts.csproj", "src/Common/Power9.GrpcContracts/"]
COPY ["src/Services/RoutineService/Power9.RoutineService.Domain/Power9.RoutineService.Domain.csproj", "src/Services/RoutineService/Power9.RoutineService.Domain/"]
COPY ["src/Services/RoutineService/Power9.RoutineService.Application/Power9.RoutineService.Application.csproj", "src/Services/RoutineService/Power9.RoutineService.Application/"]
COPY ["src/Services/RoutineService/Power9.RoutineService.Infrastructure/Power9.RoutineService.Infrastructure.csproj", "src/Services/RoutineService/Power9.RoutineService.Infrastructure/"]
COPY ["src/Services/RoutineService/Power9.RoutineService.Api/Power9.RoutineService.Api.csproj", "src/Services/RoutineService/Power9.RoutineService.Api/"]
RUN dotnet restore "src/Services/RoutineService/Power9.RoutineService.Api/Power9.RoutineService.Api.csproj"

COPY src/Common/ src/Common/
COPY src/Services/RoutineService/ src/Services/RoutineService/
WORKDIR "/src/src/Services/RoutineService/Power9.RoutineService.Api"
RUN dotnet publish "Power9.RoutineService.Api.csproj" -c Release -o /app/publish --no-restore /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Power9.RoutineService.Api.dll"]
