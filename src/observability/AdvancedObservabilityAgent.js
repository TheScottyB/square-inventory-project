import { OpenTelemetryObserver } from './OpenTelemetryObserver.js';
import { PrometheusMetrics } from './PrometheusMetrics.js';
import { VersionDriftMonitor } from './VersionDriftMonitor.js';
import { CatalogObserver } from './CatalogObserver.js';

/**
 * Advanced Observability Agent - Next-level observability for Square Catalog operations
 * Integrates OpenTelemetry, Prometheus, version monitoring, and comprehensive logging
 */
export class AdvancedObservabilityAgent {
  constructor(catalogAgent, options = {}) {
    this.catalogAgent = catalogAgent;
    this.options = {
      enableOpenTelemetry: options.enableOpenTelemetry ?? true,
      enablePrometheus: options.enablePrometheus ?? true,
      enableVersionMonitoring: options.enableVersionMonitoring ?? true,
      enableLegacyObserver: options.enableLegacyObserver ?? true,
      merchantId: options.merchantId || 'primary',
      serviceName: options.serviceName || 'square-catalog-agent',
      environment: options.environment || process.env.NODE_ENV || 'development',
      ...options
    };

    this.openTelemetryObserver = null;
    this.prometheusMetrics = null;
    this.versionDriftMonitor = null;
    this.legacyObserver = null;

    this.initialize();
  }

  /**
   * Initialize all observability components
   */
  async initialize() {
    console.log('🚀 Initializing Advanced Observability Agent...');

    try {
      // Initialize OpenTelemetry Observer
      if (this.options.enableOpenTelemetry) {
        this.openTelemetryObserver = new OpenTelemetryObserver({
          serviceName: this.options.serviceName,
          logLevel: this.options.logLevel || 'info',
          defaultSampleRate: 0.05, // 5% default sampling
          enableLogTraceCorrelation: true,
          ...this.options.openTelemetry
        });
        console.log('✅ OpenTelemetry Observer initialized');
      }

      // Initialize Prometheus Metrics
      if (this.options.enablePrometheus) {
        this.prometheusMetrics = new PrometheusMetrics({
          defaultLabels: {
            service: this.options.serviceName,
            environment: this.options.environment,
            merchant_id: this.options.merchantId
          },
          ...this.options.prometheus
        });
        console.log('✅ Prometheus Metrics initialized');
      }

      // Initialize Version Drift Monitor
      if (this.options.enableVersionMonitoring) {
        this.versionDriftMonitor = new VersionDriftMonitor(this.catalogAgent, {
          merchantId: this.options.merchantId,
          ...this.options.versionMonitoring
        });
        console.log('✅ Version Drift Monitor initialized');
      }

      // Initialize Legacy Observer for backward compatibility
      if (this.options.enableLegacyObserver) {
        this.legacyObserver = new CatalogObserver({
          enableFileLogging: true,
          enableMetrics: true,
          enableTracing: true,
          logLevel: this.options.logLevel || 'info',
          ...this.options.legacy
        });
        console.log('✅ Legacy Observer initialized');
      }

      // Link metrics to catalog agent
      if (this.prometheusMetrics) {
        this.catalogAgent.prometheusMetrics = this.prometheusMetrics;
      }

      console.log('🎉 Advanced Observability Agent fully initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Advanced Observability Agent:', error);
      throw error;
    }
  }

  /**
   * Trace Square SDK operation with all observability layers
   */
  async traceSquareOperation(operationName, apiCall, attributes = {}) {
    const startTime = Date.now();
    let result = null;
    let error = null;

    // Enhanced attributes with merchant context
    const enhancedAttributes = {
      merchantId: this.options.merchantId,
      environment: this.options.environment,
      ...attributes
    };

    // Track active operation in Prometheus
    if (this.prometheusMetrics) {
      this.prometheusMetrics.trackActiveOperation(operationName, this.options.merchantId, true);
    }

    try {
      // Execute with OpenTelemetry tracing
      if (this.openTelemetryObserver) {
        result = await this.openTelemetryObserver.traceSquareCall(
          operationName,
          apiCall,
          enhancedAttributes
        );
      } else {
        result = await apiCall();
      }

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordOperationSuccess(operationName, duration, result, enhancedAttributes);

      return result;

    } catch (err) {
      error = err;
      const duration = Date.now() - startTime;
      this.recordOperationError(operationName, duration, error, enhancedAttributes);
      throw error;

    } finally {
      // Untrack active operation
      if (this.prometheusMetrics) {
        this.prometheusMetrics.trackActiveOperation(operationName, this.options.merchantId, false);
      }
    }
  }

  /**
   * Record successful operation across all observability layers
   */
  recordOperationSuccess(operationName, duration, result, attributes) {
    // Filter attributes for Prometheus (only keep core labels)
    const prometheusAttributes = {
      merchantId: attributes.merchantId
    };

    // Prometheus metrics
    if (this.prometheusMetrics) {
      this.prometheusMetrics.recordOperation(operationName, duration, 'success', prometheusAttributes);
      
      // Record batch-specific metrics
      if (result?.objects?.length) {
        this.prometheusMetrics.recordBatchOperation(
          operationName,
          result.objects.length,
          'success',
          attributes.merchantId
        );
      }
    }

    // Legacy observer
    if (this.legacyObserver) {
      this.legacyObserver.recordPerformanceMetric(operationName, duration, 'success', attributes);
    }
  }

  /**
   * Record operation error across all observability layers
   */
  recordOperationError(operationName, duration, error, attributes) {
    // Filter attributes for Prometheus (only keep core labels)
    const prometheusAttributes = {
      merchantId: attributes.merchantId
    };

    // Prometheus metrics
    if (this.prometheusMetrics) {
      this.prometheusMetrics.recordOperation(operationName, duration, 'error', prometheusAttributes);
      this.prometheusMetrics.recordError(operationName, error, prometheusAttributes);
    }

    // Legacy observer
    if (this.legacyObserver) {
      this.legacyObserver.recordPerformanceMetric(operationName, duration, 'error', attributes);
    }
  }

  /**
   * Enhanced logging with all context
   */
  log(level, message, context = {}, metadata = {}) {
    const enhancedContext = {
      merchantId: this.options.merchantId,
      environment: this.options.environment,
      ...context
    };

    // OpenTelemetry structured logging
    if (this.openTelemetryObserver?.logger) {
      this.openTelemetryObserver.logger[level]({
        ...enhancedContext,
        ...metadata
      }, message);
    }

    // Legacy observer logging
    if (this.legacyObserver) {
      this.legacyObserver.log(level, message, enhancedContext, metadata);
    }
  }

  /**
   * Force sample specific operations (for debugging)
   */
  forceSampleOperation(operationName, sampleRate = 1.0) {
    if (this.openTelemetryObserver) {
      this.openTelemetryObserver.forceSample(operationName, sampleRate);
    }
    this.log('info', `Forced sampling for operation: ${operationName}`, { sampleRate });
  }

  /**
   * Mark expected version change
   */
  expectVersionChange(version, withinMinutes = 60) {
    if (this.versionDriftMonitor) {
      this.versionDriftMonitor.expectVersionChange(version, withinMinutes);
    }
  }

  /**
   * Get comprehensive observability dashboard data
   */
  async getObservabilityDashboard() {
    const dashboard = {
      timestamp: new Date().toISOString(),
      merchantId: this.options.merchantId,
      environment: this.options.environment,
      components: {}
    };

    // OpenTelemetry data
    if (this.openTelemetryObserver) {
      dashboard.components.openTelemetry = {
        enabled: true,
        activeTraces: this.openTelemetryObserver.getActiveTraces(),
        samplingStats: this.openTelemetryObserver.getSamplingStats()
      };
    }

    // Prometheus metrics
    if (this.prometheusMetrics) {
      dashboard.components.prometheus = {
        enabled: true,
        currentMetrics: this.prometheusMetrics.getCurrentMetrics(),
        metricsEndpoint: '/metrics'
      };
    }

    // Version monitoring
    if (this.versionDriftMonitor) {
      dashboard.components.versionMonitoring = {
        enabled: true,
        status: this.versionDriftMonitor.getMonitoringStatus(),
        recentAlerts: this.versionDriftMonitor.getRecentAlerts(60),
        versionHistory: this.versionDriftMonitor.getVersionHistory(10)
      };
    }

    // Legacy observer
    if (this.legacyObserver) {
      dashboard.components.legacy = {
        enabled: true,
        systemHealth: this.legacyObserver.getSystemHealth(),
        performanceMetrics: this.legacyObserver.getPerformanceMetrics(1)
      };
    }

    return dashboard;
  }

  /**
   * Get alerting configuration for external systems
   */
  getAlertingConfiguration() {
    const config = {
      prometheus: this.prometheusMetrics?.generateAlertingRules() || null,
      versionMonitoring: {
        enabled: !!this.versionDriftMonitor,
        thresholds: this.versionDriftMonitor?.options || null
      },
      runbooks: {
        highLatency: 'Check Square API status. Review slow operations. Consider batch size reduction.',
        highErrorRate: 'Verify API credentials. Check network connectivity. Review Square API status.',
        rateLimiting: 'Reduce request frequency. Implement exponential backoff.',
        versionDrift: 'Check Square API changelog. Monitor for related issues.',
        eventLoopLag: 'Check CPU-intensive operations. Review memory and GC patterns.'
      }
    };

    return config;
  }

  /**
   * Get Grafana dashboard configuration
   */
  getGrafanaDashboardConfig() {
    if (this.prometheusMetrics) {
      return this.prometheusMetrics.generateGrafanaDashboard();
    }
    return null;
  }

  /**
   * Export metrics in various formats
   */
  async exportMetrics(format = 'prometheus') {
    switch (format) {
      case 'prometheus':
        return this.prometheusMetrics ? await this.prometheusMetrics.getMetrics('prometheus') : null;
      case 'json':
        return {
          prometheus: this.prometheusMetrics ? await this.prometheusMetrics.getMetrics('json') : null,
          versionMonitoring: this.versionDriftMonitor ? this.versionDriftMonitor.getMetrics() : null,
          openTelemetry: this.openTelemetryObserver ? {
            activeTraces: this.openTelemetry.getActiveTraces().length,
            samplingStats: this.openTelemetryObserver.getSamplingStats()
          } : null
        };
      case 'health':
        return {
          healthy: true,
          components: {
            openTelemetry: !!this.openTelemetryObserver,
            prometheus: !!this.prometheusMetrics,
            versionMonitoring: !!this.versionDriftMonitor,
            legacy: !!this.legacyObserver
          },
          timestamp: new Date().toISOString()
        };
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Get comprehensive system health check
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      merchantId: this.options.merchantId,
      components: {},
      alerts: []
    };

    try {
      // Check OpenTelemetry
      if (this.openTelemetryObserver) {
        const activeTraces = this.openTelemetryObserver.getActiveTraces();
        health.components.openTelemetry = {
          status: 'healthy',
          activeTraces: activeTraces.length,
          details: 'OpenTelemetry tracing operational'
        };
      }

      // Check Prometheus
      if (this.prometheusMetrics) {
        const currentMetrics = this.prometheusMetrics.getCurrentMetrics();
        health.components.prometheus = {
          status: 'healthy',
          metrics: currentMetrics,
          details: 'Prometheus metrics collection operational'
        };
      }

      // Check Version Monitoring
      if (this.versionDriftMonitor) {
        const recentAlerts = this.versionDriftMonitor.getRecentAlerts(10);
        health.components.versionMonitoring = {
          status: recentAlerts.length > 5 ? 'warning' : 'healthy',
          currentVersion: this.versionDriftMonitor.currentVersion,
          recentAlerts: recentAlerts.length,
          details: `Version monitoring active, ${recentAlerts.length} recent alerts`
        };
        
        if (recentAlerts.length > 0) {
          health.alerts.push(...recentAlerts.slice(0, 3)); // Include top 3 alerts
        }
      }

      // Check Legacy Observer
      if (this.legacyObserver) {
        const systemHealth = this.legacyObserver.getSystemHealth();
        health.components.legacy = {
          status: 'healthy',
          uptime: systemHealth.uptime,
          memory: systemHealth.memory.used,
          details: 'Legacy observer operational'
        };
      }

      // Overall health determination
      const componentStatuses = Object.values(health.components).map(c => c.status);
      if (componentStatuses.includes('critical')) {
        health.status = 'critical';
      } else if (componentStatuses.includes('warning')) {
        health.status = 'warning';
      }

    } catch (error) {
      health.status = 'critical';
      health.error = error.message;
    }

    return health;
  }

  /**
   * Graceful shutdown of all observability components
   */
  async shutdown() {
    this.log('info', 'Shutting down Advanced Observability Agent');

    try {
      // Shutdown version monitoring
      if (this.versionDriftMonitor) {
        this.versionDriftMonitor.stop();
      }

      // Shutdown OpenTelemetry
      if (this.openTelemetryObserver) {
        await this.openTelemetryObserver.shutdown();
      }

      // Shutdown legacy observer
      if (this.legacyObserver) {
        await this.legacyObserver.shutdown();
      }

      console.log('✅ Advanced Observability Agent shutdown complete');
    } catch (error) {
      console.error('❌ Error during observability shutdown:', error);
      throw error;
    }
  }
}

export default AdvancedObservabilityAgent;
