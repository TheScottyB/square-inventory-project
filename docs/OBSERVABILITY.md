# Square Catalog Agent Observability System

## Overview

The Square Catalog Agent now includes a comprehensive observability system that provides detailed monitoring, logging, tracing, and performance analytics for all catalog operations.

## Features

### 🔍 **Enhanced Logging**
- **Structured JSON logs** with context and metadata
- **Color-coded console output** for better readability
- **File logging with rotation** (application.log, errors.log, performance.log, audit.log)
- **Multiple log levels**: ERROR, WARN, INFO, DEBUG, TRACE

### 📊 **Performance Metrics**
- **Request tracking** with response times and success rates
- **Operation-specific metrics** (getLocations, createCatalogItem, batchUpsert, etc.)
- **Percentile calculations** (P50, P90, P95, P99)
- **Error rate monitoring** with categorization

### 🕵️ **Distributed Tracing**
- **Operation tracing** with unique trace IDs
- **Span tracking** for detailed operation breakdowns
- **Nested operation support** with parent-child relationships
- **Performance correlation** across related operations

### 🚨 **Intelligent Alerting**
- **Performance alerts** for high-latency operations
- **Threshold-based monitoring** with configurable limits
- **Alert aggregation** and acknowledgment system

### 📈 **Advanced Error Handling**
- **Enhanced error classification** with severity levels
- **Retry strategy integration** based on error types
- **Error metrics collection** for monitoring and analysis
- **Detailed remediation suggestions**

## Configuration

The observability system can be configured through the `CatalogObserver` constructor:

```javascript
const observer = new CatalogObserver({
  enableFileLogging: true,     // Enable file logging
  enableMetrics: true,         // Enable metrics collection
  enableTracing: true,         // Enable operation tracing
  logLevel: 'info',           // Minimum log level
  logsDirectory: './logs',     // Log files directory
  metricsRetentionDays: 7,     // How long to retain metrics
  maxLogFileSize: 10485760     // Max log file size (10MB)
});
```

## Usage Examples

### Basic Logging
```javascript
agent.observer.log('info', 'Operation completed', { 
  itemCount: 5 
}, { 
  operation: 'catalog_sync' 
});
```

### Operation Tracing
```javascript
const traceId = agent.observer.startTrace('uploadImage', { 
  imageName: 'product.jpg' 
});

agent.observer.addSpan(traceId, 'image_processing', { 
  size: imageBuffer.length 
});

// ... perform operation ...

agent.observer.endTrace(traceId, { imageId: 'IMG_123' });
```

### Performance Metrics
```javascript
agent.observer.recordPerformanceMetric('api_call', 1500, 'success', {
  endpoint: 'catalog.batchUpsert',
  itemCount: 10
});
```

## Generated Files

The observability system creates several types of files:

### Log Files
- **`application.log`** - General application logs (INFO, WARN)
- **`errors.log`** - Error logs only
- **`performance.log`** - Debug and trace logs
- **`audit.log`** - Audit trail for critical operations

### Performance Reports
- **`performance-report-{timestamp}.json`** - Detailed performance analytics
- Generated automatically every 6 hours or on shutdown
- Contains operation metrics, percentiles, and system health

## Metrics Available

### System Health
```javascript
const health = agent.observer.getSystemHealth();
// Returns: { uptime, memory, activeOperations, totalTraces, pendingAlerts }
```

### Performance Metrics
```javascript
const metrics = agent.observer.getPerformanceMetrics(24); // Last 24 hours
// Returns: { totalRequests, totalErrors, averageResponseTime, operations }
```

### Agent Observability
```javascript
const agentMetrics = agent.getObservabilityMetrics();
// Returns: { performance, systemHealth, alerts, traces }
```

## Integration with Square API

The observability system is deeply integrated with all Square Catalog Agent operations:

- **API calls** are automatically traced and timed
- **Errors** are classified and logged with detailed context
- **Retry operations** are tracked with backoff strategies
- **Batch operations** include progress and performance metrics

## Testing

The system includes comprehensive test suites:

- **`test/observability-integration.test.js`** - Full integration testing
- **`test/real-integration.test.js`** - Real Square API testing

Run tests with:
```bash
node test/observability-integration.test.js
node test/real-integration.test.js
```

## Performance Impact

The observability system is designed to be lightweight:

- **Minimal overhead** (~2-5ms per operation)
- **Asynchronous logging** to avoid blocking operations
- **Configurable levels** to reduce verbosity in production
- **Automatic cleanup** of old metrics and logs

## Production Considerations

### Log Rotation
- Files automatically rotate when they exceed 10MB
- Old rotated files should be archived or deleted by your log management system

### Metrics Retention
- Metrics are retained for 7 days by default
- Configure `metricsRetentionDays` based on your needs

### File System Usage
- Monitor disk space usage in the logs directory
- Consider external log aggregation systems for high-volume environments

### Security
- Log files may contain sensitive information
- Ensure appropriate file permissions and access controls
- Consider log anonymization for compliance requirements

## Monitoring Integration

The system supports integration with external monitoring tools:

### Prometheus Metrics
```javascript
const prometheusMetrics = agent.observer.exportMetrics('prometheus');
// Returns Prometheus-formatted metrics
```

### JSON Export
```javascript
const jsonMetrics = agent.observer.exportMetrics('json');
// Returns structured JSON metrics
```

## Troubleshooting

### Common Issues

1. **Log files not created**
   - Check file permissions in the logs directory
   - Ensure `enableFileLogging` is set to `true`

2. **High memory usage**
   - Reduce `metricsRetentionDays`
   - Lower log level to reduce verbosity

3. **Performance impact**
   - Disable file logging in high-throughput scenarios
   - Use async log processing

### Debug Mode

Enable debug logging for detailed troubleshooting:
```javascript
const agent = new SquareCatalogAgent();
agent.observer.options.logLevel = 'debug';
```

## Future Enhancements

Planned improvements include:

- **Real-time dashboard** integration
- **Machine learning** anomaly detection
- **Custom alert rules** and notification channels
- **Distributed tracing** across multiple services
- **APM integration** (New Relic, DataDog, etc.)

---

The observability system provides comprehensive insights into your Square Catalog operations, enabling better monitoring, debugging, and performance optimization of your inventory management workflows.
