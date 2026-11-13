namespace Power9.NotificationWorker.Domain;

public static class StreakCalculator
{
    /// <summary>
    /// Tính streak mới khi user hoàn thành một routine vào <paramref name="today"/>.
    /// - Đã có hoạt động hôm nay  -> giữ nguyên (tối thiểu 1)
    /// - Hoạt động gần nhất hôm qua -> +1
    /// - Ngắt quãng / lần đầu      -> 1
    /// </summary>
    public static int Next(int currentStreak, DateOnly? lastActivityDate, DateOnly today)
    {
        if (lastActivityDate is null) return 1;
        if (lastActivityDate.Value == today) return Math.Max(1, currentStreak);
        if (lastActivityDate.Value == today.AddDays(-1)) return currentStreak + 1;
        return 1;
    }
}

public static class VietnamTime
{
    private static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh");

    public static DateTime Now => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Zone);

    public static DateOnly ToLocalDate(DateTime utc) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), Zone));

    public static DateTime LocalDateStartUtc(DateOnly date) =>
        TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(TimeOnly.MinValue), Zone);
}
