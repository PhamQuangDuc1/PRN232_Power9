// Danh mục thói quen mẫu dùng làm đầu ra cho bộ máy gợi ý gRPC.
namespace Power9.RecommendationGrpc.Engine;

/// <summary>
/// Danh mục bài tập mà engine có thể gợi ý.
/// QUAN TRỌNG: RoutineId phải trùng với Id các Routine do Thành viên 1 seed trong DbInitializer
/// (xem docs/contract_giua_2_thanh_vien.md), vì Worker sẽ tra bảng Routines theo Id này khi check-in.
/// </summary>
public sealed record CatalogRoutine(
    int RoutineId,
    string Title,
    string CategoryName,
    int DurationMinutes,
    string Instruction,
    int RewardPoints);

public static class RoutineCatalog
{
    public static readonly CatalogRoutine NeckShoulderStretch = new(
        1, "Giãn cơ cổ vai gáy", "Move Often", 5,
        "Đứng dậy, xoay cổ chậm 5 vòng mỗi chiều, kéo giãn vai 30 giây mỗi bên.", 50);

    public static readonly CatalogRoutine QuickWalk = new(
        2, "Đi bộ nhanh 5 phút", "Move Often", 5,
        "Rời bàn làm việc, đi bộ quanh văn phòng hoặc lên xuống 2 tầng cầu thang.", 50);

    public static readonly CatalogRoutine Breathing478 = new(
        3, "Hít thở 4-7-8", "Manage Stress", 3,
        "Hít vào 4 giây, giữ 7 giây, thở ra 8 giây. Lặp lại 4 chu kỳ.", 40);

    public static readonly CatalogRoutine MiniMeditation = new(
        4, "Thiền tĩnh tâm 3 phút", "Manage Stress", 3,
        "Nhắm mắt, tập trung vào hơi thở, bỏ qua thông báo điện thoại trong 3 phút.", 40);

    public static readonly CatalogRoutine Hydration = new(
        5, "Uống một cốc nước", "Eat Well", 1,
        "Uống 250ml nước lọc, tránh đồ uống có đường vào buổi chiều.", 20);

    public static readonly CatalogRoutine PostureCheck = new(
        6, "Chỉnh tư thế ngồi", "Sit Smart", 2,
        "Lưng thẳng tựa ghế, màn hình ngang tầm mắt, hai bàn chân chạm sàn.", 30);

    public static readonly CatalogRoutine EyeRest = new(
        7, "Nghỉ mắt 20-20-20", "Sit Smart", 1,
        "Cứ 20 phút nhìn vật cách 6 mét trong 20 giây.", 20);

    public static readonly CatalogRoutine EveningShutdown = new(
        8, "Kết thúc ngày làm việc", "Work-Life Balance", 5,
        "Ghi 3 việc cần làm ngày mai, tắt thông báo công việc và rời bàn đúng giờ.", 40);

    public static IReadOnlyList<CatalogRoutine> All { get; } = new[]
    {
        NeckShoulderStretch, QuickWalk, Breathing478, MiniMeditation,
        Hydration, PostureCheck, EyeRest, EveningShutdown
    };
}
