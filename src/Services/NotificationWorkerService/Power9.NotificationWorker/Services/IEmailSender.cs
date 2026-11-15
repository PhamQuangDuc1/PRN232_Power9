namespace Power9.NotificationWorker.Services;

public interface IEmailSender
{
    Task SendEmailAsync(string toEmail, string toName, string subject, string htmlBody, CancellationToken ct = default);
}
