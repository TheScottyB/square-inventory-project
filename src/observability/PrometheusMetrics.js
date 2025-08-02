import * as client from 'prom-client';

/**
 * Prometheus metrics for Square Catalog operations
 * Implements Golden Signals and SLI/SLO monitoring
 */
export class PrometheusMetrics {
  constructor(options = {}) {
    this.options = {
      enableDefaultMetrics: options.enableDefaultMetrics ?? true,
      defaultLabels: options.defaultLabels || { service: 'square-catalog-agent' },
      ...options
    };

    // Create metrics registry
    this.register = new client.Registry();
    
    // Set default labels
    this.register.setDefaultLabels(this.options.defaultLabels);

    // Enable default Node.js metrics
    if (this.options.enableDefaultMetrics) {
      client.collectDefaultMetrics({ register: this.register });
    }

    this.initializeMetrics();
  }

  /**
   * Initialize all Square Catalog specific metrics
   */
  initializeMetrics() {
    // Golden Signal: Latency
    this.squareCatalogLatency = new client.Histogram({
      name: 'square_catalog_operation_duration_seconds',
      help: 'Duration of Square Catalog operations',
      labelNames: ['operation', 'merchant_id', 'status', 'environment'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30], // Reasonable buckets for API calls
      registers: [this.register]
    });

    // Golden Signal: Traffic
    this.squareCatalogRequests = new client.Counter({
      name: 'square_catalog_requests_total',
      help: 'Total number of Square Catalog requests',
      labelNames: ['operation', 'merchant_id', 'status', 'environment'],
      registers: [this.register]
    });

    // Golden Signal: Errors
    this.squareCatalogErrors = new client.Counter({
      name: 'square_catalog_errors_total',
      help: 'Total number of Square Catalog errors',
      labelNames: ['operation', 'merchant_id', 'error_type', 'error_code', 'retryable', 'environment'],
      registers: [this.register]
    });

    // Golden Signal: Saturation
    this.squareCatalogActiveOperations = new client.Gauge({
      name: 'square_catalog_active_operations',
      help: 'Number of active Square Catalog operations',
      labelNames: ['merchant_id', 'operation_type'],
      registers: [this.register]
    });

    // Rate limiting specific metrics
    this.squareRateLimits = new client.Counter({
      name: 'square_rate_limits_total',
      help: 'Total number of rate limit hits',
      labelNames: ['merchant_id', 'endpoint', 'environment'],
      registers: [this.register]
    });

    // Batch operation metrics
    this.squareBatchOperations = new client.Histogram({
      name: 'square_batch_operation_objects',
      help: 'Number of objects in batch operations',
      labelNames: ['operation', 'merchant_id', 'status'],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.register]
    });

    // Catalog version metrics
    this.squareCatalogVersion = new client.Gauge({
      name: 'square_catalog_version',
      help: 'Current Square catalog version',
      labelNames: ['merchant_id'],
      registers: [this.register]
    });

    // Node.js specific metrics for resource monitoring (use custom names to avoid conflicts)
    this.squareNodeEventLoopLag = new client.Histogram({
      name: 'square_nodejs_eventloop_lag_seconds',
      help: 'Event loop lag in seconds (Square specific)',
      buckets: [0.001, 0.01, 0.1, 1, 10],
      registers: [this.register]
    });

    this.squareNodeHeapSize = new client.Gauge({
      name: 'square_nodejs_heap_size_bytes',
      help: 'Process heap size in bytes (Square specific)',
      labelNames: ['type'],
      registers: [this.register]
    });

    // SLI/SLO tracking
    this.sloLatencyBudget = new client.Counter({
      name: 'square_slo_latency_budget_consumed',
      help: 'SLO latency budget consumed',
      labelNames: ['operation', 'merchant_id', 'slo_threshold'],
      registers: [this.register]
    });

    this.sloErrorBudget = new client.Counter({
      name: 'square_slo_error_budget_consumed',
      help: 'SLO error budget consumed',
      labelNames: ['operation', 'merchant_id', 'slo_threshold'],
      registers: [this.register]
    });

    // Start resource monitoring
    this.startResourceMonitoring();
  }

  /**
   * Record Square Catalog operation metrics
   */
  recordOperation(operation, duration, status, labels = {}) {
    // Extract merchantId and convert to merchant_id, remove from labels to avoid conflicts
    const { merchantId, ...otherLabels } = labels;
    const baseLabels = {
      operation,
      status,
      environment: process.env.NODE_ENV || 'development',
      merchant_id: merchantId || 'unknown',
      ...otherLabels
    };

    // Record latency (Golden Signal)
    this.squareCatalogLatency.observe(baseLabels, duration / 1000);

    // Record request count (Golden Signal)
    this.squareCatalogRequests.inc(baseLabels);

    // Check SLO compliance
    this.checkSLOCompliance(operation, duration, status, baseLabels);
  }

  /**
   * Record Square Catalog error
   */
  recordError(operation, error, labels = {}) {
    const errorInfo = this.classifyError(error);
    
    // Extract merchantId and convert to merchant_id, remove from labels to avoid conflicts
    const { merchantId, ...otherLabels } = labels;
    const errorLabels = {
      operation,
      merchant_id: merchantId || 'unknown',
      error_type: errorInfo.type,
      error_code: errorInfo.code,
      retryable: errorInfo.retryable.toString(),
      environment: process.env.NODE_ENV || 'development',
      ...otherLabels
    };

    // Record error (Golden Signal)
    this.squareCatalogErrors.inc(errorLabels);

    // Record rate limiting specifically
    if (errorInfo.code === 'RATE_LIMITED') {
      this.squareRateLimits.inc({
        merchant_id: merchantId || 'unknown',
        endpoint: operation,
        environment: process.env.NODE_ENV || 'development'
      });
    }

    // Update error budget
    this.sloErrorBudget.inc({
      operation,
      merchant_id: merchantId || 'unknown',
      slo_threshold: '99.9' // 99.9% availability SLO
    });
  }

  /**
   * Track active operations (Golden Signal: Saturation)
   */
  trackActiveOperation(operation, merchantId, increment = true) {
    const labels = {
      merchant_id: merchantId || 'unknown',
      operation_type: operation
    };

    if (increment) {
      this.squareCatalogActiveOperations.inc(labels);
    } else {
      this.squareCatalogActiveOperations.dec(labels);
    }
  }

  /**
   * Record batch operation metrics
   */
  recordBatchOperation(operation, objectCount, status, merchantId) {
    const labels = {
      operation,
      merchant_id: merchantId || 'unknown',
      status
    };

    this.squareBatchOperations.observe(labels, objectCount);
  }

  /**
   * Update catalog version
   */
  updateCatalogVersion(version, merchantId) {
    this.squareCatalogVersion.set(
      { merchant_id: merchantId || 'unknown' },
      version
    );
  }

  /**
   * Check SLO compliance and record budget consumption
   */
  checkSLOCompliance(operation, duration, status, labels) {
    // SLO thresholds (configurable)
    const sloThresholds = {
      'catalog.batchUpsert': 5000,    // 5 seconds
      'catalog.search': 2000,         // 2 seconds
      'catalog.info': 1000,           // 1 second
      'locations.list': 1000,         // 1 second
      'uploadImage': 10000,           // 10 seconds
      'createCatalogItem': 3000,      // 3 seconds
      'default': 2000                 // 2 seconds default
    };

    const threshold = sloThresholds[operation] || sloThresholds.default;

    // Check latency SLO
    if (duration > threshold) {
      this.sloLatencyBudget.inc({
        operation,
        merchant_id: labels.merchant_id,
        slo_threshold: `${threshold}ms`
      });
    }
  }

  /**
   * Classify errors for better metrics
   */
  classifyError(error) {
    if (error?.result?.errors?.[0]) {
      const squareError = error.result.errors[0];
      return {
        type: squareError.category?.toLowerCase() || 'unknown',
        code: squareError.code,
        retryable: ['RATE_LIMITED', 'INTERNAL_SERVER_ERROR', 'SERVICE_UNAVAILABLE'].includes(squareError.code)
      };
    }

    // Network/system errors
    if (error.code) {
      return {
        type: 'network',
        code: error.code,
        retryable: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code)
      };
    }

    return {
      type: 'unknown',
      code: 'UNKNOWN_ERROR',
      retryable: false
    };
  }

  /**
   * Start monitoring Node.js resource metrics
   */
  startResourceMonitoring() {
    // Monitor event loop lag
    setInterval(() => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1e9;
        this.squareNodeEventLoopLag.observe(lag);
      });
    }, 5000); // Every 5 seconds

    // Monitor heap usage
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.squareNodeHeapSize.set({ type: 'used' }, memUsage.heapUsed);
      this.squareNodeHeapSize.set({ type: 'total' }, memUsage.heapTotal);
      this.squareNodeHeapSize.set({ type: 'external' }, memUsage.external);
    }, 10000); // Every 10 seconds
  }

  /**
   * Create alerting rules for Prometheus/Alertmanager
   */
  generateAlertingRules() {
    return {
      groups: [
        {
          name: 'square-catalog-agent',
          rules: [
            {
              alert: 'SquareCatalogHighLatency',
              expr: 'histogram_quantile(0.95, rate(square_catalog_operation_duration_seconds_bucket[5m])) > 2',
              for: '5m',
              labels: { severity: 'warning' },
              annotations: {
                summary: 'Square Catalog operation high latency',
                description: 'The 95th percentile latency for Square Catalog operations is above 2s for 5 minutes',
                runbook: 'Check Square API status and review slow operations. Consider reducing batch sizes or implementing circuit breakers.'
              }
            },
            {
              alert: 'SquareCatalogHighErrorRate',
              expr: 'rate(square_catalog_errors_total[5m]) / rate(square_catalog_requests_total[5m]) > 0.05',
              for: '10m',
              labels: { severity: 'critical' },
              annotations: {
                summary: 'Square Catalog error rate is high',
                description: 'Square Catalog error rate is above 5% for 10 minutes',
                runbook: 'Check error logs for common issues. Verify API credentials and network connectivity. Review Square API status page.'
              }
            },
            {
              alert: 'SquareRateLimitingActive',
              expr: 'rate(square_rate_limits_total[1m]) > 0',
              for: '2m',
              labels: { severity: 'warning' },
              annotations: {
                summary: 'Square API rate limiting detected',
                description: 'Rate limiting is being applied to Square API calls',
                runbook: 'Reduce request frequency. Implement exponential backoff. Check if multiple instances are running.'
              }
            },
            {
              alert: 'NodeEventLoopLagHigh',
              expr: 'histogram_quantile(0.99, rate(nodejs_eventloop_lag_seconds_bucket[5m])) > 0.1',
              for: '5m',
              labels: { severity: 'warning' },
              annotations: {
                summary: 'Node.js event loop lag is high',
                description: 'Event loop lag is above 100ms at 99th percentile',
                runbook: 'Check for CPU-intensive operations. Review memory usage and garbage collection patterns.'
              }
            },
            {
              alert: 'SquareCatalogVersionDrift',
              expr: 'changes(square_catalog_version[1h]) > 0',
              for: '0m',
              labels: { severity: 'info' },
              annotations: {
                summary: 'Square Catalog version changed',
                description: 'The catalog version has changed, indicating updates to the catalog',
                runbook: 'Monitor for any related issues. Check if the change was expected.'
              }
            }
          ]
        }
      ]
    };
  }

  /**
   * Generate Grafana dashboard configuration
   */
  generateGrafanaDashboard() {
    return {
      dashboard: {
        title: 'Square Catalog Agent Observability',
        panels: [
          {
            title: 'Request Rate (RPS)',
            type: 'stat',
            targets: [{
              expr: 'rate(square_catalog_requests_total[1m])',
              legendFormat: '{{operation}}'
            }]
          },
          {
            title: 'Error Rate',
            type: 'stat',
            targets: [{
              expr: 'rate(square_catalog_errors_total[1m]) / rate(square_catalog_requests_total[1m]) * 100',
              legendFormat: 'Error Rate %'
            }]
          },
          {
            title: 'Response Time Percentiles',
            type: 'graph',
            targets: [
              {
                expr: 'histogram_quantile(0.50, rate(square_catalog_operation_duration_seconds_bucket[5m]))',
                legendFormat: 'p50'
              },
              {
                expr: 'histogram_quantile(0.95, rate(square_catalog_operation_duration_seconds_bucket[5m]))',
                legendFormat: 'p95'
              },
              {
                expr: 'histogram_quantile(0.99, rate(square_catalog_operation_duration_seconds_bucket[5m]))',
                legendFormat: 'p99'
              }
            ]
          },
          {
            title: 'Active Operations',
            type: 'graph',
            targets: [{
              expr: 'square_catalog_active_operations',
              legendFormat: '{{operation_type}}'
            }]
          },
          {
            title: 'Node.js Event Loop Lag',
            type: 'graph',
            targets: [{
              expr: 'histogram_quantile(0.99, rate(nodejs_eventloop_lag_seconds_bucket[5m]))',
              legendFormat: 'Event Loop Lag (p99)'
            }]
          }
        ]
      }
    };
  }

  /**
   * Get metrics for external consumption
   */
  async getMetrics(format = 'prometheus') {
    switch (format) {
      case 'prometheus':
        return await this.register.metrics();
      case 'json':
        return await this.register.getMetricsAsJSON();
      default:
        return await this.register.metrics();
    }
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.register.resetMetrics();
  }

  /**
   * Get current metric values for health checks
   */
  getCurrentMetrics() {
    try {
      // Get metric values using the registry approach since _getValue is not public
      const metricsAsJSON = this.register.getMetricsAsJSON();
      const result = {
        totalRequests: 0,
        totalErrors: 0,
        activeOperations: 0
      };
      
      // Handle both array and object responses
      const metrics = Array.isArray(metricsAsJSON) ? metricsAsJSON : Object.values(metricsAsJSON);
      
      metrics.forEach(metric => {
        if (metric.name === 'square_catalog_requests_total') {
          result.totalRequests = metric.values?.reduce((sum, v) => sum + (v.value || 0), 0) || 0;
        } else if (metric.name === 'square_catalog_errors_total') {
          result.totalErrors = metric.values?.reduce((sum, v) => sum + (v.value || 0), 0) || 0;
        } else if (metric.name === 'square_catalog_active_operations') {
          result.activeOperations = metric.values?.reduce((sum, v) => sum + (v.value || 0), 0) || 0;
        }
      });
      
      return result;
    } catch (error) {
      console.warn('Error getting current metrics:', error.message);
      return {
        totalRequests: 0,
        totalErrors: 0,
        activeOperations: 0
      };
    }
  }
}

export default PrometheusMetrics;
