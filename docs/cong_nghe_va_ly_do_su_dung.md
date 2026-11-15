# Công nghệ sử dụng trong Power9 và lý do lựa chọn

Power9 Office Routine giúp người dùng tìm vi thói quen công sở, đặt lịch nhắc và check-in. Tribe City dùng kết quả check-in để cập nhật vật liệu và tiến độ thành phố. Hệ thống chia thành ba tiến trình chạy bằng .NET 8 gồm **Routine API**, **Recommendation gRPC** và **Notification Worker**. Việc chia theo trách nhiệm giúp giữ tác vụ cần phản hồi ngay trong API và giao việc xử lý nền cho worker.

## 1. Giao diện web

- **HTML, CSS và JavaScript thuần.** ASP.NET Core phục vụ giao diện từ `wwwroot`. HTML cung cấp khung trang, JavaScript đổi màn hình theo tuyến đường sau dấu `#` và dùng Fetch API để gọi REST. CSS dùng Grid, Flexbox và media query để sắp lại các cột, nút và bảng khi đổi kích thước màn hình. Cách tổ chức này phù hợp với giao diện của bài và cho phép đóng gói web cùng REST API trong một container.
- **Browser Notifications và Local Storage.** Khi trình duyệt cấp quyền và ứng dụng đang hoạt động, giao diện có thể hiện thông báo nhắc lịch ngay trên thiết bị. Local Storage giữ phiên đăng nhập, lịch sử chat và một số dữ liệu demo để có thể dùng lại khi tải trang. Lịch sử chat gắn với tài khoản trong trình duyệt đang dùng.

Mã nguồn tham chiếu [điểm vào giao diện](../src/Services/RoutineService/Power9.RoutineService.Api/wwwroot/index.html) · [điều hướng và thông báo](../src/Services/RoutineService/Power9.RoutineService.Api/wwwroot/js/app.js) · [API client](../src/Services/RoutineService/Power9.RoutineService.Api/wwwroot/js/api.js).

## 2. REST API và xác thực

- **C# và ASP.NET Core Web API trên .NET 8.** Routine API dùng REST và JSON cho các thao tác đăng nhập, xem thói quen, quản lý lịch và chơi Tribe City. Trình duyệt gọi API qua HTTP, còn ASP.NET Core cung cấp controller, xác thực và dependency injection. Dự án chia lớp để controller tiếp nhận yêu cầu, Application xử lý nghiệp vụ, Domain mô tả dữ liệu nghiệp vụ và Infrastructure thực hiện truy vấn, lưu trữ.
- **JWT Bearer và PBKDF2-SHA256.** API phát JWT chứa định danh và vai trò sau khi đăng nhập. Giao diện gửi token trong header `Authorization` để server xác định người dùng và kiểm tra quyền ở các endpoint cần bảo vệ. Server lưu giá trị băm PBKDF2-SHA256 cùng salt và dùng chúng để xác minh mật khẩu khi đăng nhập.
- **OpenAPI, Swagger UI và Swashbuckle.** Swagger mô tả đường dẫn, tham số và cấu trúc dữ liệu của REST API. Trong môi trường Development, Swagger UI giúp nhóm gọi thử endpoint và kiểm tra kết quả khi tích hợp frontend.

Mã nguồn tham chiếu [cấu hình Routine API](../src/Services/RoutineService/Power9.RoutineService.Api/Program.cs) · [nghiệp vụ xác thực](../src/Services/RoutineService/Power9.RoutineService.Application/Services/AuthService.cs).

## 3. Dữ liệu và lưu trữ

- **SQL Server 2022.** Lưu tài khoản, danh mục thói quen, lịch nhắc, nhật ký check-in, quan hệ bạn bè và dữ liệu Tribe City. Những dữ liệu này có quan hệ trực tiếp với nhau, chẳng hạn lịch gắn với người dùng và thói quen. Khóa và ràng buộc trong SQL Server giúp duy trì các quan hệ đó khi dữ liệu thay đổi.
- **Entity Framework Core 8 và Code-First Migrations.** EF Core ánh xạ entity C# sang bảng SQL Server và cho phép viết truy vấn bằng LINQ. Migrations lưu các thay đổi cấu trúc database theo phiên bản, giúp nhóm dựng cùng một schema trên nhiều máy. Routine API áp dụng migrations và nạp dữ liệu mẫu khi khởi động và kết nối được SQL Server.

Mã nguồn tham chiếu [ánh xạ bảng và quan hệ](../src/Services/RoutineService/Power9.RoutineService.Infrastructure/Data/Power9DbContext.cs) · [migrations](../src/Services/RoutineService/Power9.RoutineService.Infrastructure/Migrations).

## 4. Hai cách gợi ý thói quen

- **gRPC qua HTTP/2 và Protocol Buffers.** Bộ lọc thủ công gửi thời gian ngồi, buổi trong ngày và mức căng thẳng qua REST. Routine API gọi Recommendation Service bằng gRPC và đợi kết quả để trả về cho giao diện. Tệp `recommendation.proto` định nghĩa chung dữ liệu yêu cầu và phản hồi, giúp hai project tạo mã client và server từ cùng một hợp đồng. Bộ máy gợi ý C# áp dụng quy tắc có thứ tự ưu tiên nên dễ kiểm tra bằng các bộ đầu vào cố định.
- **Google Gemini 2.5 Flash.** Trang Trợ lý AI xử lý câu nhập tự nhiên, chẳng hạn “nhắc tôi nghỉ mắt lúc 14:30”. Giao diện gửi yêu cầu đến Gemini và đọc kết quả JSON để hiển thị câu trả lời hoặc điền sẵn thói quen, giờ nhắc và ngày lặp. Người dùng xác nhận trước khi giao diện tạo lịch. Khi Gemini không phản hồi thành công, giao diện có bộ quy tắc cục bộ để tiếp tục đưa ra gợi ý.

Mã nguồn tham chiếu [hợp đồng Protobuf](../src/Common/Power9.GrpcContracts/Protos/recommendation.proto) · [bộ máy gợi ý C#](../src/Services/RecommendationService/Power9.RecommendationGrpc/Engine/RecommendationEngine.cs) · [tích hợp Gemini](../src/Services/RoutineService/Power9.RoutineService.Api/wwwroot/js/api.js).

## 5. Check-in và xử lý nền

- **Apache Kafka và Confluent.Kafka.** Routine API gửi sự kiện `RoutineCompletedEvent` lên topic `power9-routine-completed` khi người dùng check-in. API trả `202 Accepted` để xác nhận đã tiếp nhận yêu cầu. Worker đọc sự kiện từ Kafka để ghi nhật ký, cộng điểm, tính chuỗi ngày và gửi email ở tiến trình nền. Sự kiện dùng mã người dùng làm khóa phân vùng. Worker kiểm tra `EventId` đã ghi trong nhật ký để bỏ qua thông điệp phát lại.
- **.NET Worker Service và `BackgroundService`.** Một tác vụ nhận sự kiện Kafka. Hai tác vụ định kỳ quét các lịch nhắc đến hạn theo giờ Việt Nam và kết thúc phòng Tribe City đã hết chu kỳ. Tách worker thành tiến trình riêng cho phép các tác vụ định kỳ chạy dù người dùng đã đóng trang web.
- **SMTP, Gmail và Mailpit.** Worker dùng SMTP để gửi email nhắc lịch và xác nhận check-in. Gmail có thể gửi ra hộp thư thật khi được cấu hình. Mailpit thu email thử nghiệm để nhóm xem nội dung ngay trong môi trường chạy demo.

Mã nguồn tham chiếu [endpoint check-in](../src/Services/RoutineService/Power9.RoutineService.Api/Controllers/CheckInsController.cs) · [Kafka consumer](../src/Services/NotificationWorkerService/Power9.NotificationWorker/Workers/RoutineCompletedConsumerWorker.cs) · [đăng ký các tác vụ nền](../src/Services/NotificationWorkerService/Power9.NotificationWorker/Program.cs).

## 6. Triển khai và kiểm thử

- **Docker và Docker Compose.** Dockerfile đóng gói từng dịch vụ .NET. Compose chạy ba dịch vụ cùng SQL Server, Kafka, ZooKeeper, Kafka UI và Mailpit trên một mạng nội bộ. Healthcheck và thứ tự khởi động giúp các dịch vụ đợi những thành phần cần dùng sẵn sàng. Volume của SQL Server giữ dữ liệu khi tạo lại container. ZooKeeper hỗ trợ Kafka theo cấu hình broker của bài, còn Kafka UI giúp quan sát topic và message khi demo.
- **xUnit.** Các project test kiểm tra thứ tự quy tắc gợi ý, cách tính chuỗi ngày, cửa sổ nhắc lịch và các quy tắc Tribe City. Chạy `dotnet test Power9.slnx` để kiểm tra các hành vi này sau khi sửa code.
- **PlantUML.** Các tệp sơ đồ mô tả kiến trúc, luồng nghiệp vụ, thiết kế lớp và quan hệ dữ liệu. Nhóm có thể giữ sơ đồ dạng mã nguồn trong repo và cập nhật cùng bài.

Tệp tham chiếu [Docker Compose](../docker-compose.yml) · [bài kiểm thử](../tests) · [sơ đồ thiết kế](diagrams).
