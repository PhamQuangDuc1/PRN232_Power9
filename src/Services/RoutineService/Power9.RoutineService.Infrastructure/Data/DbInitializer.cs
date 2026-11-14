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
        await db.SaveChangesAsync(cancellationToken);
    }
}
