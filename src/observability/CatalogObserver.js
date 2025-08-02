import fs from 'fs-extra';
import path from 'path';

/**
 * Advanced observability system for Square Catalog operations
 * Provides comprehensive logging, metrics, and monitoring capabilities
 */
export class CatalogObserver {
  constructor(options = {}) {
    this.options = {
      enableFileLogging: options.enableFileLogging ?? true,
      enableMetrics: options.enableMetrics ?? true,
      enableTracing: options.enableTracing ?? true,
      logLevel: options.logLevel || 'info',
      logsDirectory: options.logsDirectory || './logs',
      metricsRetentionDays: options.metricsRetentionDays || 7,
      maxLogFileSize: options.maxLogFileSize || 10 * 1024 * 1024, // 10MB
      ...options
    };

    // Initialize storage
    this.metrics = new Map();
    this.traces = new Map();
    this.alerts = [];
    this.currentOperations = new Map();

    // Create logs directory
    if (this.options.enableFileLogging) {
      this.initializeLogging();
    }

    // Start background tasks
    this.startBackgroundTasks();
  }

  /**
   * Initialize file logging system
   */
  async initializeLogging() {
    try {
      await fs.ensureDir(this.options.logsDirectory);
      
      // Create log files if they don't exist
      const logFiles = ['application.log', 'errors.log', 'performance.log', 'audit.log'];
      for (const logFile of logFiles) {
        const logPath = path.join(this.options.logsDirectory, logFile);
        if (!await fs.pathExists(logPath)) {
          await fs.writeFile(logPath, '');
        }
      }
      
      console.log(`📊 Observability logging initialized: ${this.options.logsDirectory}`);
    } catch (error) {
      console.error('Failed to initialize logging:', error.message);
    }
  }

  /**
   * Start background maintenance tasks
   */
  startBackgroundTasks() {
    // Clean up old metrics every hour
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000); // 1 hour

    // Rotate logs daily
    setInterval(() => {
      this.rotateLogs();
    }, 86400000); // 24 hours

    // Generate performance reports every 6 hours
    setInterval(() => {
      this.generatePerformanceReport();
    }, 21600000); // 6 hours
  }

  /**
   * Log structured message with context
   * @param {string} level - Log level (error, warn, info, debug, trace)
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   * @param {Object} metadata - Metadata (operation, duration, etc.)
   */
  async log(level, message, context = {}, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      context,
      metadata,
      pid: process.pid,
      memory: process.memoryUsage(),
      ...this.getTraceContext()
    };

    // Console logging with colors
    this.logToConsole(level, message, context, metadata);

    // File logging
    if (this.options.enableFileLogging) {
      await this.logToFile(level, logEntry);
    }

    // Update metrics
    if (this.options.enableMetrics) {
      this.updateLogMetrics(level, metadata);
    }

    return logEntry;
  }

  /**
   * Log to console with colored output
   */
  logToConsole(level, message, context, metadata) {
    const colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[36m',  // Cyan
      debug: '\x1b[35m', // Magenta
      trace: '\x1b[90m'  // Gray
    };
    const reset = '\x1b[0m';
    const color = colors[level] || colors.info;

    const timestamp = new Date().toISOString();
    const traceInfo = this.getTraceContext();
    const traceId = traceInfo.traceId ? ` [${traceInfo.traceId.substring(0, 8)}]` : '';
    
    console.log(`${color}[${timestamp}] ${level.toUpperCase()}${traceId}: ${message}${reset}`);
    
    if (Object.keys(context).length > 0) {
      console.log(`${color}  Context:${reset}`, context);
    }
    
    if (Object.keys(metadata).length > 0) {
      console.log(`${color}  Metadata:${reset}`, metadata);
    }
  }

  /**
   * Log to file with rotation
   */
  async logToFile(level, logEntry) {
    try {
      const logFileName = this.getLogFileName(level);
      const logPath = path.join(this.options.logsDirectory, logFileName);
      const logLine = JSON.stringify(logEntry) + '\n';

      // Check file size and rotate if needed
      const stats = await fs.stat(logPath).catch(() => ({ size: 0 }));
      if (stats.size > this.options.maxLogFileSize) {
        await this.rotateLogFile(logPath);
      }

      await fs.appendFile(logPath, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  /**
   * Get appropriate log file name based on level
   */
  getLogFileName(level) {
    switch (level) {
      case 'error':
        return 'errors.log';
      case 'trace':
      case 'debug':
        return 'performance.log';
      default:
        return 'application.log';
    }
  }

  /**
   * Start operation tracing
   * @param {string} operationName - Name of the operation
   * @param {Object} metadata - Operation metadata
   * @returns {string} Trace ID
   */
  startTrace(operationName, metadata = {}) {
    if (!this.options.enableTracing) return null;

    const traceId = this.generateTraceId();
    const startTime = Date.now();

    const trace = {
      traceId,
      operationName,
      startTime,
      metadata,
      spans: [],
      status: 'active'
    };

    this.traces.set(traceId, trace);
    this.currentOperations.set(traceId, trace);

    this.log('trace', `Started operation: ${operationName}`, { traceId }, metadata);
    return traceId;
  }

  /**
   * End operation tracing
   * @param {string} traceId - Trace ID
   * @param {Object} result - Operation result
   * @param {Error} error - Error if operation failed
   */
  endTrace(traceId, result = null, error = null) {
    if (!traceId || !this.traces.has(traceId)) return;

    const trace = this.traces.get(traceId);
    const endTime = Date.now();
    const duration = endTime - trace.startTime;

    trace.endTime = endTime;
    trace.duration = duration;
    trace.status = error ? 'error' : 'success';
    trace.result = result;
    trace.error = error;

    this.currentOperations.delete(traceId);

    // Log completion
    const level = error ? 'error' : 'info';
    const message = `Completed operation: ${trace.operationName} (${duration}ms)`;
    const context = { traceId, duration, status: trace.status };
    
    if (error) {
      context.error = {
        message: error.message,
        stack: error.stack,
        name: error.constructor.name
      };
    }

    this.log(level, message, context, trace.metadata);

    // Record performance metrics
    this.recordPerformanceMetric(trace.operationName, duration, error ? 'error' : 'success');

    // Check for performance alerts
    this.checkPerformanceAlerts(trace.operationName, duration);
  }

  /**
   * Add span to active trace
   * @param {string} traceId - Trace ID
   * @param {string} spanName - Span name
   * @param {Object} data - Span data
   */
  addSpan(traceId, spanName, data = {}) {
    if (!traceId || !this.traces.has(traceId)) return;

    const trace = this.traces.get(traceId);
    const span = {
      name: spanName,
      timestamp: Date.now(),
      data
    };

    trace.spans.push(span);
    this.log('debug', `Span: ${spanName}`, { traceId, spanName }, data);
  }

  /**
   * Record performance metric
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {string} status - success/error
   * @param {Object} metadata - Additional metadata
   */
  recordPerformanceMetric(operation, duration, status = 'success', metadata = {}) {
    if (!this.options.enableMetrics) return;

    const timestamp = Date.now();
    const hour = Math.floor(timestamp / (1000 * 60 * 60)); // Hour bucket

    if (!this.metrics.has(hour)) {
      this.metrics.set(hour, {
        timestamp,
        operations: {},
        totals: { requests: 0, errors: 0, totalDuration: 0 }
      });
    }

    const hourMetrics = this.metrics.get(hour);

    if (!hourMetrics.operations[operation]) {
      hourMetrics.operations[operation] = {
        requests: 0,
        errors: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        durations: []
      };
    }

    const opMetrics = hourMetrics.operations[operation];
    opMetrics.requests++;
    opMetrics.totalDuration += duration;
    opMetrics.minDuration = Math.min(opMetrics.minDuration, duration);
    opMetrics.maxDuration = Math.max(opMetrics.maxDuration, duration);
    opMetrics.durations.push(duration);

    // Keep only last 100 durations for percentile calculations
    if (opMetrics.durations.length > 100) {
      opMetrics.durations = opMetrics.durations.slice(-100);
    }

    if (status === 'error') {
      opMetrics.errors++;
      hourMetrics.totals.errors++;
    }

    hourMetrics.totals.requests++;
    hourMetrics.totals.totalDuration += duration;
  }

  /**
   * Get performance metrics summary
   * @param {number} hours - Number of hours to look back
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics(hours = 24) {
    const now = Math.floor(Date.now() / (1000 * 60 * 60));
    const startHour = now - hours;

    const summary = {
      period: `Last ${hours} hour(s)`,
      totalRequests: 0,
      totalErrors: 0,
      averageResponseTime: 0,
      operations: {},
      hourly: []
    };

    for (let hour = startHour; hour <= now; hour++) {
      const hourMetrics = this.metrics.get(hour);
      if (!hourMetrics) continue;

      summary.totalRequests += hourMetrics.totals.requests;
      summary.totalErrors += hourMetrics.totals.errors;

      // Add hourly data
      summary.hourly.push({
        hour: new Date(hour * 60 * 60 * 1000).toISOString(),
        requests: hourMetrics.totals.requests,
        errors: hourMetrics.totals.errors,
        avgDuration: hourMetrics.totals.requests > 0 
          ? hourMetrics.totals.totalDuration / hourMetrics.totals.requests 
          : 0
      });

      // Aggregate operation metrics
      for (const [opName, opMetrics] of Object.entries(hourMetrics.operations)) {
        if (!summary.operations[opName]) {
          summary.operations[opName] = {
            requests: 0,
            errors: 0,
            totalDuration: 0,
            minDuration: Infinity,
            maxDuration: 0,
            allDurations: []
          };
        }

        const summaryOp = summary.operations[opName];
        summaryOp.requests += opMetrics.requests;
        summaryOp.errors += opMetrics.errors;
        summaryOp.totalDuration += opMetrics.totalDuration;
        summaryOp.minDuration = Math.min(summaryOp.minDuration, opMetrics.minDuration);
        summaryOp.maxDuration = Math.max(summaryOp.maxDuration, opMetrics.maxDuration);
        summaryOp.allDurations.push(...opMetrics.durations);
      }
    }

    // Calculate overall average response time
    if (summary.totalRequests > 0) {
      const totalDuration = Object.values(summary.operations)
        .reduce((sum, op) => sum + op.totalDuration, 0);
      summary.averageResponseTime = totalDuration / summary.totalRequests;
    }

    // Calculate percentiles for each operation
    for (const [opName, opMetrics] of Object.entries(summary.operations)) {
      if (opMetrics.allDurations.length > 0) {
        const sorted = opMetrics.allDurations.sort((a, b) => a - b);
        opMetrics.percentiles = {
          p50: this.getPercentile(sorted, 50),
          p90: this.getPercentile(sorted, 90),
          p95: this.getPercentile(sorted, 95),
          p99: this.getPercentile(sorted, 99)
        };
        opMetrics.avgDuration = opMetrics.totalDuration / opMetrics.requests;
        opMetrics.errorRate = (opMetrics.errors / opMetrics.requests) * 100;
      }
      delete opMetrics.allDurations; // Clean up
    }

    return summary;
  }

  /**
   * Calculate percentile from sorted array
   */
  getPercentile(sortedArray, percentile) {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Check for performance alerts
   */
  checkPerformanceAlerts(operation, duration) {
    const thresholds = {
      'uploadImage': 10000, // 10 seconds
      'createCatalogItem': 5000, // 5 seconds
      'batchUpsert': 30000, // 30 seconds
      'search': 3000 // 3 seconds
    };

    const threshold = thresholds[operation] || 5000; // Default 5 seconds

    if (duration > threshold) {
      this.createAlert('performance', 'high_latency', {
        operation,
        duration,
        threshold,
        message: `Operation ${operation} took ${duration}ms (threshold: ${threshold}ms)`
      });
    }
  }

  /**
   * Create system alert
   */
  createAlert(type, code, details) {
    const alert = {
      id: this.generateId(),
      type,
      code,
      details,
      timestamp: Date.now(),
      acknowledged: false
    };

    this.alerts.push(alert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    this.log('warn', `Alert: ${type}/${code}`, { alertId: alert.id }, details);
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport() {
    try {
      const metrics = this.getPerformanceMetrics(24);
      const report = {
        generatedAt: new Date().toISOString(),
        summary: {
          totalRequests: metrics.totalRequests,
          totalErrors: metrics.totalErrors,
          errorRate: metrics.totalRequests > 0 ? (metrics.totalErrors / metrics.totalRequests) * 100 : 0,
          averageResponseTime: Math.round(metrics.averageResponseTime)
        },
        operations: metrics.operations,
        alerts: this.alerts.filter(alert => !alert.acknowledged),
        systemHealth: this.getSystemHealth()
      };

      // Write report to file
      if (this.options.enableFileLogging) {
        const reportPath = path.join(this.options.logsDirectory, `performance-report-${Date.now()}.json`);
        await fs.writeJson(reportPath, report, { spaces: 2 });
      }

      this.log('info', 'Performance report generated', { 
        reportSummary: report.summary,
        alertCount: report.alerts.length
      });

      return report;
    } catch (error) {
      this.log('error', 'Failed to generate performance report', { error: error.message });
    }
  }

  /**
   * Get system health indicators
   */
  getSystemHealth() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    return {
      uptime: Math.round(uptime),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024) // MB
      },
      activeOperations: this.currentOperations.size,
      totalTraces: this.traces.size,
      pendingAlerts: this.alerts.filter(alert => !alert.acknowledged).length
    };
  }

  /**
   * Clean up old metrics
   */
  cleanupOldMetrics() {
    const now = Math.floor(Date.now() / (1000 * 60 * 60));
    const cutoffHour = now - (this.options.metricsRetentionDays * 24);

    let cleaned = 0;
    for (const [hour] of this.metrics) {
      if (hour < cutoffHour) {
        this.metrics.delete(hour);
        cleaned++;
      }
    }

    // Clean up old traces
    const traceCutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    for (const [traceId, trace] of this.traces) {
      if (trace.startTime < traceCutoff) {
        this.traces.delete(traceId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.log('debug', `Cleaned up ${cleaned} old metrics and traces`);
    }
  }

  /**
   * Rotate log files
   */
  async rotateLogFile(logPath) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = logPath.replace('.log', `-${timestamp}.log`);
      
      await fs.move(logPath, rotatedPath);
      await fs.writeFile(logPath, ''); // Create new empty log file
      
      this.log('info', `Rotated log file: ${path.basename(logPath)}`);
    } catch (error) {
      this.log('error', 'Failed to rotate log file', { error: error.message, logPath });
    }
  }

  /**
   * Generate unique trace ID
   */
  generateTraceId() {
    return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get current trace context
   */
  getTraceContext() {
    // In a real implementation, this might use AsyncLocalStorage or similar
    // For now, we'll use a simple approach
    const activeTraces = Array.from(this.currentOperations.values());
    if (activeTraces.length > 0) {
      const trace = activeTraces[activeTraces.length - 1]; // Most recent
      return {
        traceId: trace.traceId,
        operationName: trace.operationName
      };
    }
    return {};
  }

  /**
   * Update log metrics
   */
  updateLogMetrics(level, metadata) {
    const hour = Math.floor(Date.now() / (1000 * 60 * 60));
    
    if (!this.metrics.has(hour)) {
      this.metrics.set(hour, {
        timestamp: Date.now(),
        operations: {},
        totals: { requests: 0, errors: 0, totalDuration: 0 },
        logs: { error: 0, warn: 0, info: 0, debug: 0, trace: 0 }
      });
    }

    const hourMetrics = this.metrics.get(hour);
    if (hourMetrics.logs) {
      hourMetrics.logs[level] = (hourMetrics.logs[level] || 0) + 1;
    }
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(format = 'prometheus') {
    const metrics = this.getPerformanceMetrics(1); // Last hour
    
    if (format === 'prometheus') {
      return this.exportPrometheusMetrics(metrics);
    } else if (format === 'json') {
      return metrics;
    }
    
    return metrics;
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(metrics) {
    let output = '';
    
    // Total requests
    output += `# HELP square_catalog_requests_total Total number of catalog requests\n`;
    output += `# TYPE square_catalog_requests_total counter\n`;
    output += `square_catalog_requests_total ${metrics.totalRequests}\n\n`;
    
    // Total errors
    output += `# HELP square_catalog_errors_total Total number of catalog errors\n`;
    output += `# TYPE square_catalog_errors_total counter\n`;
    output += `square_catalog_errors_total ${metrics.totalErrors}\n\n`;
    
    // Response time by operation
    output += `# HELP square_catalog_response_time_seconds Response time by operation\n`;
    output += `# TYPE square_catalog_response_time_seconds histogram\n`;
    
    for (const [operation, opMetrics] of Object.entries(metrics.operations)) {
      if (opMetrics.percentiles) {
        output += `square_catalog_response_time_seconds{operation="${operation}",quantile="0.5"} ${opMetrics.percentiles.p50 / 1000}\n`;
        output += `square_catalog_response_time_seconds{operation="${operation}",quantile="0.9"} ${opMetrics.percentiles.p90 / 1000}\n`;
        output += `square_catalog_response_time_seconds{operation="${operation}",quantile="0.95"} ${opMetrics.percentiles.p95 / 1000}\n`;
        output += `square_catalog_response_time_seconds{operation="${operation}",quantile="0.99"} ${opMetrics.percentiles.p99 / 1000}\n`;
      }
    }
    
    return output;
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.log('info', 'Shutting down observability system');
    
    // Generate final report
    await this.generatePerformanceReport();
    
    // Clean up resources
    this.metrics.clear();
    this.traces.clear();
    this.currentOperations.clear();
  }
}
