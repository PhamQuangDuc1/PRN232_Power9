// Khai báo tên topic dùng chung để Routine API và Notification Worker cùng đọc đúng kênh Kafka.
namespace Power9.Common.Constants;

public static class KafkaTopics
{
    public const string RoutineCompletedTopic = "power9-routine-completed";
    public const string RoutineProposalTopic = "power9-routine-proposals";
}
