using Microsoft.EntityFrameworkCore;
using Power9.NotificationWorker.Data;
using Power9.NotificationWorker.Services;
using Power9.NotificationWorker.Workers;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.Configure<EmailSettings>(builder.Configuration.GetSection("Smtp"));
builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();

builder.Services.AddDbContext<WorkerDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sql => sql.EnableRetryOnFailure(maxRetryCount: 5)));

builder.Services.AddHostedService<RoutineCompletedConsumerWorker>();
builder.Services.AddHostedService<DailyScheduleReminderJob>();
builder.Services.AddHostedService<CityCycleWorker>();

var host = builder.Build();
host.Run();
