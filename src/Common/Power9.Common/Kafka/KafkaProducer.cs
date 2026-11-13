using System.Text.Json;
using Confluent.Kafka;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Power9.Common.Kafka;

public interface IKafkaProducer
{
    Task<long> PublishAsync<T>(string topic, string key, T message, CancellationToken cancellationToken = default);
}

/// <summary>Đăng ký Singleton - một producer dùng chung cho cả ứng dụng.</summary>
public sealed class KafkaProducer : IKafkaProducer, IDisposable
{
    private readonly IProducer<string, string> _producer;
    private readonly ILogger<KafkaProducer> _logger;

    public KafkaProducer(IConfiguration configuration, ILogger<KafkaProducer> logger)
    {
        _logger = logger;
        var config = new ProducerConfig
        {
            BootstrapServers = configuration["Kafka:BootstrapServers"] ?? "localhost:9092",
            Acks = Acks.All,
            EnableIdempotence = true,
            MessageTimeoutMs = 5000
        };
        _producer = new ProducerBuilder<string, string>(config).Build();
    }

    public async Task<long> PublishAsync<T>(string topic, string key, T message, CancellationToken cancellationToken = default)
    {
        var json = JsonSerializer.Serialize(message);
        try
        {
            var result = await _producer.ProduceAsync(topic, new Message<string, string> { Key = key, Value = json }, cancellationToken);
            _logger.LogInformation("[KAFKA PRODUCER] Published to {Topic} partition {Partition} offset {Offset}: {Payload}",
                topic, result.Partition.Value, result.Offset.Value, json);
            return result.Offset.Value;
        }
        catch (ProduceException<string, string> ex)
        {
            _logger.LogError(ex, "[KAFKA PRODUCER] Failed to publish to {Topic}: {Reason}", topic, ex.Error.Reason);
            throw;
        }
    }

    public void Dispose()
    {
        _producer.Flush(TimeSpan.FromSeconds(5));
        _producer.Dispose();
    }
}
