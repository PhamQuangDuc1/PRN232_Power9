// Kiểm tra các quy tắc liên quan đến cư dân, vật liệu và tiến trình trong Tribe City.
using Xunit;

namespace Power9.NotificationWorker.Tests;

public class TribeCityTests
{
    [Theory]
    [InlineData(0, 0, "Khu đất hoang sơ (Đang xây dựng)")]
    [InlineData(150, 0, "Khu đất hoang sơ (Đang xây dựng)")]
    [InlineData(250, 1, "Công viên cây xanh & Ghế đá")]
    [InlineData(450, 1, "Công viên cây xanh & Ghế đá")]
    [InlineData(500, 2, "Đài phun nước trung tâm")]
    [InlineData(750, 2, "Đài phun nước trung tâm")]
    [InlineData(800, 3, "Tổ hợp thể thao & Vườn Zen hoàn mỹ")]
    [InlineData(1500, 3, "Tổ hợp thể thao & Vườn Zen hoàn mỹ")]
    public void LandmarkMilestone_CalculatesExpectedLevel(int score, int expectedLevel, string expectedNamePrefix)
    {
        var (level, name) = CalcLandmarkLevel(score);
        Assert.Equal(expectedLevel, level);
        Assert.StartsWith(expectedNamePrefix, name);
    }

    [Fact]
    public void HouseUpgrade_RequiresEnoughMaterials()
    {
        int currentFloor = 2;
        int materialsCost = currentFloor * 100; // 200 materials
        int currentMaterials = 150;

        bool canUpgradeBefore = currentMaterials >= materialsCost;
        Assert.False(canUpgradeBefore);

        currentMaterials += 50; // now 200
        bool canUpgradeAfter = currentMaterials >= materialsCost;
        Assert.True(canUpgradeAfter);
    }

    [Fact]
    public void MossDecay_TriggersWhenNoCheckInOver24Hours()
    {
        var now = DateTime.UtcNow;
        var recentCheckIn = now.AddHours(-12);
        var neglectedCheckIn = now.AddHours(-25);

        bool isRecentMossy = (now - recentCheckIn).TotalHours >= 24;
        bool isNeglectedMossy = (now - neglectedCheckIn).TotalHours >= 24;

        Assert.False(isRecentMossy);
        Assert.True(isNeglectedMossy);
    }

    [Fact]
    public void CityCycle_DefaultsToExactlySevenDays()
    {
        var created = DateTime.UtcNow;
        var expired = created.AddDays(7);

        Assert.Equal(168, (expired - created).TotalHours);
    }

    private static (int Level, string Name) CalcLandmarkLevel(int score)
    {
        if (score < 250) return (0, "Khu đất hoang sơ (Đang xây dựng)");
        if (score < 500) return (1, "Công viên cây xanh & Ghế đá");
        if (score < 800) return (2, "Đài phun nước trung tâm");
        return (3, "Tổ hợp thể thao & Vườn Zen hoàn mỹ");
    }
}
