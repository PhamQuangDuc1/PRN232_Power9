using Microsoft.EntityFrameworkCore;
using Power9.RoutineService.Application.DTOs;
using Power9.RoutineService.Application.Interfaces;
using Power9.RoutineService.Domain.Entities;
using Power9.RoutineService.Domain.Enums;
using Power9.RoutineService.Infrastructure.Data;

namespace Power9.RoutineService.Infrastructure.Services;

public sealed class FriendshipService : IFriendshipService
{
    private readonly Power9DbContext _db;

    public FriendshipService(Power9DbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<FriendDto>> GetFriendsAsync(int userId, CancellationToken ct = default)
    {
        var friendships = await _db.Friendships
            .AsNoTracking()
            .Include(f => f.User)
            .Include(f => f.Friend)
            .Where(f => f.UserId == userId || f.FriendId == userId)
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync(ct);

        return friendships.Select(f =>
        {
            bool isOutgoing = f.UserId == userId;
            var otherUser = isOutgoing ? f.Friend : f.User;
            return new FriendDto
            {
                FriendshipId = f.Id,
                UserId = otherUser?.Id ?? (isOutgoing ? f.FriendId : f.UserId),
                Username = otherUser?.Username ?? "user",
                FullName = otherUser?.FullName ?? "Đồng nghiệp",
                Status = f.Status.ToString(),
                IsOutgoing = isOutgoing,
                CreatedAt = f.CreatedAt
            };
        }).ToList();
    }

    public async Task<bool> SendRequestAsync(int userId, SendFriendRequest request, CancellationToken ct = default)
    {
        int targetUserId = 0;
        if (request.TargetUserId.HasValue && request.TargetUserId.Value > 0)
        {
            targetUserId = request.TargetUserId.Value;
        }
        else if (!string.IsNullOrWhiteSpace(request.UsernameOrEmail))
        {
            var u = await _db.Users
                .FirstOrDefaultAsync(x => x.Username == request.UsernameOrEmail.Trim() || x.Email == request.UsernameOrEmail.Trim(), ct);
            if (u != null) targetUserId = u.Id;
        }

        if (targetUserId <= 0 || targetUserId == userId) return false;

        // Check existing
        var existing = await _db.Friendships.FirstOrDefaultAsync(f =>
            (f.UserId == userId && f.FriendId == targetUserId) ||
            (f.UserId == targetUserId && f.FriendId == userId), ct);

        if (existing != null)
        {
            if (existing.Status == FriendshipStatus.Pending && existing.FriendId == userId)
            {
                existing.Status = FriendshipStatus.Accepted;
                await _db.SaveChangesAsync(ct);
                return true;
            }
            return false;
        }

        _db.Friendships.Add(new Friendship
        {
            UserId = userId,
            FriendId = targetUserId,
            Status = FriendshipStatus.Pending,
            CreatedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> AcceptRequestAsync(int userId, int friendshipId, CancellationToken ct = default)
    {
        var friendship = await _db.Friendships.FirstOrDefaultAsync(f => f.Id == friendshipId && f.FriendId == userId, ct);
        if (friendship == null) return false;

        friendship.Status = FriendshipStatus.Accepted;
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
