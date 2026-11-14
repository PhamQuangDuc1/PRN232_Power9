# Power9 — Nội dung báo cáo Thành viên 1

Tài liệu này là bản nháp cho Slide 01–06 và Demo Workflow 1 của phần REST API, database, JWT và dashboard.

## Slide 01 — Vấn đề

- Nhân viên văn phòng thường ngồi lâu, tập trung liên tục và khó duy trì những thói quen chăm sóc sức khỏe nhỏ trong ngày.
- Các lời nhắc rời rạc khó gắn với lịch cá nhân; người dùng cũng khó thấy tiến bộ của mình.
- Power9 chia thay đổi thành những hoạt động ngắn, dễ chọn và dễ lên lịch.

**Thông điệp:** Một thay đổi nhỏ, lặp lại đều đặn, giúp ngày làm việc cân bằng hơn.

## Slide 02 — Giải pháp Power9

- Thư viện hoạt động chia thành 9 nhóm: Move Often, Sit Smart, Eat Well, Sleep Well, Manage Stress, Connect, Keep Learning, Give Back và Be Mindful.
- Người dùng tìm hoạt động theo tên hoặc nhóm, xem thời lượng và mức năng lượng, rồi lên lịch nhắc.
- Dashboard trình bày các nhóm, danh sách hoạt động, lịch cá nhân và phần gợi ý/check-in để kết nối với các service tương ứng.

## Slide 03 — Mục tiêu và phạm vi

- Quản lý routine và category bằng REST API.
- Tạo tài khoản, đăng nhập và bảo vệ thao tác bằng JWT Bearer.
- Quản trị viên tạo, sửa, xóa routine; nhân viên quản lý lịch nhắc của chính mình.
- Lưu dữ liệu bằng SQL Server với EF Core Code-First Migration.
- Cung cấp dashboard tĩnh để demo các luồng chính.

## Slide 04 — Tác nhân

| Tác nhân | Nhu cầu | Quyền chính |
|---|---|---|
| Employee | Tìm hoạt động phù hợp và lên lịch cá nhân | Xem category/routine; tạo, xem, sửa, xóa lịch của mình |
| Admin | Duy trì thư viện hoạt động | Các quyền Employee; tạo, sửa, xóa routine |

Tài khoản demo mặc định: `admin@power9.com` / `Admin@123`.

## Slide 05 — Luồng nghiệp vụ

1. Người dùng mở dashboard và xem 9 nhóm thói quen.
2. Nhân viên đăng ký hoặc đăng nhập; API trả JWT.
3. Nhân viên tìm routine theo từ khóa/nhóm, sau đó tạo lịch với giờ và các ngày trong tuần.
4. Lịch được giới hạn theo UserId trong JWT; người dùng chỉ thao tác trên lịch của mình.
5. Admin đăng nhập để thêm hoặc cập nhật routine trong thư viện.

**API chính:** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/categories`, `GET /api/routines`, `POST/PUT/DELETE /api/routines`, `GET/POST/PUT/DELETE /api/schedules`.

## Slide 06 — Thiết kế kỹ thuật và demo

- **Domain:** User, RoutineCategory, Routine, UserSchedule, DailyLog và UserRole.
- **Application:** DTOs, service interfaces, xác thực và nghiệp vụ.
- **Infrastructure:** EF Core DbContext, repositories, SQL Server migration và seed dữ liệu.
- **API:** Controllers, JWT authentication/authorization, Swagger Authorize.
- **Client:** HTML/CSS/JavaScript được phục vụ từ `wwwroot`.

### Kịch bản Demo Workflow 1

1. Chạy các service phụ thuộc và mở `http://localhost:5000` hoặc `/swagger`.
2. Đăng nhập tài khoản Admin demo; tạo thử một routine nếu muốn minh họa quyền quản trị.
3. Đăng ký một Employee mới, đăng nhập bằng tài khoản đó.
4. Chọn một category hoặc tìm “walk”; xem các thông tin thời lượng/điểm.
5. Bấm **Lên lịch**, nhập giờ và các ngày trong tuần; xác nhận lịch xuất hiện ở **Lịch nhắc của tôi**.
6. Thử cập nhật hoặc xóa lịch; gọi cùng endpoint với JWT trên Swagger để minh họa quyền sở hữu.
7. Đăng xuất và thử gọi endpoint cần đăng nhập để minh họa JWT.

Các nút check-in và gợi ý trên dashboard gọi các route đã định trong kế hoạch tích hợp; chúng cần service/API của phần Distributed Core hoạt động để trả kết quả.
