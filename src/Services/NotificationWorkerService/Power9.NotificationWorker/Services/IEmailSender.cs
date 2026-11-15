// Hợp đồng gửi email để các worker gọi mà không phụ thuộc trực tiếp vào SMTP.
namespace Power9.NotificationWorker.Services;

public interface IEmailSender
{
    Task SendEmailAsync(string toEmail, string toName, string subject, string htmlBody, CancellationToken ct = default);
}
