namespace Power9.NotificationWorker.Services;

public sealed class EmailSettings
{
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 1025;
    public bool EnableSsl { get; set; } = false;
    public string SenderEmail { get; set; } = "power9-assistant@power9.local";
    public string SenderName { get; set; } = "Power9 Health Assistant";
    public string? Username { get; set; }
    public string? Password { get; set; }
}
