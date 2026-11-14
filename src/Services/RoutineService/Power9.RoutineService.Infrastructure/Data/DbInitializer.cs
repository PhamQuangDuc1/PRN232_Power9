using Microsoft.EntityFrameworkCore;
using Power9.RoutineService.Application.Services;
using Power9.RoutineService.Domain.Entities;
using Power9.RoutineService.Domain.Enums;

namespace Power9.RoutineService.Infrastructure.Data;

public static class DbInitializer
{
    public static async Task SeedAsync(Power9DbContext db, CancellationToken cancellationToken = default)
    {
        if (!await db.Users.AnyAsync(x => x.Email == "admin@power9.com", cancellationToken))
            db.Users.Add(new User
            {
                Username = "admin", Email = "admin@power9.com", FullName = "Power9 Administrator",
                PasswordHash = PasswordHasher.Hash("Admin@123"), Role = UserRole.Admin
            });

        if (!await db.RoutineCategories.AnyAsync(cancellationToken))
        {
            var categories = new[]
            {
                ("Move Often", "Add movement throughout your day.", "🏃"),
                ("Sit Smart", "Build healthier sitting and screen habits.", "🪑"),
                ("Eat Well", "Make nourishing food choices.", "🥗"),
                ("Sleep Well", "Support consistent, restorative sleep.", "🌙"),
                ("Manage Stress", "Pause and reset when pressure builds.", "🧘"),
                ("Connect", "Make time for positive social connection.", "🤝"),
                ("Keep Learning", "Practice curiosity and skill building.", "📚"),
                ("Give Back", "Do something helpful for someone else.", "💛"),
                ("Be Mindful", "Notice the present moment with intention.", "🌿")
            };
            db.RoutineCategories.AddRange(categories.Select((c, i) => new RoutineCategory
            { Name = c.Item1, Description = c.Item2, Icon = c.Item3, DisplayOrder = i + 1 }));
            await db.SaveChangesAsync(cancellationToken);
        }

        if (!await db.Routines.AnyAsync(cancellationToken))
        {
            var categories = await db.RoutineCategories.OrderBy(c => c.DisplayOrder).ToListAsync(cancellationToken);
            var samples = new[]
            {
                ("Five-minute walk", "Take a brisk walk and loosen your shoulders.", 5, "Low", "Anytime"),
                ("Desk posture reset", "Adjust your posture and rest your eyes from the screen.", 2, "Low", "Afternoon"),
                ("Drink a glass of water", "Pause and drink a glass of water.", 2, "Low", "Anytime"),
                ("Wind-down breathing", "Take slow breaths before your evening routine.", 4, "Low", "Evening"),
                ("4-7-8 breathing", "Breathe in for 4, hold for 7, and exhale for 8.", 3, "Low", "Anytime"),
                ("Send a kind message", "Reach out to someone you appreciate.", 3, "Low", "Anytime"),
                ("Read for ten minutes", "Read a few pages of something you want to learn.", 10, "Low", "Anytime"),
                ("Help a teammate", "Offer practical help with a small task.", 5, "Medium", "Anytime"),
                ("One-minute mindfulness", "Notice your breathing and the sensations around you.", 1, "Low", "Anytime")
            };
            db.Routines.AddRange(samples.Select((s, i) => new Routine
            {
                CategoryId = categories[i].Id, Title = s.Item1, Description = s.Item2,
                DurationMinutes = s.Item3, EnergyLevel = s.Item4, TargetTimeOfDay = s.Item5,
                RewardPoints = 10, IsApproved = true
            }));
        }

        // Seed Sample Users and Tribe City Room
        if (!await db.CityRooms.AnyAsync(cancellationToken))
        {
            var admin = await db.Users.FirstOrDefaultAsync(x => x.Email == "admin@power9.com", cancellationToken);
            if (admin != null)
            {
                var sampleUsers = new[]
                {
                    ("mai.tran", "mai.tran@power9.com", "Trần Thị Mai", UserRole.Employee),
                    ("nam.le", "nam.le@power9.com", "Lê Văn Nam", UserRole.Employee),
                    ("lan.nguyen", "lan.nguyen@power9.com", "Nguyễn Hoàng Lan", UserRole.Employee),
                    ("duc.hoang", "duc.hoang@power9.com", "Hoàng Minh Đức", UserRole.Employee),
                    ("an.pham", "an.pham@power9.com", "Phạm Hoài An", UserRole.Employee)
                };

                var userList = new List<User> { admin };
                foreach (var (uName, uEmail, uFull, uRole) in sampleUsers)
                {
                    var existing = await db.Users.FirstOrDefaultAsync(u => u.Email == uEmail, cancellationToken);
                    if (existing == null)
                    {
                        existing = new User
                        {
                            Username = uName,
                            Email = uEmail,
                            FullName = uFull,
                            PasswordHash = PasswordHasher.Hash("User@123"),
                            Role = uRole,
                            TotalPoints = 180,
                            CurrentStreak = 4
                        };
                        db.Users.Add(existing);
                        await db.SaveChangesAsync(cancellationToken);
                    }
                    userList.Add(existing);
                }

                var sampleRoom = new CityRoom
                {
                    Name = "Thành Phố Xanh Power9",
                    RoomCode = "TRIBE8",
                    HostUserId = admin.Id,
                    IsPrivate = false,
                    Status = CityRoomStatus.Active,
                    MaxSlots = 12,
                    TotalCityScore = 620,
                    CreatedAt = DateTime.UtcNow.AddDays(-2),
                    ExpiredAt = DateTime.UtcNow.AddDays(5)
                };
                db.CityRooms.Add(sampleRoom);
                await db.SaveChangesAsync(cancellationToken);

                var residentConfigs = new[]
                {
                    ("Hôm nay quyết tâm uống đủ 2L nước! 💧", "modern", 3, 240, 0, 2),
                    ("Đang cày sprint cuối tuần 🚀", "cyberpunk", 4, 380, 1, 6),
                    ("Uống trà xanh & thiền 5 phút mỗi chiều 🍵", "japanese", 2, 190, 2, 8),
                    ("Trồng thêm hoa cho ban công xanh mát 🌸", "greenhouse", 2, 160, 4, 18),
                    ("Lâu ngày bận quá chưa check-in... 🍂", "modern", 1, 40, 5, 30), // mossy
                    ("Chào cả nhà! Mình mới tham gia đảo bay 🌤️", "coastal", 1, 90, 6, 4)
                };

                for (int i = 0; i < Math.Min(userList.Count, residentConfigs.Length); i++)
                {
                    var u = userList[i];
                    var (stat, theme, floors, mat, slot, hoursAgo) = residentConfigs[i];
                    db.CityResidents.Add(new CityResident
                    {
                        RoomId = sampleRoom.Id,
                        UserId = u.Id,
                        SlotIndex = slot,
                        HouseFloors = floors,
                        BuildingMaterials = mat,
                        RooftopStatus = stat,
                        Theme = theme,
                        LastCheckInAt = DateTime.UtcNow.AddHours(-hoursAgo),
                        IsActive = true,
                        JoinedAt = DateTime.UtcNow.AddDays(-2)
                    });
                }

                // Sample Friendships
                if (userList.Count >= 3)
                {
                    db.Friendships.Add(new Friendship
                    {
                        UserId = admin.Id,
                        FriendId = userList[1].Id,
                        Status = FriendshipStatus.Accepted,
                        CreatedAt = DateTime.UtcNow.AddDays(-2)
                    });
                    db.Friendships.Add(new Friendship
                    {
                        UserId = admin.Id,
                        FriendId = userList[2].Id,
                        Status = FriendshipStatus.Accepted,
                        CreatedAt = DateTime.UtcNow.AddDays(-1)
                    });
                }

                // Sample City Interaction
                db.CityInteractions.Add(new CityInteraction
                {
                    RoomId = sampleRoom.Id,
                    FromUserId = userList[1].Id,
                    ToUserId = admin.Id,
                    ActionType = CityInteractionType.Like,
                    CreatedAt = DateTime.UtcNow.AddHours(-3)
                });
                db.CityInteractions.Add(new CityInteraction
                {
                    RoomId = sampleRoom.Id,
                    FromUserId = userList[2].Id,
                    ToUserId = admin.Id,
                    ActionType = CityInteractionType.NudgeDrinkWater,
                    CreatedAt = DateTime.UtcNow.AddHours(-1)
                });
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
