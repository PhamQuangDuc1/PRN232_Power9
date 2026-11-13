using Power9.NotificationWorker.Data;
using Power9.NotificationWorker.Domain;
using Power9.NotificationWorker.Workers;

namespace Power9.NotificationWorker.Tests;

public class StreakCalculatorTests
{
    private static readonly DateOnly Today = new(2026, 11, 13);

    [Fact] public void FirstActivity_StartsAtOne() => Assert.Equal(1, StreakCalculator.Next(0, null, Today));
    [Fact] public void SameDay_KeepsStreak() => Assert.Equal(4, StreakCalculator.Next(4, Today, Today));
    [Fact] public void SameDay_ZeroStreak_BecomesOne() => Assert.Equal(1, StreakCalculator.Next(0, Today, Today));
    [Fact] public void Yesterday_Increments() => Assert.Equal(5, StreakCalculator.Next(4, Today.AddDays(-1), Today));
    [Fact] public void Gap_Resets() => Assert.Equal(1, StreakCalculator.Next(9, Today.AddDays(-3), Today));
}

public class ReminderWindowTests
{
    // 13/11/2026 là thứ Sáu (Fri)
    private static readonly DateTime From = new(2026, 11, 13, 9, 0, 0);
    private static readonly DateTime To = new(2026, 11, 13, 9, 1, 0);

    private static WorkerUserSchedule Schedule(string time, string days) =>
        new() { ReminderTime = TimeSpan.Parse(time), DaysOfWeek = days, IsActive = true };

    [Fact] public void InsideWindow_MatchingDay_IsDue() => Assert.True(DailyScheduleReminderJob.IsDue(Schedule("09:00:30", "Mon,Fri"), From, To));
    [Fact] public void EmptyDays_MeansEveryDay() => Assert.True(DailyScheduleReminderJob.IsDue(Schedule("09:01:00", ""), From, To));
    [Fact] public void WrongDay_NotDue() => Assert.False(DailyScheduleReminderJob.IsDue(Schedule("09:00:30", "Mon,Tue"), From, To));
    [Fact] public void WindowStartIsExclusive() => Assert.False(DailyScheduleReminderJob.IsDue(Schedule("09:00:00", "Fri"), From, To));
    [Fact] public void OutsideWindow_NotDue() => Assert.False(DailyScheduleReminderJob.IsDue(Schedule("10:00:00", "Fri"), From, To));
}
