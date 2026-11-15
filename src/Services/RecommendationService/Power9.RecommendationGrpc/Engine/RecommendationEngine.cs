// Áp dụng các quy tắc theo thời gian ngồi, buổi trong ngày và mức căng thẳng để chọn một thói quen.
namespace Power9.RecommendationGrpc.Engine;

public interface IRecommendationEngine
{
    CatalogRoutine Recommend(int sittingMinutes, string? timeOfDay, string? stressLevel);
}

/// <summary>
/// Rule engine đơn giản, thứ tự ưu tiên:
/// 1. Stress cao  -> Manage Stress
/// 2. Ngồi >= 90' -> đi bộ;  ngồi >= 60' -> giãn cơ
/// 3. Buổi tối    -> Work-Life Balance
/// 4. Buổi chiều  -> uống nước
/// 5. Còn lại     -> chỉnh tư thế (ngồi >= 20') hoặc nghỉ mắt
/// </summary>
public sealed class RecommendationEngine : IRecommendationEngine
{
    public CatalogRoutine Recommend(int sittingMinutes, string? timeOfDay, string? stressLevel)
    {
        var stress = Normalize(stressLevel);
        var time = Normalize(timeOfDay);
        var sitting = Math.Max(0, sittingMinutes);

        if (stress == "high")
            return sitting >= 60 ? RoutineCatalog.Breathing478 : RoutineCatalog.MiniMeditation;

        if (sitting >= 90) return RoutineCatalog.QuickWalk;
        if (sitting >= 60) return RoutineCatalog.NeckShoulderStretch;

        if (time == "evening") return RoutineCatalog.EveningShutdown;
        if (time == "afternoon") return RoutineCatalog.Hydration;

        return sitting >= 20 ? RoutineCatalog.PostureCheck : RoutineCatalog.EyeRest;
    }

    private static string Normalize(string? value) => (value ?? string.Empty).Trim().ToLowerInvariant();
}
