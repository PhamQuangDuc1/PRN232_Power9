// Tạo DbContext cho lệnh dotnet ef khi chạy công cụ migration ngoài tiến trình API.
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Power9.RoutineService.Infrastructure.Data;

public sealed class Power9DbContextFactory : IDesignTimeDbContextFactory<Power9DbContext>
{
    public Power9DbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? "Server=localhost,1433;Database=Power9Db;User Id=sa;Password=Password123!;TrustServerCertificate=True;";
        var options = new DbContextOptionsBuilder<Power9DbContext>().UseSqlServer(connectionString).Options;
        return new Power9DbContext(options);
    }
}
