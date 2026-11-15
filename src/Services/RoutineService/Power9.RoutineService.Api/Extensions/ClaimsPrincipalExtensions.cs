// Đọc mã người dùng từ claims xác thực để controller xác định người đang thực hiện thao tác.
using System.Security.Claims;

namespace Power9.RoutineService.Api.Extensions;

public static class ClaimsPrincipalExtensions
{
    /// <summary>
    /// Đọc UserId từ JWT. Hỗ trợ các claim phổ biến: NameIdentifier, "sub", "userId".
    /// Thành viên 1 khi sinh token nên dùng ClaimTypes.NameIdentifier = User.Id.
    /// </summary>
    public static int? GetUserId(this ClaimsPrincipal user)
    {
        var raw = user.FindFirstValue(ClaimTypes.NameIdentifier)
                  ?? user.FindFirstValue("sub")
                  ?? user.FindFirstValue("userId");
        return int.TryParse(raw, out var id) ? id : null;
    }
}
