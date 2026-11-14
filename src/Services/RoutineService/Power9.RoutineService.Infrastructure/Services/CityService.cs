using Microsoft.EntityFrameworkCore;
using Power9.RoutineService.Application.DTOs;
using Power9.RoutineService.Application.Interfaces;
using Power9.RoutineService.Domain.Entities;
using Power9.RoutineService.Domain.Enums;
using Power9.RoutineService.Infrastructure.Data;

namespace Power9.RoutineService.Infrastructure.Services;

public sealed class CityService : ICityService
{
    private readonly Power9DbContext _db;
    private static readonly Random _rng = new();

    public CityService(Power9DbContext db)
    {
        _db = db;
    }

    public async Task<CityRoomResponse?> GetCurrentRoomAsync(int userId, CancellationToken ct = default)
    {
        var resident = await _db.CityResidents
            .AsNoTracking()
            .Where(r => r.UserId == userId && r.IsActive)
            .OrderByDescending(r => r.Id)
            .FirstOrDefaultAsync(ct);

        if (resident == null) return null;

        var room = await _db.CityRooms
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == resident.RoomId && r.Status == CityRoomStatus.Active, ct);

        if (room == null) return null;

        return await GetRoomByIdAsync(room.Id, userId, ct);
    }

    public async Task<CityRoomResponse?> GetRoomByIdAsync(int roomId, int? currentUserId = null, CancellationToken ct = default)
    {
        var room = await _db.CityRooms
            .Include(r => r.HostUser)
            .Include(r => r.Residents).ThenInclude(res => res.User)
            .Include(r => r.Interactions).ThenInclude(i => i.FromUser)
            .Include(r => r.Interactions).ThenInclude(i => i.ToUser)
            .FirstOrDefaultAsync(r => r.Id == roomId, ct);

        if (room == null) return null;

        // Auto expire check
        if (room.Status == CityRoomStatus.Active && room.ExpiredAt <= DateTime.UtcNow)
        {
            room.Status = CityRoomStatus.Archived;
            await _db.SaveChangesAsync(ct);
        }

        return MapRoom(room, currentUserId);
    }

    public async Task<CityRoomResponse?> GetRoomByCodeAsync(string roomCode, int? currentUserId = null, CancellationToken ct = default)
    {
        var room = await _db.CityRooms
            .Include(r => r.HostUser)
            .Include(r => r.Residents).ThenInclude(res => res.User)
            .Include(r => r.Interactions).ThenInclude(i => i.FromUser)
            .Include(r => r.Interactions).ThenInclude(i => i.ToUser)
            .FirstOrDefaultAsync(r => r.RoomCode.ToUpper() == roomCode.Trim().ToUpper(), ct);

        if (room == null) return null;
        return MapRoom(room, currentUserId);
    }

    public async Task<IReadOnlyList<PublicRoomSummary>> GetPublicRoomsAsync(CancellationToken ct = default)
    {
        var rooms = await _db.CityRooms
            .AsNoTracking()
            .Include(r => r.HostUser)
            .Include(r => r.Residents)
            .Where(r => !r.IsPrivate && r.Status == CityRoomStatus.Active && r.ExpiredAt > DateTime.UtcNow)
            .OrderByDescending(r => r.CreatedAt)
            .Take(20)
            .ToListAsync(ct);

        return rooms.Select(r =>
        {
            var (lvl, _, _) = CalcLandmark(r.TotalCityScore);
            var remaining = r.ExpiredAt > DateTime.UtcNow ? r.ExpiredAt - DateTime.UtcNow : TimeSpan.Zero;
            return new PublicRoomSummary
            {
                Id = r.Id,
                Name = r.Name,
                RoomCode = r.RoomCode,
                ResidentCount = r.Residents.Count(res => res.IsActive),
                MaxSlots = r.MaxSlots,
                TotalCityScore = r.TotalCityScore,
                LandmarkLevel = lvl,
                RemainingTime = FormatRemaining(remaining),
                HostName = r.HostUser?.FullName ?? "Chủ phòng"
            };
        }).ToList();
    }

    public async Task<CityRoomResponse> CreateRoomAsync(int userId, CreateCityRoomRequest request, CancellationToken ct = default)
    {
        var user = await _db.Users.FindAsync(new object[] { userId }, ct)
            ?? throw new InvalidOperationException("Không tìm thấy người dùng");

        var roomCode = await GenerateUniqueRoomCodeAsync(ct);
        var room = new CityRoom
        {
            Name = string.IsNullOrWhiteSpace(request.Name) ? $"Thành Phố của {user.FullName}" : request.Name.Trim(),
            RoomCode = roomCode,
            HostUserId = userId,
            IsPrivate = request.IsPrivate,
            Status = CityRoomStatus.Active,
            MaxSlots = 12,
            TotalCityScore = 50,
            CreatedAt = DateTime.UtcNow,
            ExpiredAt = DateTime.UtcNow.AddDays(7)
        };

        _db.CityRooms.Add(room);
        await _db.SaveChangesAsync(ct);

        var resident = new CityResident
        {
            RoomId = room.Id,
            UserId = userId,
            SlotIndex = 0,
            HouseFloors = 1,
            BuildingMaterials = 100,
            RooftopStatus = string.IsNullOrWhiteSpace(request.RooftopStatus) ? "Chào mừng đến thành phố của tôi!" : request.RooftopStatus.Trim(),
            Theme = string.IsNullOrWhiteSpace(request.Theme) ? "modern" : request.Theme.Trim(),
            LastCheckInAt = DateTime.UtcNow,
            IsActive = true,
            JoinedAt = DateTime.UtcNow
        };

        _db.CityResidents.Add(resident);
        await _db.SaveChangesAsync(ct);

        return (await GetRoomByIdAsync(room.Id, userId, ct))!;
    }

    public async Task<CityRoomResponse> QuickMatchAsync(int userId, CancellationToken ct = default)
    {
        // Check if already in an active room
        var current = await GetCurrentRoomAsync(userId, ct);
        if (current != null) return current;

        // Find available public room
        var availableRooms = await _db.CityRooms
            .Include(r => r.Residents)
            .Where(r => !r.IsPrivate && r.Status == CityRoomStatus.Active && r.ExpiredAt > DateTime.UtcNow)
            .OrderBy(r => r.Residents.Count(res => res.IsActive))
            .ToListAsync(ct);

        foreach (var room in availableRooms)
        {
            var activeSlots = room.Residents.Where(r => r.IsActive).Select(r => r.SlotIndex).ToHashSet();
            if (activeSlots.Count < room.MaxSlots)
            {
                // Join this room
                var firstFreeSlot = Enumerable.Range(0, room.MaxSlots).FirstOrDefault(s => !activeSlots.Contains(s));
                var existingResident = await _db.CityResidents.FirstOrDefaultAsync(r => r.RoomId == room.Id && r.UserId == userId, ct);
                if (existingResident != null)
                {
                    existingResident.IsActive = true;
                    existingResident.SlotIndex = firstFreeSlot;
                }
                else
                {
                    _db.CityResidents.Add(new CityResident
                    {
                        RoomId = room.Id,
                        UserId = userId,
                        SlotIndex = firstFreeSlot,
                        HouseFloors = 1,
                        BuildingMaterials = 80,
                        RooftopStatus = "Chào cả nhà, mình vừa tham gia ghép nhanh!",
                        Theme = "modern",
                        LastCheckInAt = DateTime.UtcNow,
                        IsActive = true,
                        JoinedAt = DateTime.UtcNow
                    });
                }
                await _db.SaveChangesAsync(ct);
                return (await GetRoomByIdAsync(room.Id, userId, ct))!;
            }
        }

        // None available, create a new public room
        return await CreateRoomAsync(userId, new CreateCityRoomRequest
        {
            Name = $"Thành Phố Xanh #{_rng.Next(100, 999)}",
            IsPrivate = false,
            RooftopStatus = "Khởi đầu hành trình 7 ngày thói quen tốt!",
            Theme = "modern"
        }, ct);
    }

    public async Task<CityRoomResponse> JoinRoomAsync(int userId, JoinCityRoomRequest request, CancellationToken ct = default)
    {
        var room = await _db.CityRooms
            .Include(r => r.Residents)
            .FirstOrDefaultAsync(r => r.RoomCode.ToUpper() == request.RoomCode.Trim().ToUpper(), ct)
            ?? throw new InvalidOperationException("Mã phòng không tồn tại");

        if (room.Status != CityRoomStatus.Active || room.ExpiredAt <= DateTime.UtcNow)
            throw new InvalidOperationException("Phòng này đã kết thúc hoặc không còn hoạt động");

        var existingResident = room.Residents.FirstOrDefault(r => r.UserId == userId);
        if (existingResident != null)
        {
            existingResident.IsActive = true;
            if (!string.IsNullOrWhiteSpace(request.Theme)) existingResident.Theme = request.Theme;
            if (!string.IsNullOrWhiteSpace(request.RooftopStatus)) existingResident.RooftopStatus = request.RooftopStatus;
            await _db.SaveChangesAsync(ct);
            return (await GetRoomByIdAsync(room.Id, userId, ct))!;
        }

        var occupiedSlots = room.Residents.Where(r => r.IsActive).Select(r => r.SlotIndex).ToHashSet();
        if (occupiedSlots.Count >= room.MaxSlots)
            throw new InvalidOperationException("Phòng đã đủ 12 cư dân");

        int targetSlot = 0;
        if (request.PreferredSlot.HasValue && request.PreferredSlot.Value >= 0 && request.PreferredSlot.Value < room.MaxSlots && !occupiedSlots.Contains(request.PreferredSlot.Value))
        {
            targetSlot = request.PreferredSlot.Value;
        }
        else
        {
            targetSlot = Enumerable.Range(0, room.MaxSlots).First(s => !occupiedSlots.Contains(s));
        }

        _db.CityResidents.Add(new CityResident
        {
            RoomId = room.Id,
            UserId = userId,
            SlotIndex = targetSlot,
            HouseFloors = 1,
            BuildingMaterials = 80,
            RooftopStatus = string.IsNullOrWhiteSpace(request.RooftopStatus) ? "Xin chào cư dân thành phố!" : request.RooftopStatus.Trim(),
            Theme = string.IsNullOrWhiteSpace(request.Theme) ? "modern" : request.Theme.Trim(),
            LastCheckInAt = DateTime.UtcNow,
            IsActive = true,
            JoinedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(ct);
        return (await GetRoomByIdAsync(room.Id, userId, ct))!;
    }

    public async Task<bool> TogglePrivacyAsync(int roomId, int userId, CancellationToken ct = default)
    {
        var room = await _db.CityRooms.FirstOrDefaultAsync(r => r.Id == roomId && r.HostUserId == userId, ct);
        if (room == null) return false;

        room.IsPrivate = !room.IsPrivate;
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> UpdateRooftopStatusAsync(int roomId, int userId, UpdateRooftopRequest request, CancellationToken ct = default)
    {
        var resident = await _db.CityResidents.FirstOrDefaultAsync(r => r.RoomId == roomId && r.UserId == userId && r.IsActive, ct);
        if (resident == null) return false;

        if (!string.IsNullOrWhiteSpace(request.RooftopStatus))
        {
            resident.RooftopStatus = request.RooftopStatus.Trim().Length > 100
                ? request.RooftopStatus.Trim()[..100]
                : request.RooftopStatus.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.Theme))
        {
            resident.Theme = request.Theme.Trim();
        }

        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> InteractAsync(int roomId, int fromUserId, InteractRequest request, CancellationToken ct = default)
    {
        var room = await _db.CityRooms.Include(r => r.Residents).FirstOrDefaultAsync(r => r.Id == roomId, ct);
        if (room == null) return false;

        var fromResident = room.Residents.FirstOrDefault(r => r.UserId == fromUserId && r.IsActive);
        var toResident = room.Residents.FirstOrDefault(r => r.UserId == request.ToUserId && r.IsActive);
        if (fromResident == null || toResident == null) return false;

        if (!Enum.TryParse<CityInteractionType>(request.ActionType, true, out var actionType))
        {
            actionType = CityInteractionType.Like;
        }

        _db.CityInteractions.Add(new CityInteraction
        {
            RoomId = roomId,
            FromUserId = fromUserId,
            ToUserId = request.ToUserId,
            ActionType = actionType,
            CreatedAt = DateTime.UtcNow
        });

        // Small kudos bonus
        fromResident.BuildingMaterials += 10;
        toResident.BuildingMaterials += 15;
        room.TotalCityScore += 25;

        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<UpgradeResult> UpgradeHouseAsync(int roomId, int userId, CancellationToken ct = default)
    {
        var resident = await _db.CityResidents.FirstOrDefaultAsync(r => r.RoomId == roomId && r.UserId == userId && r.IsActive, ct);
        if (resident == null)
            return new UpgradeResult { Success = false, Message = "Bạn không phải là cư dân phòng này" };

        if (resident.HouseFloors >= 4)
            return new UpgradeResult { Success = false, Message = "Ngôi nhà đã đạt cấp tối đa (Cấp 4)!" };

        int cost = resident.HouseFloors * 100;
        if (resident.BuildingMaterials < cost)
            return new UpgradeResult
            {
                Success = false,
                Message = $"Bạn cần {cost} vật liệu để nâng lên Cấp {resident.HouseFloors + 1} (hiện có: {resident.BuildingMaterials})"
            };

        resident.BuildingMaterials -= cost;
        resident.HouseFloors += 1;

        var room = await _db.CityRooms.FindAsync(new object[] { roomId }, ct);
        if (room != null) room.TotalCityScore += 50;

        await _db.SaveChangesAsync(ct);
        return new UpgradeResult
        {
            Success = true,
            Message = $"Chúc mừng! Ngôi nhà của bạn đã vươn lên Cấp {resident.HouseFloors}!",
            NewFloors = resident.HouseFloors,
            RemainingMaterials = resident.BuildingMaterials
        };
    }

    public async Task<IReadOnlyList<ArchivedCitySummary>> GetArchivedRoomsAsync(int userId, CancellationToken ct = default)
    {
        var archivedResidentRooms = await _db.CityResidents
            .AsNoTracking()
            .Where(r => r.UserId == userId)
            .Select(r => r.RoomId)
            .Distinct()
            .ToListAsync(ct);

        var rooms = await _db.CityRooms
            .AsNoTracking()
            .Include(r => r.Residents).ThenInclude(res => res.User)
            .Where(r => (r.Status == CityRoomStatus.Archived || r.ExpiredAt <= DateTime.UtcNow) &&
                        (archivedResidentRooms.Contains(r.Id) || !r.IsPrivate))
            .OrderByDescending(r => r.ExpiredAt)
            .Take(30)
            .ToListAsync(ct);

        return rooms.Select(r =>
        {
            var mvp = r.Residents.OrderByDescending(res => res.HouseFloors).ThenByDescending(res => res.BuildingMaterials).FirstOrDefault();
            string rating = r.TotalCityScore >= 1000 ? "Cấp 1 - Đô thị Xanh Bền vững"
                          : r.TotalCityScore >= 500  ? "Cấp 2 - Đô thị Năng động"
                          : "Cấp 3 - Đô thị Khởi sắc";

            return new ArchivedCitySummary
            {
                Id = r.Id,
                Name = r.Name,
                RoomCode = r.RoomCode,
                CompletedAt = r.ExpiredAt,
                TotalScore = r.TotalCityScore,
                GreenCityRating = rating,
                MvpResidentName = mvp?.User?.FullName ?? "N/A",
                MvpMaxFloors = mvp?.HouseFloors ?? 1,
                TotalResidents = r.Residents.Count(res => res.IsActive)
            };
        }).ToList();
    }

    public async Task<bool> LeaveRoomAsync(int roomId, int userId, CancellationToken ct = default)
    {
        var resident = await _db.CityResidents.FirstOrDefaultAsync(r => r.RoomId == roomId && r.UserId == userId && r.IsActive, ct);
        if (resident == null) return false;

        resident.IsActive = false; // keeps house and slot intact as required
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task RewardMaterialsAsync(int userId, int materials, CancellationToken ct = default)
    {
        var resident = await _db.CityResidents
            .Where(r => r.UserId == userId && r.IsActive)
            .OrderByDescending(r => r.Id)
            .FirstOrDefaultAsync(ct);

        if (resident == null) return;

        var room = await _db.CityRooms.FirstOrDefaultAsync(r => r.Id == resident.RoomId && r.Status == CityRoomStatus.Active, ct);
        if (room == null || room.ExpiredAt <= DateTime.UtcNow) return;

        resident.BuildingMaterials += materials;
        resident.LastCheckInAt = DateTime.UtcNow;
        room.TotalCityScore += materials;

        // Auto floor check if reached 100 * floor
        if (resident.BuildingMaterials >= resident.HouseFloors * 100 && resident.HouseFloors < 7)
        {
            resident.HouseFloors += 1;
        }

        await _db.SaveChangesAsync(ct);
    }

    private static CityRoomResponse MapRoom(CityRoom room, int? currentUserId)
    {
        var (lvl, name, progress) = CalcLandmark(room.TotalCityScore);
        var remaining = room.ExpiredAt > DateTime.UtcNow ? room.ExpiredAt - DateTime.UtcNow : TimeSpan.Zero;
        var mvpResident = room.Residents
            .Where(r => r.IsActive)
            .OrderByDescending(r => r.HouseFloors)
            .ThenByDescending(r => r.BuildingMaterials)
            .FirstOrDefault();

        var residentDtos = room.Residents.Select(res =>
        {
            bool isMossy = res.LastCheckInAt == null || (DateTime.UtcNow - res.LastCheckInAt.Value).TotalHours >= 24;
            return new CityResidentDto
            {
                Id = res.Id,
                UserId = res.UserId,
                Username = res.User?.Username ?? "",
                FullName = res.User?.FullName ?? "Cư dân",
                SlotIndex = res.SlotIndex,
                HouseFloors = res.HouseFloors,
                BuildingMaterials = res.BuildingMaterials,
                RooftopStatus = res.RooftopStatus,
                Theme = res.Theme,
                IsActive = res.IsActive,
                LastCheckInAt = res.LastCheckInAt,
                IsMossy = isMossy,
                IsMvp = mvpResident != null && mvpResident.Id == res.Id && res.HouseFloors > 1,
                JoinedAt = res.JoinedAt
            };
        }).OrderBy(r => r.SlotIndex).ToList();

        var interactionDtos = room.Interactions
            .OrderByDescending(i => i.CreatedAt)
            .Take(15)
            .Select(i => new CityInteractionDto
            {
                Id = i.Id,
                FromUserId = i.FromUserId,
                FromUserName = i.FromUser?.FullName ?? "Đồng nghiệp",
                ToUserId = i.ToUserId,
                ToUserName = i.ToUser?.FullName ?? "Đồng nghiệp",
                ActionType = i.ActionType.ToString(),
                CreatedAt = i.CreatedAt
            }).ToList();

        return new CityRoomResponse
        {
            Id = room.Id,
            Name = room.Name,
            RoomCode = room.RoomCode,
            HostUserId = room.HostUserId,
            HostName = room.HostUser?.FullName ?? "Chủ phòng",
            IsHost = currentUserId.HasValue && room.HostUserId == currentUserId.Value,
            IsPrivate = room.IsPrivate,
            Status = room.Status.ToString(),
            MaxSlots = room.MaxSlots,
            TotalCityScore = room.TotalCityScore,
            LandmarkLevel = lvl,
            LandmarkName = name,
            LandmarkProgress = progress,
            CreatedAt = room.CreatedAt,
            ExpiredAt = room.ExpiredAt,
            RemainingTime = FormatRemaining(remaining),
            Residents = residentDtos,
            RecentInteractions = interactionDtos
        };
    }

    private static (int Level, string Name, int Progress) CalcLandmark(int score)
    {
        if (score < 250)
        {
            int p = Math.Clamp((int)(score / 250.0 * 100), 0, 100);
            return (0, "Khu đất hoang sơ (Đang xây dựng)", p);
        }
        if (score < 500)
        {
            int p = Math.Clamp((int)((score - 250) / 250.0 * 100), 0, 100);
            return (1, "Công viên cây xanh & Ghế đá", p);
        }
        if (score < 800)
        {
            int p = Math.Clamp((int)((score - 500) / 300.0 * 100), 0, 100);
            return (2, "Đài phun nước trung tâm", p);
        }
        return (3, "Tổ hợp thể thao & Vườn Zen hoàn mỹ", 100);
    }

    private static string FormatRemaining(TimeSpan span)
    {
        if (span <= TimeSpan.Zero) return "Đã hoàn thành";
        if (span.TotalDays >= 1) return $"Còn {(int)span.TotalDays} ngày {span.Hours} giờ";
        if (span.TotalHours >= 1) return $"Còn {(int)span.TotalHours} giờ {span.Minutes} phút";
        return $"Còn {span.Minutes} phút";
    }

    private async Task<string> GenerateUniqueRoomCodeAsync(CancellationToken ct)
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (int attempt = 0; attempt < 20; attempt++)
        {
            var code = new string(Enumerable.Range(0, 6).Select(_ => chars[_rng.Next(chars.Length)]).ToArray());
            if (!await _db.CityRooms.AnyAsync(r => r.RoomCode == code, ct))
                return code;
        }
        return "CITY" + _rng.Next(10, 99);
    }

    public async Task<CityRoomResponse> AdminOverrideCityAsync(int roomId, AdminOverrideCityRequest request, CancellationToken ct = default)
    {
        var room = await _db.CityRooms
            .Include(r => r.HostUser)
            .Include(r => r.Residents).ThenInclude(res => res.User)
            .FirstOrDefaultAsync(r => r.Id == roomId, ct)
            ?? throw new KeyNotFoundException($"Không tìm thấy thành phố với ID {roomId}");

        if (request.TotalCityScore.HasValue)
        {
            room.TotalCityScore = Math.Max(0, request.TotalCityScore.Value);
        }

        if (request.LandmarkLevel.HasValue)
        {
            var lvl = Math.Clamp(request.LandmarkLevel.Value, 0, 3);
            if (!request.TotalCityScore.HasValue)
            {
                room.TotalCityScore = lvl switch
                {
                    0 => 50,
                    1 => 260,
                    2 => 520,
                    3 => 850,
                    _ => room.TotalCityScore
                };
            }
        }

        if (request.TargetResidentId.HasValue)
        {
            var res = room.Residents.FirstOrDefault(r => r.Id == request.TargetResidentId.Value || r.UserId == request.TargetResidentId.Value);
            if (res != null)
            {
                if (request.HouseFloors.HasValue)
                    res.HouseFloors = Math.Clamp(request.HouseFloors.Value, 1, 4);

                if (request.BuildingMaterials.HasValue)
                    res.BuildingMaterials = Math.Max(0, request.BuildingMaterials.Value);

                if (!string.IsNullOrWhiteSpace(request.Theme))
                    res.Theme = request.Theme.Trim();

                if (request.IsMossy.HasValue)
                {
                    if (request.IsMossy.Value)
                    {
                        res.LastCheckInAt = DateTime.UtcNow.AddHours(-25);
                    }
                    else
                    {
                        res.LastCheckInAt = DateTime.UtcNow;
                    }
                }

                if (request.RooftopStatus != null)
                    res.RooftopStatus = request.RooftopStatus.Trim();
            }
        }

        await _db.SaveChangesAsync(ct);
        var updated = await GetRoomByIdAsync(room.Id, null, ct);
        return updated ?? throw new InvalidOperationException("Không thể tải thông tin phòng sau khi cập nhật");
    }
}
