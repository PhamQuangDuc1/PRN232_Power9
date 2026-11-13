using Microsoft.EntityFrameworkCore;
using Power9.NotificationWorker.Data;
using Power9.NotificationWorker.Workers;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddDbContext<WorkerDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sql => sql.EnableRetryOnFailure(maxRetryCount: 5)));

builder.Services.AddHostedService<RoutineCompletedConsumerWorker>();
builder.Services.AddHostedService<DailyScheduleReminderJob>();

var host = builder.Build();
host.Run();
