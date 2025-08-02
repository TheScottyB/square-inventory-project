import nodeSDKPkg from '@opentelemetry/sdk-node';
import autoInstrumentationsPkg from '@opentelemetry/auto-instrumentations-node';
import traceExporterPkg from '@opentelemetry/exporter-trace-otlp-http';
import resourcesPkg from '@opentelemetry/resources';
import semanticConventionsPkg from '@opentelemetry/semantic-conventions';
import * as otelAPI from '@opentelemetry/api';
import pino from 'pino';
import pinoHttp from 'pino-http';

// Extract CommonJS exports
const { NodeSDK } = nodeSDKPkg;
const { getNodeAutoInstrumentations } = autoInstrumentationsPkg;
const { OTLPTraceExporter } = traceExporterPkg;
const { Resource } = resourcesPkg;
const { SemanticResourceAttributes } = semanticConventionsPkg;
const { trace, context, SpanStatusCode, SpanKind } = otelAPI;

/**
 * Advanced OpenTelemetry Observer with adaptive sampling and rich contextualization
 * Implements next-level observability patterns for Square Catalog operations
 */
export class OpenTelemetryObserver {
  constructor(options = {}) {
    this.options = {
      serviceName: options.serviceName || 'square-catalog-agent',
      serviceVersion: options.serviceVersion || '1.0.0',
      traceExporterUrl: options.traceExporterUrl || 'http://localhost:4318/v1/traces',
      enableConsoleExporter: options.enableConsoleExporter || false,
      adaptiveSampling: options.adaptiveSampling ?? true,
      defaultSampleRate: options.defaultSampleRate || 0.05, // 5% default sampling
      errorSampleRate: options.errorSampleRate || 1.0, // 100% error sampling
      logLevel: options.logLevel || 'info',
      enableLogTraceCorrelation: options.enableLogTraceCorrelation ?? true,
      sensitiveFields: options.sensitiveFields || [
        'access_token', 'token', 'password', 'secret', 'key',
        'buyer_email', 'email', 'phone', 'ssn', 'credit_card'
      ],
      ...options
    };

    // Operation-specific sampling rates
    this.operationSampleRates = {
      'catalog.batchUpsert': 0.5,      // 50% for batch operations
      'catalog.search': 0.1,           // 10% for search operations
      'catalog.info': 0.02,            // 2% for info calls
      'locations.list': 0.02,          // 2% for location calls
      'uploadImage': 0.3,              // 30% for image uploads
      'createCatalogItem': 0.4,        // 40% for item creation
      ...options.operationSampleRates
    };

    this.tracer = null;
    this.logger = null;
    this.sdk = null;
    this.activeSpans = new Map();
    this.samplingDecisions = new Map();

    this.initialize();
  }

  /**
   * Initialize OpenTelemetry SDK and structured logging
   */
  async initialize() {
    try {
      // Initialize OpenTelemetry SDK
      this.sdk = new NodeSDK({
        resource: new Resource({
          [SemanticResourceAttributes.SERVICE_NAME]: this.options.serviceName,
          [SemanticResourceAttributes.SERVICE_VERSION]: this.options.serviceVersion,
          [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development'
        }),
        traceExporter: new OTLPTraceExporter({
          url: this.options.traceExporterUrl,
        }),
        instrumentations: [getNodeAutoInstrumentations({
          // Disable default HTTP instrumentation to add custom attributes
          '@opentelemetry/instrumentation-http': {
            enabled: true,
            requestHook: (span, request) => {
              this.enrichHttpSpan(span, request);
            }
          }
        })],
        sampler: this.createAdaptiveSampler()
      });

      await this.sdk.start();
      
      // Get tracer instance
      this.tracer = trace.getTracer(this.options.serviceName, this.options.serviceVersion);

      // Initialize structured logger with trace correlation
      this.logger = pino({
        level: this.options.logLevel,
        formatters: {
          level: (level) => ({ level: level.toUpperCase() }),
          log: (obj) => {
            // Inject trace context if available
            if (this.options.enableLogTraceCorrelation) {
              const activeSpan = trace.getActiveSpan();
              if (activeSpan) {
                const spanContext = activeSpan.spanContext();
                obj.traceId = spanContext.traceId;
                obj.spanId = spanContext.spanId;
              }
            }
            
            // Scrub sensitive information
            return this.scrubSensitiveData(obj);
          }
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: {
          paths: this.options.sensitiveFields,
          remove: true
        }
      });

      console.log(`🔍 OpenTelemetry Observer initialized for ${this.options.serviceName}`);
    } catch (error) {
      console.error('Failed to initialize OpenTelemetry Observer:', error);
      throw error;
    }
  }

  /**
   * Create adaptive sampler with operation-specific rates
   */
  createAdaptiveSampler() {
    return {
      shouldSample: (context, traceId, spanName, spanKind, attributes, links) => {
        // Always sample errors
        if (attributes?.['error'] === true || attributes?.['exception'] === true) {
          this.samplingDecisions.set(traceId, { sampled: true, reason: 'error_sampling' });
          return { decision: 1 }; // RECORD_AND_SAMPLE
        }

        // Operation-specific sampling
        const operationName = attributes?.['operation.name'] || spanName;
        const operationRate = this.operationSampleRates[operationName] || this.options.defaultSampleRate;

        const shouldSample = Math.random() < operationRate;
        this.samplingDecisions.set(traceId, { 
          sampled: shouldSample, 
          reason: shouldSample ? 'operation_sampling' : 'not_sampled',
          rate: operationRate 
        });

        return { decision: shouldSample ? 1 : 0 };
      }
    };
  }

  /**
   * Start a traced Square SDK operation with rich context
   */
  async startSquareOperation(operationName, attributes = {}) {
    const span = this.tracer.startSpan(`Square.${operationName}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'operation.name': operationName,
        'sdk.name': 'square-node-sdk',
        'sdk.version': '43.0.1',
        'merchant.id': attributes.merchantId || 'unknown',
        'service.name': this.options.serviceName,
        ...this.scrubSensitiveData(attributes)
      }
    });

    const traceId = span.spanContext().traceId;
    this.activeSpans.set(traceId, {
      span,
      operationName,
      startTime: Date.now(),
      attributes
    });

    // Create child logger with trace context
    const childLogger = this.logger.child({
      operation: operationName,
      traceId,
      spanId: span.spanContext().spanId
    });

    return { span, traceId, logger: childLogger };
  }

  /**
   * End Square operation with proper status and metrics
   */
  async endSquareOperation(traceId, result = null, error = null, additionalAttributes = {}) {
    const spanInfo = this.activeSpans.get(traceId);
    if (!spanInfo) return;

    const { span, operationName, startTime } = spanInfo;
    const duration = Date.now() - startTime;

    try {
      // Set additional attributes
      span.setAttributes({
        'operation.duration_ms': duration,
        'operation.result.success': !error,
        ...this.scrubSensitiveData(additionalAttributes)
      });

      if (result) {
        // Add result-specific attributes
        if (result.objects?.length) {
          span.setAttributes({
            'square.result.object_count': result.objects.length,
            'square.result.has_objects': true
          });
        }
        if (result.catalogVersion) {
          span.setAttributes({
            'square.catalog.version': result.catalogVersion
          });
        }
      }

      if (error) {
        // Record exception and set error status
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message
        });

        // Add error classification
        const errorInfo = this.classifySquareError(error);
        span.setAttributes({
          'error.type': errorInfo.type,
          'error.category': errorInfo.category,
          'error.retryable': errorInfo.isRetryable,
          'error.severity': errorInfo.severity,
          'square.error.code': error.result?.errors?.[0]?.code || 'unknown'
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      // Log completion
      const logLevel = error ? 'error' : 'info';
      this.logger[logLevel]({
        operation: operationName,
        duration,
        success: !error,
        traceId,
        ...(error && { error: error.message }),
        ...(result && { resultSummary: this.summarizeResult(result) })
      }, `Square operation ${operationName} completed`);

    } finally {
      span.end();
      this.activeSpans.delete(traceId);
    }
  }

  /**
   * Add child span to existing trace
   */
  addChildSpan(parentTraceId, spanName, attributes = {}) {
    const parentSpanInfo = this.activeSpans.get(parentTraceId);
    if (!parentSpanInfo) return null;

    const childSpan = this.tracer.startSpan(spanName, {
      parent: parentSpanInfo.span,
      attributes: this.scrubSensitiveData(attributes)
    });

    return childSpan;
  }

  /**
   * Wrap Square SDK call with automatic tracing
   */
  async traceSquareCall(operationName, apiCall, attributes = {}) {
    const { span, traceId, logger } = await this.startSquareOperation(operationName, attributes);
    
    try {
      const result = await context.with(trace.setSpan(context.active(), span), async () => {
        return await apiCall();
      });
      
      await this.endSquareOperation(traceId, result, null, attributes);
      return result;
    } catch (error) {
      await this.endSquareOperation(traceId, null, error, attributes);
      throw error;
    }
  }

  /**
   * Enrich HTTP spans with Square API context
   */
  enrichHttpSpan(span, request) {
    const url = request.url || request.path;
    
    // Detect Square API calls
    if (url && url.includes('squareup.com')) {
      span.setAttributes({
        'square.api.endpoint': url,
        'square.api.method': request.method,
        'http.user_agent': 'square-node-sdk/43.0.1'
      });
    }
  }

  /**
   * Classify Square errors for better observability
   */
  classifySquareError(error) {
    // Reuse existing error classification logic
    if (error?.result?.errors?.[0]) {
      const squareError = error.result.errors[0];
      return {
        type: squareError.category?.toLowerCase() || 'unknown',
        category: squareError.category,
        isRetryable: ['RATE_LIMITED', 'INTERNAL_SERVER_ERROR', 'SERVICE_UNAVAILABLE'].includes(squareError.code),
        severity: squareError.code === 'UNAUTHORIZED' ? 'critical' : 'error'
      };
    }
    
    return {
      type: 'unknown',
      category: 'UNKNOWN_ERROR',
      isRetryable: false,
      severity: 'error'
    };
  }

  /**
   * Scrub sensitive data from attributes and logs
   */
  scrubSensitiveData(data) {
    if (!data || typeof data !== 'object') return data;
    
    const scrubbed = { ...data };
    
    for (const field of this.options.sensitiveFields) {
      if (scrubbed[field]) {
        scrubbed[field] = '[REDACTED]';
      }
      
      // Handle nested objects
      for (const key in scrubbed) {
        if (typeof scrubbed[key] === 'object' && scrubbed[key] !== null) {
          if (key.toLowerCase().includes(field) || field.includes(key.toLowerCase())) {
            scrubbed[key] = '[REDACTED]';
          }
        }
      }
    }
    
    return scrubbed;
  }

  /**
   * Summarize API result for logging
   */
  summarizeResult(result) {
    const summary = {};
    
    if (result.objects) {
      summary.objectCount = result.objects.length;
      summary.objectTypes = [...new Set(result.objects.map(obj => obj.type))];
    }
    
    if (result.catalogVersion) {
      summary.catalogVersion = result.catalogVersion;
    }
    
    if (result.cursor) {
      summary.hasCursor = true;
    }
    
    return summary;
  }

  /**
   * Get sampling statistics
   */
  getSamplingStats() {
    const stats = {
      totalDecisions: this.samplingDecisions.size,
      sampled: 0,
      notSampled: 0,
      errorSampled: 0,
      operationSampled: 0
    };
    
    for (const decision of this.samplingDecisions.values()) {
      if (decision.sampled) {
        stats.sampled++;
        if (decision.reason === 'error_sampling') {
          stats.errorSampled++;
        } else {
          stats.operationSampled++;
        }
      } else {
        stats.notSampled++;
      }
    }
    
    return stats;
  }

  /**
   * Force sample specific operation types
   */
  forceSample(operationName, sampleRate = 1.0) {
    this.operationSampleRates[operationName] = sampleRate;
  }

  /**
   * Get current active traces
   */
  getActiveTraces() {
    return Array.from(this.activeSpans.entries()).map(([traceId, info]) => ({
      traceId,
      operationName: info.operationName,
      duration: Date.now() - info.startTime,
      attributes: info.attributes
    }));
  }

  /**
   * Create HTTP middleware for automatic request instrumentation
   */
  createHttpMiddleware() {
    return pinoHttp({
      logger: this.logger,
      customLogLevel: (res, err) => {
        if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
        if (res.statusCode >= 500 || err) return 'error';
        return 'info';
      },
      customSuccessMessage: (res) => `HTTP ${res.statusCode}`,
      customErrorMessage: (err, res) => `HTTP ${res.statusCode} - ${err.message}`
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.logger.info('Shutting down OpenTelemetry Observer');
    
    // End all active spans
    for (const [traceId, spanInfo] of this.activeSpans) {
      spanInfo.span.setStatus({ code: SpanStatusCode.ERROR, message: 'Shutdown' });
      spanInfo.span.end();
    }
    
    this.activeSpans.clear();
    
    if (this.sdk) {
      await this.sdk.shutdown();
    }
    
    this.logger.info('OpenTelemetry Observer shutdown complete');
  }
}

export default OpenTelemetryObserver;
