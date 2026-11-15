// Kiểm tra kết quả gợi ý cho các tổ hợp thời gian ngồi, buổi trong ngày và mức căng thẳng.
using Power9.RecommendationGrpc.Engine;

namespace Power9.RecommendationGrpc.Tests;

public class RecommendationEngineTests
{
    private readonly RecommendationEngine _engine = new();

    // Nhiều bộ đầu vào kiểm tra thứ tự ưu tiên khi có hơn một điều kiện gợi ý phù hợp.
    [Theory]
    [InlineData(90, "Morning", "High", 3)]   // stress cao + ngồi lâu -> hít thở 4-7-8
    [InlineData(10, "Morning", "High", 4)]   // stress cao, mới ngồi -> thiền
    [InlineData(120, "Afternoon", "Low", 2)] // ngồi >= 90 -> đi bộ
    [InlineData(60, "Evening", "Medium", 1)] // ngồi >= 60 -> giãn cơ
    [InlineData(30, "Evening", "Low", 8)]    // buổi tối -> kết thúc ngày làm việc
    [InlineData(30, "Afternoon", "Low", 5)]  // buổi chiều -> uống nước
    [InlineData(30, "Morning", "Low", 6)]    // ngồi >= 20 -> chỉnh tư thế
    [InlineData(5, "Morning", "Low", 7)]     // còn lại -> nghỉ mắt
    public void Recommend_FollowsRulePriority(int sitting, string time, string stress, int expectedRoutineId)
    {
        var result = _engine.Recommend(sitting, time, stress);
        Assert.Equal(expectedRoutineId, result.RoutineId);
    }

    [Fact]
    public void Recommend_IsCaseInsensitive_AndHandlesNull()
    {
        Assert.Equal(RoutineCatalog.MiniMeditation, _engine.Recommend(0, null, "HIGH"));
        Assert.Equal(RoutineCatalog.EyeRest, _engine.Recommend(-5, null, null));
    }

    [Fact]
    public void Catalog_HasUniqueIds()
    {
        Assert.Equal(RoutineCatalog.All.Count, RoutineCatalog.All.Select(r => r.RoutineId).Distinct().Count());
    }
}
