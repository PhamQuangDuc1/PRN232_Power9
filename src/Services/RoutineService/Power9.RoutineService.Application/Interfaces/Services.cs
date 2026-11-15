// Khai báo các nghiệp vụ mà controller được gọi qua cơ chế dependency injection.
using Power9.RoutineService.Application.DTOs;

namespace Power9.RoutineService.Application.Interfaces;

public interface IAuthService
{
    Task<AuthResponseDto?> LoginAsync(LoginRequestDto request, CancellationToken cancellationToken = default);
    Task<AuthResponseDto?> RegisterAsync(RegisterRequestDto request, CancellationToken cancellationToken = default);
}

public interface IRoutineService
{
    Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken = default);
    Task<PagedResult<RoutineDto>> GetRoutinesAsync(RoutineFilterDto filter, CancellationToken cancellationToken = default);
    Task<RoutineDto?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<RoutineDto?> CreateAsync(CreateRoutineDto request, CancellationToken cancellationToken = default);
    Task<RoutineDto?> UpdateAsync(int id, CreateRoutineDto request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(int id, CancellationToken cancellationToken = default);
}

public interface IScheduleService
{
    Task<IReadOnlyList<ScheduleDto>> GetMineAsync(int userId, CancellationToken cancellationToken = default);
    Task<ScheduleDto?> CreateAsync(int userId, CreateScheduleDto request, CancellationToken cancellationToken = default);
    Task<ScheduleDto?> UpdateAsync(int userId, int id, CreateScheduleDto request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(int userId, int id, CancellationToken cancellationToken = default);
}

public interface ICityService
{
    Task<CityRoomResponse?> GetCurrentRoomAsync(int userId, CancellationToken cancellationToken = default);
    Task<CityRoomResponse?> GetRoomByIdAsync(int roomId, int? currentUserId = null, CancellationToken cancellationToken = default);
    Task<CityRoomResponse?> GetRoomByCodeAsync(string roomCode, int? currentUserId = null, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PublicRoomSummary>> GetPublicRoomsAsync(CancellationToken cancellationToken = default);
    Task<CityRoomResponse> CreateRoomAsync(int userId, CreateCityRoomRequest request, CancellationToken cancellationToken = default);
    Task<CityRoomResponse> QuickMatchAsync(int userId, CancellationToken cancellationToken = default);
    Task<CityRoomResponse> JoinRoomAsync(int userId, JoinCityRoomRequest request, CancellationToken cancellationToken = default);
    Task<bool> TogglePrivacyAsync(int roomId, int userId, CancellationToken cancellationToken = default);
    Task<bool> UpdateRooftopStatusAsync(int roomId, int userId, UpdateRooftopRequest request, CancellationToken cancellationToken = default);
    Task<bool> InteractAsync(int roomId, int fromUserId, InteractRequest request, CancellationToken cancellationToken = default);
    Task<UpgradeResult> UpgradeHouseAsync(int roomId, int userId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ArchivedCitySummary>> GetArchivedRoomsAsync(int userId, CancellationToken cancellationToken = default);
    Task<bool> LeaveRoomAsync(int roomId, int userId, CancellationToken cancellationToken = default);
    Task RewardMaterialsAsync(int userId, int materials, CancellationToken cancellationToken = default);
    Task<CityRoomResponse> AdminOverrideCityAsync(int roomId, AdminOverrideCityRequest request, CancellationToken cancellationToken = default);
}

public interface IFriendshipService
{
    Task<IReadOnlyList<FriendDto>> GetFriendsAsync(int userId, CancellationToken cancellationToken = default);
    Task<bool> SendRequestAsync(int userId, SendFriendRequest request, CancellationToken cancellationToken = default);
    Task<bool> AcceptRequestAsync(int userId, int friendshipId, CancellationToken cancellationToken = default);
}
