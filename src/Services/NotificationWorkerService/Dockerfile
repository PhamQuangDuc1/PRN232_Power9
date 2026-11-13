FROM mcr.microsoft.com/dotnet/runtime:8.0 AS base
WORKDIR /app

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/Common/Power9.Common/Power9.Common.csproj", "src/Common/Power9.Common/"]
COPY ["src/Services/RoutineService/Power9.RoutineService.Domain/Power9.RoutineService.Domain.csproj", "src/Services/RoutineService/Power9.RoutineService.Domain/"]
COPY ["src/Services/NotificationWorkerService/Power9.NotificationWorker/Power9.NotificationWorker.csproj", "src/Services/NotificationWorkerService/Power9.NotificationWorker/"]

RUN dotnet restore "src/Services/NotificationWorkerService/Power9.NotificationWorker/Power9.NotificationWorker.csproj"
COPY . .
WORKDIR "/src/src/Services/NotificationWorkerService/Power9.NotificationWorker"
RUN dotnet build "Power9.NotificationWorker.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Power9.NotificationWorker.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Power9.NotificationWorker.dll"]
