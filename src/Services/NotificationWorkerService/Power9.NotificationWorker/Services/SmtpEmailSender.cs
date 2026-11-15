// Gửi thư qua Gmail khi có cấu hình phù hợp và chuyển bản sao thử nghiệm tới Mailpit.
using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;

namespace Power9.NotificationWorker.Services;

public sealed class SmtpEmailSender : IEmailSender
{
    private readonly EmailSettings _settings;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(IOptions<EmailSettings> options, ILogger<SmtpEmailSender> logger)
    {
        _settings = options.Value;
        _logger = logger;
    }

    public async Task SendEmailAsync(string toEmail, string toName, string subject, string htmlBody, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(toEmail))
        {
            _logger.LogWarning("[EMAIL] Không thể gửi email: địa chỉ người nhận rỗng.");
            return;
        }

        var displayName = string.IsNullOrWhiteSpace(toName) ? toEmail : toName;
        var hasGmailCredentials = !string.IsNullOrWhiteSpace(_settings.Username) &&
                                  !string.IsNullOrWhiteSpace(_settings.Password) &&
                                  _settings.Username.Contains("@gmail.com", StringComparison.OrdinalIgnoreCase);

        // 1. Nếu có cấu hình tài khoản Gmail -> Gửi thẳng qua smtp.gmail.com:587 tới hộp thư Gmail thật
        if (hasGmailCredentials)
        {
            // Nếu tài khoản đang đăng nhập là mail mẫu (@power9.com / .local) -> tự động chuyển hướng về Gmail của bạn để nhận được thư thật trên điện thoại!
            var realRecipient = (toEmail.EndsWith("@power9.com", StringComparison.OrdinalIgnoreCase) ||
                                 toEmail.EndsWith(".local", StringComparison.OrdinalIgnoreCase))
                ? _settings.Username!.Trim()
                : toEmail.Trim();

            try
            {
                using var gmailClient = new SmtpClient("smtp.gmail.com", 587)
                {
                    EnableSsl = true,
                    UseDefaultCredentials = false,
                    Credentials = new NetworkCredential(_settings.Username!.Trim(), _settings.Password!.Replace(" ", "")),
                    Timeout = 10000
                };

                using var gmailMsg = new MailMessage
                {
                    From = new MailAddress(_settings.Username!.Trim(), _settings.SenderName),
                    Subject = subject,
                    Body = htmlBody,
                    IsBodyHtml = true,
                    BodyEncoding = System.Text.Encoding.UTF8,
                    SubjectEncoding = System.Text.Encoding.UTF8
                };
                gmailMsg.To.Add(new MailAddress(realRecipient, displayName));

                await gmailClient.SendMailAsync(gmailMsg, ct);
                _logger.LogInformation("[GMAIL SENT] Đã gửi thành công tới Gmail {Email} ({Name}) - Tiêu đề: {Subject}",
                    realRecipient, displayName, subject);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    "[GMAIL WARNING] Chưa gửi được qua smtp.gmail.com:587 tới {Email}: {Message}. " +
                    "(Lưu ý: Google yêu cầu Mật khẩu ứng dụng / App Password 16 ký tự tại https://myaccount.google.com/apppasswords thay vì mật khẩu đăng nhập thường).",
                    toEmail, ex.Message);
            }
        }

        // 2. Luôn gửi đồng thời vào Mailpit (nếu đang chạy ở localhost:1025 hoặc mailpit:1025) để đảm bảo Demo Web UI (:8025) luôn có thư
        var localHost = _settings.Host.Equals("smtp.gmail.com", StringComparison.OrdinalIgnoreCase) ? "localhost" : _settings.Host;
        var localPort = _settings.Port == 587 ? 1025 : _settings.Port;
        try
        {
            using var client = new SmtpClient(localHost, localPort)
            {
                EnableSsl = false,
                Timeout = 5000
            };

            using var message = new MailMessage
            {
                From = new MailAddress(
                    string.IsNullOrWhiteSpace(_settings.SenderEmail) ? "power9-assistant@power9.local" : _settings.SenderEmail,
                    _settings.SenderName),
                Subject = subject,
                Body = htmlBody,
                IsBodyHtml = true,
                BodyEncoding = System.Text.Encoding.UTF8,
                SubjectEncoding = System.Text.Encoding.UTF8
            };
            message.To.Add(new MailAddress(toEmail, displayName));

            await client.SendMailAsync(message, ct);
            _logger.LogInformation("[MAILPIT SENT] Đã lưu bản sao email vào Mailpit ({Host}:{Port}) cho {Email}",
                localHost, localPort, toEmail);
        }
        catch (Exception ex)
        {
            if (!hasGmailCredentials)
            {
                _logger.LogWarning("[EMAIL WARNING] Chưa gửi được email tới {Email} qua SMTP {Host}:{Port} ({Message})",
                    toEmail, localHost, localPort, ex.Message);
            }
        }
    }
}
