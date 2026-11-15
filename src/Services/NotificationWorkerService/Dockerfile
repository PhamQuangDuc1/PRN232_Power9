# Build Notification Worker và đóng gói phần publish vào image .NET runtime.
FROM mcr.microsoft.com/dotnet/runtime:8.0 AS base
WORKDIR /app

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/Common/Power9.Common/Power9.Common.csproj", "src/Common/Power9.Common/"]
COPY ["src/Services/NotificationWorkerService/Power9.NotificationWorker/Power9.NotificationWorker.csproj", "src/Services/NotificationWorkerService/Power9.NotificationWorker/"]
RUN dotnet restore "src/Services/NotificationWorkerService/Power9.NotificationWorker/Power9.NotificationWorker.csproj"

COPY src/Common/Power9.Common/ src/Common/Power9.Common/
COPY src/Services/NotificationWorkerService/ src/Services/NotificationWorkerService/
WORKDIR "/src/src/Services/NotificationWorkerService/Power9.NotificationWorker"
RUN dotnet publish "Power9.NotificationWorker.csproj" -c Release -o /app/publish --no-restore

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Power9.NotificationWorker.dll"]
