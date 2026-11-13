# HƯỚNG DẪN PHÂN CHIA CÔNG VIỆC VÀ TRIỂN KHAI MICROSERVICES POWER9

Dự án đã được khởi tạo thành công với cấu trúc Solution .NET 8 chuẩn Clean Architecture, sẵn sàng chạy độc lập từng service qua Docker hoặc chạy đồng loạt bằng Docker Compose.

---

## 1. BẢNG PHÂN CHIA CÔNG VIỆC (2 THÀNH VIÊN)

### 👤 THÀNH VIÊN 1: PHẦN DỄ (REST API & FRONTEND WEB)
> **Mục tiêu:** Xây dựng nghiệp vụ CRUD, phân quyền JWT và giao diện người dùng trực quan để demo.

*   **Thư mục làm việc chính:** `src/Services/RoutineService/` và `src/WebClient/`
*   **Các đầu việc cụ thể:**
    1.  **Domain & Database Entities (`Power9.RoutineService.Domain`):**
        *   Tạo các Entity: `User` (Id, Username, Email, PasswordHash, Role, Points, Streak), `RoutineCategory` (9 nhóm thói quen), `Routine` (Bài tập, thời lượng, độ khó), `UserSchedule` (Lịch cá nhân).
    2.  **Application & Logic (`Power9.RoutineService.Application`):**
        *   Tạo các DTOs, Service Interfaces (`IAuthService`, `IRoutineService`, `IScheduleService`).
        *   Viết logic Đăng ký, Đăng nhập (Sinh mã JWT Token kèm Role `Admin` / `Employee`).
        *   Viết logic CRUD cho Routine và Schedule (hỗ trợ phân trang, lọc theo category, tìm kiếm).
    3.  **Infrastructure & EF Core (`Power9.RoutineService.Infrastructure`):**
        *   Tạo `Power9DbContext`, cấu hình bảng và Fluent API.
        *   Tạo Migration ban đầu (`dotnet ef migrations add InitialCreate`) và hàm Seed Data (nạp sẵn 9 nhóm thói quen Power9 mẫu).
    4.  **Web API Controllers & Swagger (`Power9.RoutineService.Api`):**
        *   Tạo `AuthController` (`/api/auth/login`, `/api/auth/register`).
        *   Tạo `RoutinesController` (`[Authorize]`, CRUD bài tập, phân trang).
        *   Tạo `SchedulesController` (Nhân viên tự lên lịch thói quen).
    5.  **Web UI Client (`src/WebClient/` hoặc tĩnh trong `wwwroot`):**
        *   Xây dựng 1 trang Dashboard hiển thị 9 nhóm Routine, form tạo lịch và danh sách bài tập.
*   **Minh chứng bảo vệ:** Trình bày Slide 01-06 (Problem & Actors) và Demo Workflow 1 trên màn hình Web/Swagger.

---

### 👤 THÀNH VIÊN 2: PHẦN NÂNG CAO (gRPC, KAFKA BROKER & BACKGROUND WORKER)
> **Mục tiêu:** Xây dựng lõi kiến trúc phân tán (Distributed Core), giao tiếp liên service đồng bộ & bất đồng bộ, đóng gói Docker.

*   **Thư mục làm việc chính:** 
    *   `src/Services/RecommendationService/` (gRPC)
    *   `src/Services/NotificationWorkerService/` (Background Worker)
    *   `src/Common/` (Protobuf Contracts & Kafka)
    *   `docker-compose.yml`
*   **Các đầu việc cụ thể:**
    1.  **gRPC Recommendation Service (`Power9.RecommendationGrpc`):**
        *   Hiện thực service kế thừa từ `RecommendationProtoService.RecommendationProtoServiceBase` (dựa trên file `recommendation.proto`).
        *   Viết thuật toán gợi ý: Nhận `sitting_minutes`, `time_of_day`, `stress_level` -> Trả về bài tập giải tỏa căng thẳng hoặc giãn cơ phù hợp nhất.
        *   Tích hợp gRPC Client vào `Power9.RoutineService.Api` để REST API gọi sang gRPC lấy kết quả khi user bấm "Gợi ý".
    2.  **Kafka Producer & Consumer:**
        *   Đã có sẵn class `KafkaProducer` trong `Power9.Common`.
        *   Bổ sung endpoint `POST /api/routines/{id}/checkin` trong REST API: Khi user check-in -> Gọi `KafkaProducer.PublishAsync` bắn `RoutineCompletedEvent` vào topic `power9-routine-completed`.
    3.  **Background Worker Service (`Power9.NotificationWorker`):**
        *   Viết `KafkaConsumerWorker` (kế thừa `BackgroundService`): Lắng nghe topic `power9-routine-completed`. Khi nhận event -> Tự động kết nối DB cộng điểm thưởng (+50 Points), tăng streak ngày và ghi log hoàn thành.
        *   Viết `DailyReminderCronJob`: Định kỳ chạy (ví dụ mỗi giờ) để kiểm tra các lịch trình đến giờ nhắc nhở của nhân viên.
    4.  **Docker & Triển khai toàn hệ thống:**
        *   Kiểm tra `Dockerfile` cho từng service: `RoutineService`, `RecommendationService`, `NotificationWorkerService`.
        *   Chạy thử toàn bộ qua `docker-compose.yml`: Đảm bảo SQL Server, Kafka, Zookeeper và 3 Service .NET khởi động trơn tru.
*   **Minh chứng bảo vệ:** Trình bày Slide 07-16 (System Architecture, C4 Container, Message Broker, gRPC) và Demo Workflow 2 (Kafka Event + Worker log).

---

## 2. HƯỚNG DẪN CHẠY THỬ HỆ THỐNG QUA DOCKER COMPOSE

Khi đã cài Docker Desktop trên máy:
```bash
# 1. Di chuyển vào thư mục dự án
cd d:\hoc2026\prn232\ass

# 2. Khởi chạy toàn bộ hệ sinh thái (SQL Server, Kafka, gRPC, API, Worker)
docker compose up -d --build

# 3. Kiểm tra trạng thái các container đang chạy
docker compose ps

# 4. Xem log xử lý của Background Worker
docker compose logs -f notification-worker
```

*   **REST API Swagger UI:** `http://localhost:5000/swagger`
*   **gRPC Service:** `http://localhost:50051`
*   **SQL Server:** Kết nối qua SSMS tại `localhost,1433` (User: `sa`, Pass: `Password123!`). Các máy khác trong mạng LAN kết nối bằng `<IP_CUA_BAN>,1433`.
