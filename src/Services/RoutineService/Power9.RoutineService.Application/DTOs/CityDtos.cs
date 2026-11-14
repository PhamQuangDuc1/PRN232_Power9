namespace Power9.RoutineService.Application.DTOs;

public class CityResidentDto
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public int SlotIndex { get; set; }
    public int HouseFloors { get; set; }
    public int BuildingMaterials { get; set; }
    public string RooftopStatus { get; set; } = string.Empty;
    public string Theme { get; set; } = "modern";
    public bool IsActive { get; set; }
    public DateTime? LastCheckInAt { get; set; }
    public bool IsMossy { get; set; }
    public bool IsMvp { get; set; }
    public DateTime JoinedAt { get; set; }
}

public class CityInteractionDto
{
    public int Id { get; set; }
    public int FromUserId { get; set; }
    public string FromUserName { get; set; } = string.Empty;
    public int ToUserId { get; set; }
    public string ToUserName { get; set; } = string.Empty;
    public string ActionType { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class CityRoomResponse
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RoomCode { get; set; } = string.Empty;
    public int HostUserId { get; set; }
    public string HostName { get; set; } = string.Empty;
    public bool IsHost { get; set; }
    public bool IsPrivate { get; set; }
    public string Status { get; set; } = "Active";
    public int MaxSlots { get; set; } = 12;
    public int TotalCityScore { get; set; }
    public int LandmarkLevel { get; set; }
    public string LandmarkName { get; set; } = string.Empty;
    public int LandmarkProgress { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiredAt { get; set; }
    public string RemainingTime { get; set; } = string.Empty;
    public List<CityResidentDto> Residents { get; set; } = new();
    public List<CityInteractionDto> RecentInteractions { get; set; } = new();
}

public class CreateCityRoomRequest
{
    public string Name { get; set; } = string.Empty;
    public bool IsPrivate { get; set; }
    public string? Theme { get; set; } = "modern";
    public string? RooftopStatus { get; set; }
}

public class JoinCityRoomRequest
{
    public string RoomCode { get; set; } = string.Empty;
    public int? PreferredSlot { get; set; }
    public string? Theme { get; set; }
    public string? RooftopStatus { get; set; }
}

public class UpdateRooftopRequest
{
    public string RooftopStatus { get; set; } = string.Empty;
    public string? Theme { get; set; }
}

public class InteractRequest
{
    public int ToUserId { get; set; }
    public string ActionType { get; set; } = "Like"; // Like, NudgeDrinkWater, Cheer
}

public class PublicRoomSummary
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RoomCode { get; set; } = string.Empty;
    public int ResidentCount { get; set; }
    public int MaxSlots { get; set; } = 12;
    public int TotalCityScore { get; set; }
    public int LandmarkLevel { get; set; }
    public string RemainingTime { get; set; } = string.Empty;
    public string HostName { get; set; } = string.Empty;
}

public class ArchivedCitySummary
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RoomCode { get; set; } = string.Empty;
    public DateTime CompletedAt { get; set; }
    public int TotalScore { get; set; }
    public string GreenCityRating { get; set; } = string.Empty;
    public string MvpResidentName { get; set; } = string.Empty;
    public int MvpMaxFloors { get; set; }
    public int TotalResidents { get; set; }
}

public class UpgradeResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public int NewFloors { get; set; }
    public int RemainingMaterials { get; set; }
}

public class FriendDto
{
    public int FriendshipId { get; set; }
    public int UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Status { get; set; } = "Pending";
    public bool IsOutgoing { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class SendFriendRequest
{
    public int? TargetUserId { get; set; }
    public string? UsernameOrEmail { get; set; }
}

public class AdminOverrideCityRequest
{
    public int? LandmarkLevel { get; set; }
    public int? TotalCityScore { get; set; }
    public int? TargetResidentId { get; set; }
    public int? HouseFloors { get; set; }
    public int? BuildingMaterials { get; set; }
    public string? Theme { get; set; }
    public bool? IsMossy { get; set; }
    public bool? IsMvp { get; set; }
    public string? RooftopStatus { get; set; }
}
