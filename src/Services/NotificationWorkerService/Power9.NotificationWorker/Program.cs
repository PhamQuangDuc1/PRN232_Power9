// Điểm vào của Notification Worker, phụ trách cấu hình email, SQL Server và các tác vụ nền.
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

// Chạy đồng thời vòng đọc Kafka, tác vụ nhắc lịch và tác vụ kết thúc chu kỳ Tribe City.
builder.Services.AddHostedService<RoutineCompletedConsumerWorker>();
builder.Services.AddHostedService<DailyScheduleReminderJob>();
builder.Services.AddHostedService<CityCycleWorker>();

var host = builder.Build();
host.Run();
