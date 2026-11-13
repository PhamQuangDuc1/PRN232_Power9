# KẾ HOẠCH TRIỂN KHAI CHI TIẾT - THÀNH VIÊN 2
**Vai trò:** Distributed Core (gRPC, Apache Kafka Broker, Background Worker) & Docker Deployment  
**Độ khó:** Nâng cao (Tập trung giao tiếp liên service, Event-Driven và đóng gói Container)  
**Tỷ trọng điểm bảo vệ:** 50% - 60% (Message Broker 15% + gRPC 15% + Background Job 10% + Docker 10%)

---

## 🎯 MỤC TIÊU CẦN ĐẠT ĐƯỢC
1. Hiện thực hóa dịch vụ **`RecommendationService`** chạy độc lập qua giao thức **gRPC (HTTP/2, Protobuf)**.
2. Thiết lập kết nối **gRPC Client** từ `RoutineService.Api` sang `RecommendationService` để nhận gợi ý bài tập tức thì.
3. Thiết lập **Apache Kafka Message Broker**: Viết **Kafka Producer** (phía API) và **Kafka Consumer** (phía Worker).
4. Xây dựng dịch vụ **`NotificationWorkerService`** chạy ngầm để:
   - Xử lý bất đồng bộ khi nhân viên Check-in: Tăng điểm thưởng, duy trì Streak ngày liên tục.
   - Chạy tác vụ định kỳ (**Scheduled Background Job**) quét nhắc nhở lịch trình sắp đến hạn.
5. Quản lý, kiểm thử và tối ưu hóa **`docker-compose.yml`** để toàn bộ hệ thống (SQL Server, Kafka, Zookeeper, API, gRPC, Worker) khởi chạy trơn tru chỉ với 1 câu lệnh.
6. Chuẩn bị nội dung **Slide 07 - 16 (System Architecture, C4 Container, Microservices, Broker, gRPC)** và **Demo Workflow 2 & 3**.

---

## 📋 DANH SÁCH CÁC BƯỚC THỰC HIỆN (STEP-BY-STEP)

### Giai đoạn 1: Hiện thực hóa gRPC Service (`Power9.RecommendationGrpc`)
- [ ] **Bước 1.1:** Kiểm tra hợp đồng Protobuf `src\Common\Power9.GrpcContracts\Protos\recommendation.proto`:
  - Service: `RecommendationProtoService`
  - RPC: `GetRoutineRecommendation(RecommendationRequest) returns (RecommendationReply)`
  - Request: `user_id`, `sitting_minutes`, `current_time_of_day`, `stress_level`.
  - Reply: `routine_id`, `title`, `category_name`, `duration_minutes`, `instruction`, `potential_points`.
- [ ] **Bước 1.2:** Viết class `RecommendationService.cs` (kế thừa `RecommendationProtoService.RecommendationProtoServiceBase`):
  - Viết thuật toán gợi ý dựa trên Rule engine đơn giản:
    - Nếu `sitting_minutes >= 60`: Gợi ý bài tập nhóm **Move Often** (Giãn cơ cổ vai gáy, đi bộ 5 phút).
    - Nếu `stress_level == "High"`: Gợi ý bài tập nhóm **Manage Stress** (Hít thở sâu 4-7-8, thiền 3 phút).
    - Nếu `current_time_of_day == "Afternoon"`: Gợi ý uống nước hoặc bài tập hồi phục năng lượng nhóm **Sit Smart**.
- [ ] **Bước 1.3:** Cấu hình `Program.cs` của gRPC Service:
  - Map gRPC Service: `app.MapGrpcService<RecommendationService>();`.
  - Cho phép giao tiếp HTTP/2 không mã hóa (h2c) trong môi trường Docker nội bộ.
- [ ] **Bước 1.4:** Tích hợp gRPC Client vào `Power9.RoutineService.Api`:
  - Đăng ký `RecommendationProtoServiceClient` trong `Program.cs` của API, đọc địa chỉ từ `appsettings.json` (`GrpcServices:RecommendationUrl`).
  - Tạo Controller `RecommendationsController.cs` trong REST API:
    - `GET /api/recommendations/smart-suggest?sittingMinutes=90&stressLevel=High`
    - Nhận request từ Web -> Gọi sang gRPC Service -> Nhận kết quả và trả về cho Web Client.

---

### Giai đoạn 2: Tích hợp Apache Kafka Message Broker
- [ ] **Bước 2.1:** Kiểm tra Kafka Topic & Event Model trong `Power9.Common`:
  - Topic: `power9-routine-completed` (Khai báo trong `KafkaTopics.cs`).
  - Event Model: `RoutineCompletedEvent.cs` (`EventId`, `UserId`, `RoutineId`, `RoutineTitle`, `PointsEarned`, `CompletedAt`).
- [ ] **Bước 2.2:** Hoàn thiện `KafkaProducer.cs` trong `Power9.Common`:
  - Khởi tạo `ProducerBuilder<string, string>` với cấu hình `BootstrapServers` lấy từ cấu hình.
  - Viết hàm `PublishAsync<T>(topic, key, message)`.
- [ ] **Bước 2.3:** Bổ sung Endpoint Check-in trong `Power9.RoutineService.Api`:
  - `POST /api/routines/{id}/checkin` (`[Authorize]`):
    - Đọc thông tin User từ JWT Token.
    - Gọi `KafkaProducer.PublishAsync(KafkaTopics.RoutineCompletedTopic, userId.ToString(), eventData)`.
    - Phản hồi ngay `200 OK` (Message: "Check-in event submitted successfully, processing in background").

---

### Giai đoạn 3: Xây dựng Background Worker Service (`Power9.NotificationWorker`)
- [ ] **Bước 3.1:** Viết `RoutineCompletedConsumerWorker.cs` (kế thừa `BackgroundService`):
  - Khởi tạo `ConsumerBuilder<string, string>` với `GroupId: "power9-worker-group"`, topic `power9-routine-completed`.
  - Lắng nghe liên tục trong vòng lặp `while (!stoppingToken.IsCancellationRequested)`.
  - Khi nhận message:
    - Deserialize ra đối tượng `RoutineCompletedEvent`.
    - Tạo Scope Service lấy `Power9DbContext`.
    - Tìm `User` trong Database: Cộng thêm `PointsEarned` vào `TotalPoints`, kiểm tra ngày check-in để tăng `CurrentStreak`.
    - Ghi thêm một bản ghi vào bảng `DailyLogs`.
    - Lưu lại DB và in Log thông báo: `[KAFKA CONSUMER] User {UserId} completed routine {RoutineTitle}, +{Points} points`.
- [ ] **Bước 3.2:** Viết `DailyScheduleReminderJob.cs` (Background Cron Job):
  - Sử dụng `PeriodicTimer` hoặc Timer chạy định kỳ mỗi 60 giây (để demo nhanh) hoặc mỗi giờ.
  - Quét trong bảng `UserSchedules`: Kiểm tra lịch trình nào đang active và gần khớp với giờ hiện tại.
  - In log thông báo mô phỏng gửi email / notification: `[REMINDER JOB] Reminder sent to User {UserId} for Routine {RoutineTitle}`.
- [ ] **Bước 3.3:** Cấu hình `Program.cs` của Worker:
  - Đăng ký kết nối SQL Server `Power9DbContext`.
  - Đăng ký cả 2 Hosted Services: `builder.Services.AddHostedService<RoutineCompletedConsumerWorker>();` và `builder.Services.AddHostedService<DailyScheduleReminderJob>();`.

---

### Giai đoạn 4: Đóng gói Docker & Điều phối toàn hệ thống (`docker-compose.yml`)
- [ ] **Bước 4.1:** Kiểm tra và tinh chỉnh 3 Dockerfile:
  - `src\Services\RoutineService\Dockerfile`
  - `src\Services\RecommendationService\Dockerfile`
  - `src\Services\NotificationWorkerService\Dockerfile`
- [ ] **Bước 4.2:** Kiểm tra file `docker-compose.yml`:
  - Khởi tạo container SQL Server 2022 (Port 1433 mở public ra ngoài máy chủ).
  - Khởi tạo container Zookeeper & Apache Kafka (Port 9092).
  - Khởi tạo container `recommendation-grpc` (Port 50051).
  - Khởi tạo container `routine-api` (Port 5000).
  - Khởi tạo container `notification-worker`.
- [ ] **Bước 4.3:** Chạy thử nghiệm và xác minh:
  - Chạy lệnh: `docker compose up -d --build`.
  - Dùng Postman / Swagger test gọi API Check-in.
  - Chạy `docker compose logs -f notification-worker` để chụp ảnh màn hình log Worker nhận Event từ Kafka làm minh chứng.

---

## 🎤 CHUẨN BỊ BẢO VỆ (SLIDE & DEMO)
- **Slide đảm nhận:**
  - Slide 07: Sơ đồ luồng nghiệp vụ tổng thể (Business Flow).
  - Slide 08: Vòng đời trạng thái thói quen (State Machine).
  - Slide 09: Kiến trúc hệ thống phân tán theo chuẩn C4 Model (Context & Container Diagram).
  - Slide 10: Bảng công nghệ sử dụng (.NET 8, gRPC, Kafka, Docker Compose, SQL Server).
  - Slide 12: Sequence Diagram tương tác giữa REST API -> gRPC -> Kafka -> Background Worker.
- **Phần Demo:**
  - Mở Terminal và Docker Desktop: Cho hội đồng xem các container đang chạy.
  - Demo Workflow 2: Bấm nút "Gợi ý thông minh" trên web -> Chỉ ra log REST API đã gọi sang gRPC Service.
  - Bấm nút "Check-in hoàn thành" -> Cho hội đồng xem Terminal log của Worker lập tức nhận event từ Kafka, cộng điểm và cập nhật DB trong tích tắc.
