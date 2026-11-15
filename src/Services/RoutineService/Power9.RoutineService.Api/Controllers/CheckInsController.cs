// Nhận check-in, thưởng vật liệu cho Tribe City và chuyển việc ghi nhận điểm, chuỗi ngày sang worker qua Kafka.
using System.Net;
using System.Net.Mail;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Power9.Common.Constants;
using Power9.Common.Events;
using Power9.Common.Kafka;
using Power9.RoutineService.Api.Extensions;
using Power9.RoutineService.Application.Interfaces;

namespace Power9.RoutineService.Api.Controllers;

/// <summary>[THÀNH VIÊN 2] Check-in hoàn thành routine -> bắn event Kafka, Worker xử lý bất đồng bộ + hỗ trợ gửi test Gmail trực tiếp.</summary>
[ApiController]
[Route("api/routines")]
[Authorize]
public sealed class CheckInsController : ControllerBase
{
    private readonly IKafkaProducer _producer;
    private readonly ICityService _cityService;
    private readonly IConfiguration _config;
    private readonly ILogger<CheckInsController> _logger;

    public CheckInsController(IKafkaProducer producer, ICityService cityService, IConfiguration config, ILogger<CheckInsController> logger)
    {
        _producer = producer;
        _cityService = cityService;
        _config = config;
        _logger = logger;
    }

    /// <summary>Nhân viên xác nhận đã hoàn thành routine. Trả về 202 Accepted ngay, điểm được cộng ở Worker.</summary>
    [HttpPost("{routineId:int}/checkin")]
    [ProducesResponseType(typeof(CheckInAcceptedResponse), StatusCodes.Status202Accepted)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> CheckIn(int routineId, [FromBody] CheckInRequest? body, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized(new { message = "Token không chứa UserId" });
        if (routineId <= 0) return BadRequest(new { message = "routineId không hợp lệ" });

        var evt = new RoutineCompletedEvent
        {
            UserId = userId.Value,
            RoutineId = routineId,
            Note = body?.Note,
            BuildingMaterialsEarned = 50
        };

        // Realtime immediate local reward for Tribe City materials
        try
        {
            await _cityService.RewardMaterialsAsync(userId.Value, 50, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "City reward materials failed for user {UserId}", userId);
        }

        bool kafkaPublished = false;
        try
        {
            // Key = UserId -> các event của cùng 1 user vào cùng partition, giữ đúng thứ tự khi tính streak
            await _producer.PublishAsync(KafkaTopics.RoutineCompletedTopic, userId.Value.ToString(), evt, cancellationToken);
            kafkaPublished = true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Check-in publish Kafka offline/failed for user {UserId}", userId);
        }

        // Nếu Kafka/Worker đang tắt (chạy API đơn lẻ) hoặc có truyền ToEmail trực tiếp -> Gửi luôn email thông báo Check-in
        var targetEmail = !string.IsNullOrWhiteSpace(body?.ToEmail)
            ? body.ToEmail
            : User.FindFirstValue(ClaimTypes.Email);

        if ((!kafkaPublished || !string.IsNullOrWhiteSpace(body?.ToEmail)) && !string.IsNullOrWhiteSpace(targetEmail))
        {
            _ = Task.Run(() => SendDirectCheckInEmailAsync(targetEmail, User.Identity?.Name ?? "Bạn", routineId, body?.Note), CancellationToken.None);
        }

        // HTTP 202 cho phép giao diện phản hồi ngay. Điểm và chuỗi ngày được worker cập nhật qua Kafka.
        return Accepted(new CheckInAcceptedResponse(evt.EventId, "Check-in đã được ghi nhận, nhận +50 vật liệu Tribe City"));
    }

    /// <summary>Endpoint test gửi Email HTML trực tiếp về Gmail hoặc Mailpit (Không cần đăng nhập để dễ test nhanh trên Swagger).</summary>
    [HttpPost("test-email")]
    [AllowAnonymous]
    public async Task<IActionResult> SendTestEmail([FromBody] TestEmailRequest request, CancellationToken ct)
    {
        var toEmail = string.IsNullOrWhiteSpace(request.ToEmail)
            ? (_config["Smtp:Username"] ?? "zrya1236987@gmail.com")
            : request.ToEmail.Trim();

        var subject = string.IsNullOrWhiteSpace(request.Subject)
            ? "🎉 [Power9 Test] Thông báo Check-in & Nhắc lịch thành công!"
            : request.Subject;

        var (gmailOk, gmailMsg, mailpitOk) = await SendDirectCheckInEmailAsync(toEmail, request.RecipientName ?? "Bạn", 3, request.CustomNote ?? "Bài tập Hít thở 4-7-8 (+40 điểm, +50 vật liệu Tribe City)", subject, ct);

        return Ok(new
        {
            toEmail,
            gmailSent = gmailOk,
            gmailStatus = gmailMsg,
            mailpitSent = mailpitOk,
            mailpitWebUi = "http://localhost:8025"
        });
    }

    private async Task<(bool GmailOk, string GmailMsg, bool MailpitOk)> SendDirectCheckInEmailAsync(
        string toEmail, string toName, int routineId, string? note, string? customSubject = null, CancellationToken ct = default)
    {
        var username = _config["Smtp:Username"]?.Trim() ?? "";
        var password = _config["Smtp:Password"]?.Replace(" ", "") ?? "";
        var senderName = _config["Smtp:SenderName"] ?? "Power9 Health Assistant";

        var subject = customSubject ?? $"🎉 [Power9] Check-in thành công Routine #{routineId} (+50 vật liệu Tribe City)";
        var htmlBody = $@"
<div style='font-family: -apple-system, BlinkMacSystemFont, ""Segoe UI"", Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;'>
    <div style='background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 24px 20px; text-align: center; color: #ffffff;'>
        <h1 style='margin: 0; font-size: 22px; font-weight: 700;'>Tuyệt vời, {WebUtility.HtmlEncode(toName)}! 🎉</h1>
        <p style='margin: 6px 0 0; font-size: 14px; opacity: 0.95;'>Power9 Office Routine & Tribe City đã ghi nhận hoạt động của bạn</p>
    </div>
    <div style='padding: 24px 20px;'>
        <p style='font-size: 15px; color: #2d3748;'>Bạn vừa hoàn thành bài tập sức khỏe văn phòng (Mã bài tập: <strong>#{routineId}</strong>).</p>
        {(string.IsNullOrWhiteSpace(note) ? "" : $"<p style='font-size: 14px; color: #4a5568;'>📝 <em>Ghi chú: {WebUtility.HtmlEncode(note)}</em></p>")}
        <div style='background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 18px 0;'>
            <div style='font-size: 14px; color: #166534; margin-bottom: 6px;'>🧱 <strong>Vật liệu Tribe City:</strong> +50 Vật liệu xây dựng</div>
            <div style='font-size: 14px; color: #166534; margin-bottom: 6px;'>🔥 <strong>Trạng thái chuỗi ngày:</strong> Duy trì Streak liên tiếp</div>
            <div style='font-size: 14px; color: #166534;'>⏰ <strong>Thời gian ghi nhận:</strong> {DateTime.Now:HH:mm:ss dd/MM/yyyy}</div>
        </div>
        <div style='text-align: center; margin: 24px 0 12px;'>
            <a href='http://localhost:5000' style='display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 11px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;'>Mở Thành phố Tribe City</a>
        </div>
    </div>
</div>";

        bool gmailOk = false;
        string gmailMsg = "Chưa cấu hình Username/Password Gmail";
        if (!string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(password))
        {
            var realRecipient = (toEmail.EndsWith("@power9.com", StringComparison.OrdinalIgnoreCase) ||
                                 toEmail.EndsWith(".local", StringComparison.OrdinalIgnoreCase))
                ? username
                : toEmail.Trim();

            try
            {
                using var gmailClient = new SmtpClient("smtp.gmail.com", 587)
                {
                    EnableSsl = true,
                    UseDefaultCredentials = false,
                    Credentials = new NetworkCredential(username, password),
                    Timeout = 10000
                };
                using var msg = new MailMessage(new MailAddress(username, senderName), new MailAddress(realRecipient, toName))
                {
                    Subject = subject,
                    Body = htmlBody,
                    IsBodyHtml = true,
                    BodyEncoding = Encoding.UTF8,
                    SubjectEncoding = Encoding.UTF8
                };
                await gmailClient.SendMailAsync(msg, ct);
                gmailOk = true;
                gmailMsg = $"Đã gửi thành công qua smtp.gmail.com:587 tới {realRecipient}";
            }
            catch (Exception ex)
            {
                gmailMsg = $"Lỗi xác thực Gmail SMTP: {ex.Message} (Lưu ý: Google bắt buộc dùng 'Mật khẩu ứng dụng / App Password' 16 ký tự tạo tại https://myaccount.google.com/apppasswords thay vì mật khẩu đăng nhập thường).";
                _logger.LogWarning("[GMAIL TEST] {Message}", gmailMsg);
            }
        }

        bool mailpitOk = false;
        try
        {
            using var localClient = new SmtpClient("localhost", 1025) { EnableSsl = false, Timeout = 3000 };
            using var localMsg = new MailMessage(new MailAddress(string.IsNullOrWhiteSpace(username) ? "power9@power9.local" : username, senderName), new MailAddress(toEmail, toName))
            {
                Subject = subject,
                Body = htmlBody,
                IsBodyHtml = true,
                BodyEncoding = Encoding.UTF8,
                SubjectEncoding = Encoding.UTF8
            };
            await localClient.SendMailAsync(localMsg, ct);
            mailpitOk = true;
        }
        catch
        {
            // Mailpit không bật thì bỏ qua
        }

        return (gmailOk, gmailMsg, mailpitOk);
    }
}

public sealed record CheckInRequest(string? Note, string? ToEmail = null);
public sealed record TestEmailRequest(string? ToEmail = "zrya1236987@gmail.com", string? RecipientName = "Bạn", string? Subject = null, string? CustomNote = null);
public sealed record CheckInAcceptedResponse(Guid EventId, string Message);
