# KẾ HOẠCH TRIỂN KHAI CHI TIẾT - THÀNH VIÊN 1
**Vai trò:** REST API, Database (EF Core), JWT Authentication & Web Client Frontend  
**Độ khó:** Dễ - Trung bình (Tập trung logic CRUD, xác thực và hiển thị giao diện trực quan)  
**Tỷ trọng điểm bảo vệ:** 30% - 40% (REST API 20% + UI/Swagger/Docs 10%)

---

## 🎯 MỤC TIÊU CẦN ĐẠT ĐƯỢC
1. Hoàn thiện dịch vụ **`RoutineService`** theo mô hình Clean Architecture (`Domain` -> `Application` -> `Infrastructure` -> `Api`).
2. Kết nối và tạo cơ sở dữ liệu trên **Microsoft SQL Server** bằng **EF Core Code-First Migrations**.
3. Cài đặt bảo mật **JWT Bearer Token** (Đăng ký, Đăng nhập, Phân quyền Role `Admin` và `Employee`).
4. Cung cấp đầy đủ các API CRUD: 9 nhóm Routine, Lịch trình cá nhân (Schedules) hỗ trợ Paging/Filter/Search.
5. Xây dựng một giao diện **Web Dashboard** (HTML/Bootstrap/JS) trực quan để demo được các luồng nghiệp vụ.
6. Chuẩn bị nội dung **Slide 01 - 06 (Problem & Actors)** và **Demo Workflow 1** khi báo cáo.

---

## 📋 DANH SÁCH CÁC BƯỚC THỰC HIỆN (STEP-BY-STEP)

### Giai đoạn 1: Thiết kế Domain Entities (`Power9.RoutineService.Domain`)
- [ ] **Bước 1.1:** Xóa file mẫu `Class1.cs`. Tạo thư mục `Entities/` và `Enums/`.
- [ ] **Bước 1.2:** Tạo enum `UserRole.cs` (`Admin`, `Employee`).
- [ ] **Bước 1.3:** Tạo Entity `User.cs`:
  - `Id` (int, PK), `Username` (string), `Email` (string), `PasswordHash` (string), `FullName` (string), `Role` (UserRole), `TotalPoints` (int), `CurrentStreak` (int), `CreatedAt` (DateTime).
- [ ] **Bước 1.4:** Tạo Entity `RoutineCategory.cs` (9 nhóm Power9):
  - `Id` (int, PK), `Name` (string - ví dụ: "Move Often", "Sit Smart", "Eat Well"...), `Description` (string), `Icon` (string), `DisplayOrder` (int).
- [ ] **Bước 1.5:** Tạo Entity `Routine.cs`:
  - `Id` (int, PK), `CategoryId` (int, FK), `Title` (string), `Description` (string), `DurationMinutes` (int), `EnergyLevel` (string: Low/Med/High), `TargetTimeOfDay` (string: Morning/Afternoon/Evening), `RewardPoints` (int), `IsApproved` (bool).
- [ ] **Bước 1.6:** Tạo Entity `UserSchedule.cs`:
  - `Id` (int, PK), `UserId` (int, FK), `RoutineId` (int, FK), `ReminderTime` (TimeSpan), `DaysOfWeek` (string - ví dụ: "Mon,Tue,Wed"), `IsActive` (bool).
- [ ] **Bước 1.7:** Tạo Entity `DailyLog.cs`:
  - `Id` (int, PK), `UserId` (int, FK), `RoutineId` (int, FK), `CompletedAt` (DateTime), `PointsEarned` (int), `Note` (string).

---

### Giai đoạn 2: Tầng Infrastructure & Cơ sở dữ liệu (`Power9.RoutineService.Infrastructure`)
- [ ] **Bước 2.1:** Tạo thư mục `Data/` và tạo class `Power9DbContext.cs`:
  - Kế thừa `DbContext`.
  - Khai báo các `DbSet<User>`, `DbSet<RoutineCategory>`, `DbSet<Routine>`, `DbSet<UserSchedule>`, `DbSet<DailyLog>`.
  - Cấu hình Fluent API trong `OnModelCreating` (Foreign Keys, Indexes, MaxLength).
- [ ] **Bước 2.2:** Viết class `DbInitializer.cs` (Seed Data):
  - Tự động nạp tài khoản admin mặc định (`admin@power9.com` / `Admin@123`).
  - Tự động nạp 9 nhóm thói quen chuẩn Power9 và các bài tập mẫu khi ứng dụng khởi động lần đầu.
- [ ] **Bước 2.3:** Tạo Migration đầu tiên:
  - Chạy lệnh: `dotnet ef migrations add InitialCreate -p src\Services\RoutineService\Power9.RoutineService.Infrastructure -s src\Services\RoutineService\Power9.RoutineService.Api`.
- [ ] **Bước 2.4:** Viết Repository hoặc Generic Repository để thao tác dữ liệu.

---

### Giai đoạn 3: Tầng Application & Nghiệp vụ (`Power9.RoutineService.Application`)
- [ ] **Bước 3.1:** Xóa `Class1.cs`. Tạo các thư mục: `DTOs/`, `Interfaces/`, `Services/`.
- [ ] **Bước 3.2:** Module Xác thực (`Auth`):
  - DTOs: `LoginRequestDto`, `RegisterRequestDto`, `AuthResponseDto` (chứa Token, UserInfo).
  - Interface: `IAuthService.cs`.
  - Triển khai `AuthService.cs`: Băm mật khẩu (BCrypt hoặc SHA256), kiểm tra đăng nhập, sinh JWT Token chứa Claim `UserId`, `Role`, `Email`.
- [ ] **Bước 3.3:** Module Thói quen (`Routines`):
  - DTOs: `RoutineDto`, `CreateRoutineDto`, `RoutineFilterDto` (SearchKeyword, CategoryId, PageNumber, PageSize).
  - Interface: `IRoutineService.cs`.
  - Triển khai `RoutineService.cs`: Hỗ trợ phân trang (Pagination), tìm kiếm theo tên và lọc theo nhóm.
- [ ] **Bước 3.4:** Module Lịch trình (`Schedules`):
  - DTOs: `ScheduleDto`, `CreateScheduleDto`.
  - Interface: `IScheduleService.cs`.
  - Triển khai `ScheduleService.cs`: Lấy danh sách lịch trình của User đang đăng nhập, thêm/sửa/xóa lịch.

---

### Giai đoạn 4: Tầng API Controllers & Cấu hình Swagger (`Power9.RoutineService.Api`)
- [ ] **Bước 4.1:** Cấu hình `Program.cs`:
  - Đăng ký `Power9DbContext` đọc Connection String từ `appsettings.json`.
  - Đăng ký JWT Authentication & Authorization.
  - Cấu hình Swagger UI có nút "Authorize" (ổ khóa) để test JWT token trực tiếp trên web.
  - Tự động gọi `db.Database.Migrate()` và `DbInitializer.SeedAsync()` khi start.
- [ ] **Bước 4.2:** Viết `AuthController.cs`:
  - `POST /api/auth/register` (Đăng ký tài khoản).
  - `POST /api/auth/login` (Đăng nhập -> Trả về JWT token).
- [ ] **Bước 4.3:** Viết `CategoriesController.cs`:
  - `GET /api/categories` (Lấy danh sách 9 nhóm thói quen).
- [ ] **Bước 4.4:** Viết `RoutinesController.cs`:
  - `GET /api/routines` (Hỗ trợ phân trang, lọc theo Category, tìm kiếm).
  - `GET /api/routines/{id}` (Xem chi tiết).
  - `POST /api/routines` (`[Authorize(Roles = "Admin")]` - Admin thêm bài tập mới).
  - `PUT /api/routines/{id}` & `DELETE /api/routines/{id}` (`[Authorize(Roles = "Admin")]`).
- [ ] **Bước 4.5:** Viết `SchedulesController.cs`:
  - `GET /api/schedules/my-schedules` (`[Authorize]` - Xem lịch cá nhân của User hiện tại).
  - `POST /api/schedules` (`[Authorize]` - Tạo lịch mới).
  - `DELETE /api/schedules/{id}` (`[Authorize]` - Hủy lịch).

---

### Giai đoạn 5: Web Client Frontend (Giao diện trực quan Demo)
- [ ] **Bước 5.1:** Bật tính năng Static Files trong `Program.cs` (`app.UseDefaultFiles()`, `app.UseStaticFiles()`).
- [ ] **Bước 5.2:** Tạo thư mục `wwwroot/` với các file `index.html`, `app.js`, `style.css`:
  - Form Đăng nhập / Đăng ký (Lưu JWT vào `localStorage`).
  - Dashboard hiển thị Card 9 nhóm thói quen Power9.
  - Bảng danh sách Routine và thanh tìm kiếm / phân trang.
  - Khu vực hiển thị Lịch trình cá nhân của nhân viên.
  - Nút bấm check-in hoặc gọi gợi ý (sẵn sàng kết nối với API của Thành viên 2).

---

## 🎤 CHUẨN BỊ BẢO VỆ (SLIDE & DEMO)
- **Slide đảm nhận:**
  - Slide 01: Giới thiệu dự án Power9 Office Routine.
  - Slide 02 & 03: Bối cảnh nhân viên ngồi nhiều mệt mỏi (Context & Problem).
  - Slide 04: Giải pháp tổng thể (Proposed Solution).
  - Slide 05: Đối tượng sử dụng (Actors: Admin & Employee).
  - Slide 06: Danh sách tính năng chính (Main Features).
- **Phần Demo:**
  - Mở Web Dashboard / Swagger UI: Đăng nhập tài khoản Nhân viên -> Xem danh sách Routine -> Lọc theo nhóm Move Often -> Lên lịch trình cá nhân.
