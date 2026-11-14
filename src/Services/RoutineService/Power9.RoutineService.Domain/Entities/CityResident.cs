namespace Power9.RoutineService.Domain.Entities;

public class CityResident
{
    public int Id { get; set; }
    public int RoomId { get; set; }
    public int UserId { get; set; }
    public int SlotIndex { get; set; }
    public int HouseFloors { get; set; } = 1;
    public int BuildingMaterials { get; set; } = 0;
    public string RooftopStatus { get; set; } = "Cùng nhau duy trì thói quen tốt!";
    public string Theme { get; set; } = "modern";
    public DateTime? LastCheckInAt { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    public CityRoom Room { get; set; } = null!;
    public User User { get; set; } = null!;
}
