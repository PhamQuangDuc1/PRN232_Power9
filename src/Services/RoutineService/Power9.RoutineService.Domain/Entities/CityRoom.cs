using Power9.RoutineService.Domain.Enums;

namespace Power9.RoutineService.Domain.Entities;

public class CityRoom
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RoomCode { get; set; } = string.Empty;
    public int HostUserId { get; set; }
    public bool IsPrivate { get; set; }
    public CityRoomStatus Status { get; set; } = CityRoomStatus.Active;
    public int MaxSlots { get; set; } = 12;
    public int TotalCityScore { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiredAt { get; set; }

    public User? HostUser { get; set; }
    public ICollection<CityResident> Residents { get; set; } = new List<CityResident>();
    public ICollection<CityInteraction> Interactions { get; set; } = new List<CityInteraction>();
}
