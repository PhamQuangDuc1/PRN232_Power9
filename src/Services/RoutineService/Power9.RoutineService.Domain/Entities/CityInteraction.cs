// Lưu một lượt tương tác giữa cư dân trong cùng phòng Tribe City.
using Power9.RoutineService.Domain.Enums;

namespace Power9.RoutineService.Domain.Entities;

public class CityInteraction
{
    public int Id { get; set; }
    public int RoomId { get; set; }
    public int FromUserId { get; set; }
    public int ToUserId { get; set; }
    public CityInteractionType ActionType { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public CityRoom Room { get; set; } = null!;
    public User FromUser { get; set; } = null!;
    public User ToUser { get; set; } = null!;
}
