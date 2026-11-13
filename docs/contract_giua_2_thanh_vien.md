# CONTRACT GIỮA THÀNH VIÊN 1 VÀ THÀNH VIÊN 2

Phần của Thành viên 2 (gRPC, Kafka, Worker) đã xong và **phụ thuộc vào một số quy ước** mà Thành viên 1 phải giữ đúng khi làm Domain/EF Migration/Auth. Nếu đổi tên bảng/cột, báo cho Thành viên 2 sửa `WorkerDbContext`.

---

## 1. JWT (AuthService của Thành viên 1 sinh token)

Cấu hình kiểm tra token đã có sẵn trong `Power9.RoutineService.Api/Program.cs`, đọc từ `appsettings.json`:

| Key | Giá trị mặc định |
|---|---|
| `Jwt:Key` | `Power9-Dev-Secret-Key-Change-Me-At-Least-32-Chars!` |
| `Jwt:Issuer` | `Power9.RoutineService` |
| `Jwt:Audience` | `Power9.Clients` |

Token **bắt buộc** chứa:
- `ClaimTypes.NameIdentifier` = `User.Id` (số nguyên) → dùng cho check-in.
- `ClaimTypes.Role` = `Admin` hoặc `Employee`.

> Khi `AuthController` thật hoàn thành, **xoá** `Extensions/DevTokenEndpoint.cs` và dòng `app.MapDevTokenEndpoint();` trong `Program.cs`.

---

## 2. Tên bảng & cột Worker đọc/ghi (SQL Server, DB `Power9Db`)

Worker chỉ map các cột dưới đây. Các cột khác Thành viên 1 thêm thoải mái, **nhưng phải nullable hoặc có default** (vì Worker chèn `DailyLogs` mà không biết các cột đó).

| Bảng | Cột bắt buộc (tên + kiểu) | Worker làm gì |
|---|---|---|
| `Users` | `Id int PK`, `TotalPoints int`, `CurrentStreak int` | Cộng điểm, cập nhật streak |
| `Routines` | `Id int PK`, `Title nvarchar`, `RewardPoints int` | Lấy điểm thưởng + tên bài |
| `UserSchedules` | `Id int PK`, `UserId int`, `RoutineId int`, `ReminderTime time`, `DaysOfWeek nvarchar` (vd `"Mon,Wed,Fri"`, rỗng = mọi ngày), `IsActive bit` | Quét nhắc nhở mỗi 60s |
| `DailyLogs` | `Id int PK identity`, `UserId int`, `RoutineId int`, `CompletedAt datetime2` (UTC), `PointsEarned int`, `Note nvarchar NULL`, **`EventId uniqueidentifier NULL`** | Chèn 1 dòng mỗi lần check-in |

> [!IMPORTANT]
> `DailyLogs.EventId` dùng để **chống cộng điểm 2 lần** khi Kafka gửi lại message. Thành viên 1 nhớ thêm thuộc tính `public Guid? EventId { get; set; }` vào entity `DailyLog` và nên tạo **unique index (filtered, NOT NULL)**.

Mã viết tắt ngày trong `DaysOfWeek`: `Sun, Mon, Tue, Wed, Thu, Fri, Sat`.

---

## 3. Seed Routine (Id phải khớp gRPC catalog)

`RecommendationService` trả về `routine_id`, rồi client gọi `POST /api/routines/{routineId}/checkin`. Worker tra bảng `Routines` theo Id đó, nên `DbInitializer` của Thành viên 1 **phải seed các Routine với đúng Id sau** (xem `Engine/RoutineCatalog.cs`):

| Id | Title | Category | Phút | RewardPoints |
|---|---|---|---|---|
| 1 | Giãn cơ cổ vai gáy | Move Often | 5 | 50 |
| 2 | Đi bộ nhanh 5 phút | Move Often | 5 | 50 |
| 3 | Hít thở 4-7-8 | Manage Stress | 3 | 40 |
| 4 | Thiền tĩnh tâm 3 phút | Manage Stress | 3 | 40 |
| 5 | Uống một cốc nước | Eat Well | 1 | 20 |
| 6 | Chỉnh tư thế ngồi | Sit Smart | 2 | 30 |
| 7 | Nghỉ mắt 20-20-20 | Sit Smart | 1 | 20 |
| 8 | Kết thúc ngày làm việc | Work-Life Balance | 5 | 40 |

(Seed bằng `HasData` với Id cố định, hoặc `SET IDENTITY_INSERT`.)

---

## 4. Endpoint Thành viên 2 đã thêm vào REST API

| Method | URL | Auth | Mô tả |
|---|---|---|---|
| GET | `/api/recommendations/smart-suggest?sittingMinutes=90&timeOfDay=Afternoon&stressLevel=High` | JWT | REST → gRPC, trả bài tập gợi ý |
| POST | `/api/routines/{routineId}/checkin` body `{ "note": "..." }` | JWT | Bắn `RoutineCompletedEvent` vào Kafka, trả **202 Accepted** |
| POST | `/api/dev/token?userId=1&role=Employee` | — | **Chỉ Development**, token test tạm |

Khi Thành viên 1 thêm `RoutinesController` với route `api/routines`, không được trùng `POST {id}/checkin`.

---

## 5. Program.cs của API — chỗ Thành viên 1 chèn code

```csharp
// [THÀNH VIÊN 1] TODO: đăng ký Power9DbContext, Repositories, AuthService, RoutineService...
```
Chỉ thêm vào vị trí này; giữ nguyên phần JWT, `AddDistributedServices`, Swagger.
