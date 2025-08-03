import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import { SquareCatalogAgent } from '../SquareCatalogAgent.js';
import { CatalogObserver } from '../observability/CatalogObserver.js';

/**
 * CatalogMonitoringAgent - Continuous monitoring and health assessment
 * 
 * This agent continuously monitors the Square catalog for:
 * - Inventory changes and updates
 * - Data quality issues (missing SKUs, descriptions, images)
 * - Performance metrics and trends
 * - Sync status between systems
 * - Anomaly detection (price changes, stock issues)
 * - Compliance monitoring (SEO standards, completeness)
 * - Automated alerting for issues requiring attention
 * 
 * Monitoring Capabilities:
 * - Real-time catalog health scoring
 * - Automated quality assurance checks
 * - Performance trend analysis
 * - Inventory optimization recommendations
 * - Proactive issue detection
 * - Automated reporting and dashboards
 */
export class CatalogMonitoringAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      monitoringInterval: options.monitoringInterval || 300000, // 5 minutes
      enableAlerts: options.enableAlerts || true,
      alertThresholds: options.alertThresholds || {
        healthScore: 0.8,
        missingImages: 10,
        missingDescriptions: 15,
        missingSKUs: 20,
        priceAnomalies: 5
      },
      enableTrendAnalysis: options.enableTrendAnalysis || true,
      enableAutomatedReports: options.enableAutomatedReports || true,
      reportInterval: options.reportInterval || 86400000, // 24 hours
      ...options
    };

    // Initialize Square API agent
    this.squareAgent = new SquareCatalogAgent();
    
    // Monitoring state
    this.monitoringState = {
      isActive: false,
      lastCheck: null,
      consecutiveErrors: 0,
      catalogSnapshots: [],
      healthHistory: [],
      alertHistory: [],
      performanceMetrics: new Map(),
      trendData: new Map()
    };

    // Health check criteria
    this.healthCriteria = {
      completeness: {
        weight: 0.3,
        checks: [
          { name: 'has_sku', required: true, weight: 0.4 },
          { name: 'has_description', required: true, weight: 0.3 },
          { name: 'has_image', required: true, weight: 0.2 },
          { name: 'has_price', required: true, weight: 0.1 }
        ]
      },
      
      quality: {
        weight: 0.25,
        checks: [
          { name: 'description_length', minLength: 50, weight: 0.3 },
          { name: 'title_optimization', minLength: 10, maxLength: 60, weight: 0.3 },
          { name: 'category_assigned', required: true, weight: 0.2 },
          { name: 'seo_fields_populated', required: false, weight: 0.2 }
        ]
      },
      
      consistency: {
        weight: 0.2,
        checks: [
          { name: 'pricing_consistency', tolerance: 0.1, weight: 0.4 },
          { name: 'naming_convention', pattern: /^[A-Z]/, weight: 0.3 },
          { name: 'category_consistency', weight: 0.3 }
        ]
      },
      
      performance: {
        weight: 0.15,
        checks: [
          { name: 'image_optimization', maxSize: 2000000, weight: 0.4 },
          { name: 'load_speed', maxTime: 3000, weight: 0.3 },
          { name: 'search_optimization', weight: 0.3 }
        ]
      },
      
      compliance: {
        weight: 0.1,
        checks: [
          { name: 'required_fields', weight: 0.5 },
          { name: 'content_standards', weight: 0.3 },
          { name: 'legal_compliance', weight: 0.2 }
        ]
      }
    };

    // Alert rules
    this.alertRules = [
      {
        name: 'catalog_health_decline',
        condition: (current, previous) => current.overallHealth < previous.overallHealth - 0.1,
        severity: 'warning',
        message: 'Catalog health score has declined significantly'
      },
      {
        name: 'missing_critical_data',
        condition: (snapshot) => snapshot.missingCriticalData > this.options.alertThresholds.missingDescriptions,
        severity: 'error',
        message: 'High number of items missing critical data'
      },
      {
        name: 'price_anomalies',
        condition: (snapshot) => snapshot.priceAnomalies > this.options.alertThresholds.priceAnomalies,
        severity: 'warning',
        message: 'Unusual price changes detected'
      },
      {
        name: 'sync_failures',
        condition: (snapshot) => snapshot.syncFailures > 0,
        severity: 'error',
        message: 'Catalog synchronization failures detected'
      }
    ];

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/catalog-monitoring'
    });

    this.stats = {
      monitoringCycles: 0,
      healthChecksPerformed: 0,
      alertsTriggered: 0,
      issuesDetected: 0,
      issuesResolved: 0,
      averageHealthScore: 0,
      uptime: 0
    };
  }

  /**
   * Start continuous catalog monitoring
   * @param {Object} options - Monitoring options
   * @returns {Promise<void>}
   */
  async startMonitoring(options = {}) {
    if (this.monitoringState.isActive) {
      this.observer.log('warning', 'Monitoring already active');
      return;
    }

    try {
      this.observer.log('info', '🔍 Starting catalog monitoring system');
      
      this.monitoringState.isActive = true;
      this.monitoringState.startTime = Date.now();
      
      // Perform initial health check
      await this.performHealthCheck();
      
      // Start monitoring interval
      this.startMonitoringInterval();
      
      // Start automated reporting if enabled
      if (this.options.enableAutomatedReports) {
        this.startAutomatedReporting();
      }
      
      this.observer.log('info', `✅ Catalog monitoring started with ${this.options.monitoringInterval / 1000}s interval`);
      this.emit('monitoring-started', { timestamp: new Date().toISOString() });

    } catch (error) {
      this.observer.log('error', `Failed to start monitoring: ${error.message}`);
      this.monitoringState.isActive = false;
      throw error;
    }
  }

  /**
   * Stop catalog monitoring
   * @returns {Promise<void>}
   */
  async stopMonitoring() {
    if (!this.monitoringState.isActive) {
      this.observer.log('warning', 'Monitoring not active');
      return;
    }

    try {
      this.observer.log('info', '🛑 Stopping catalog monitoring system');
      
      this.monitoringState.isActive = false;
      
      // Clear intervals
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }
      
      if (this.reportingInterval) {
        clearInterval(this.reportingInterval);
        this.reportingInterval = null;
      }
      
      // Calculate uptime
      const uptime = Date.now() - this.monitoringState.startTime;
      this.stats.uptime = uptime;
      
      this.observer.log('info', `✅ Monitoring stopped. Uptime: ${Math.round(uptime / 1000)}s`);
      this.emit('monitoring-stopped', { uptime, stats: this.stats });

    } catch (error) {
      this.observer.log('error', `Error stopping monitoring: ${error.message}`);
      throw error;
    }
  }

  /**
   * Perform comprehensive health check
   * @returns {Promise<Object>} Health check results
   */
  async performHealthCheck() {
    const traceId = this.observer.startTrace('catalog_health_check');
    const checkStart = Date.now();
    
    try {
      this.observer.log('info', '🏥 Performing catalog health check');
      
      // Fetch current catalog data
      const catalogSnapshot = await this.captureCatalogSnapshot();
      
      // Run all health criteria checks
      const healthResults = await this.runHealthChecks(catalogSnapshot);
      
      // Calculate overall health score
      const healthScore = this.calculateOverallHealthScore(healthResults);
      
      // Detect trends and anomalies
      const trendAnalysis = this.analyzeTrends(catalogSnapshot);
      
      // Check for alerts
      const alerts = this.checkAlertConditions(catalogSnapshot, healthScore);
      
      // Compile health report
      const healthReport = {
        timestamp: new Date().toISOString(),
        overallHealth: healthScore,
        snapshot: catalogSnapshot,
        healthResults,
        trendAnalysis,
        alerts,
        recommendations: this.generateRecommendations(healthResults, trendAnalysis),
        metadata: {
          checkDuration: Date.now() - checkStart,
          itemsChecked: catalogSnapshot.totalItems,
          checksPerformed: Object.keys(healthResults).length
        }
      };
      
      // Store in history
      this.monitoringState.healthHistory.push(healthReport);
      this.monitoringState.lastCheck = Date.now();
      
      // Keep only recent history (last 100 checks)
      if (this.monitoringState.healthHistory.length > 100) {
        this.monitoringState.healthHistory = this.monitoringState.healthHistory.slice(-100);
      }
      
      // Trigger alerts if needed
      if (alerts.length > 0) {
        await this.processAlerts(alerts);
      }
      
      // Update stats
      this.stats.healthChecksPerformed++;
      this.stats.averageHealthScore = this.calculateAverageHealthScore();
      
      this.observer.log('info', `✅ Health check completed. Score: ${healthScore.toFixed(2)}`);
      this.observer.endTrace(traceId, { healthScore, alertsTriggered: alerts.length });
      
      this.emit('health-check-completed', healthReport);
      
      return healthReport;

    } catch (error) {
      this.monitoringState.consecutiveErrors++;
      this.observer.log('error', `Health check failed: ${error.message}`);
      this.observer.endTrace(traceId, null, error);
      
      // If too many consecutive errors, consider stopping monitoring
      if (this.monitoringState.consecutiveErrors >= 5) {
        this.observer.log('error', '🚨 Too many consecutive monitoring errors - consider stopping');
        this.emit('monitoring-error', { 
          consecutiveErrors: this.monitoringState.consecutiveErrors,
          error: error.message 
        });
      }
      
      throw error;
    }
  }

  /**
   * Capture current catalog snapshot
   * @returns {Promise<Object>} Catalog snapshot
   */
  async captureCatalogSnapshot() {
    try {
      // Fetch catalog items from Square
      const catalogItems = await this.squareAgent.searchCatalogObjects({
        objectTypes: ['ITEM'],
        limit: 1000
      });
      
      // Analyze snapshot data
      const snapshot = {
        timestamp: new Date().toISOString(),
        totalItems: catalogItems.length,
        itemsWithSKU: catalogItems.filter(item => item.itemData?.variations?.[0]?.itemVariationData?.sku).length,
        itemsWithImages: catalogItems.filter(item => item.itemData?.imageIds?.length > 0).length,
        itemsWithDescriptions: catalogItems.filter(item => item.itemData?.description?.length > 20).length,
        itemsWithCategories: catalogItems.filter(item => item.itemData?.categories?.length > 0).length,
        
        // Price analysis
        priceRange: this.analyzePriceRange(catalogItems),
        priceAnomalies: this.detectPriceAnomalies(catalogItems),
        
        // Category distribution
        categoryDistribution: this.analyzeCategoryDistribution(catalogItems),
        
        // Quality metrics
        qualityMetrics: this.calculateQualityMetrics(catalogItems),
        
        // Performance indicators
        performanceIndicators: this.calculatePerformanceIndicators(catalogItems),
        
        // Raw data for trend analysis
        rawData: catalogItems
      };
      
      // Store snapshot
      this.monitoringState.catalogSnapshots.push(snapshot);
      
      // Keep only recent snapshots (last 50)
      if (this.monitoringState.catalogSnapshots.length > 50) {
        this.monitoringState.catalogSnapshots = this.monitoringState.catalogSnapshots.slice(-50);
      }
      
      return snapshot;

    } catch (error) {
      this.observer.log('error', `Failed to capture catalog snapshot: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run comprehensive health checks
   * @param {Object} snapshot - Catalog snapshot
   * @returns {Promise<Object>} Health check results
   */
  async runHealthChecks(snapshot) {
    const results = {};
    
    // Completeness checks
    results.completeness = {
      skuCoverage: snapshot.itemsWithSKU / snapshot.totalItems,
      imageCoverage: snapshot.itemsWithImages / snapshot.totalItems,
      descriptionCoverage: snapshot.itemsWithDescriptions / snapshot.totalItems,
      categoryCoverage: snapshot.itemsWithCategories / snapshot.totalItems,
      score: this.calculateCompletenessScore(snapshot)
    };
    
    // Quality checks
    results.quality = {
      descriptionQuality: this.assessDescriptionQuality(snapshot),
      titleOptimization: this.assessTitleOptimization(snapshot),
      categoryConsistency: this.assessCategoryConsistency(snapshot),
      score: this.calculateQualityScore(snapshot)
    };
    
    // Consistency checks
    results.consistency = {
      pricingConsistency: this.assessPricingConsistency(snapshot),
      namingConsistency: this.assessNamingConsistency(snapshot),
      categoryConsistency: this.assessCategoryConsistency(snapshot),
      score: this.calculateConsistencyScore(snapshot)
    };
    
    // Performance checks
    results.performance = {
      imageOptimization: this.assessImageOptimization(snapshot),
      searchOptimization: this.assessSearchOptimization(snapshot),
      score: this.calculatePerformanceScore(snapshot)
    };
    
    // Compliance checks
    results.compliance = {
      requiredFields: this.assessRequiredFields(snapshot),
      contentStandards: this.assessContentStandards(snapshot),
      score: this.calculateComplianceScore(snapshot)
    };
    
    return results;
  }

  /**
   * Calculate overall health score
   * @param {Object} healthResults - Individual health check results
   * @returns {number} Overall health score (0-1)
   */
  calculateOverallHealthScore(healthResults) {
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const [category, criteria] of Object.entries(this.healthCriteria)) {
      if (healthResults[category]) {
        totalScore += healthResults[category].score * criteria.weight;
        totalWeight += criteria.weight;
      }
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Start monitoring interval
   */
  startMonitoringInterval() {
    this.monitoringInterval = setInterval(async () => {
      try {
        this.stats.monitoringCycles++;
        await this.performHealthCheck();
        this.monitoringState.consecutiveErrors = 0; // Reset error count on success
      } catch (error) {
        this.observer.log('error', `Monitoring cycle failed: ${error.message}`);
      }
    }, this.options.monitoringInterval);
  }

  /**
   * Start automated reporting
   */
  startAutomatedReporting() {
    this.reportingInterval = setInterval(async () => {
      try {
        await this.generateAutomatedReport();
      } catch (error) {
        this.observer.log('error', `Automated reporting failed: ${error.message}`);
      }
    }, this.options.reportInterval);
  }

  /**
   * Generate automated monitoring report
   * @returns {Promise<Object>} Generated report
   */
  async generateAutomatedReport() {
    const report = {
      reportId: `monitoring-report-${Date.now()}`,
      timestamp: new Date().toISOString(),
      period: {
        start: this.monitoringState.startTime,
        end: Date.now(),
        duration: Date.now() - this.monitoringState.startTime
      },
      
      summary: {
        totalHealthChecks: this.stats.healthChecksPerformed,
        averageHealthScore: this.stats.averageHealthScore,
        alertsTriggered: this.stats.alertsTriggered,
        issuesDetected: this.stats.issuesDetected,
        issuesResolved: this.stats.issuesResolved
      },
      
      trends: this.generateTrendReport(),
      alerts: this.generateAlertReport(),
      recommendations: this.generateSystemRecommendations(),
      
      metadata: {
        monitoringUptime: this.stats.uptime,
        systemHealth: this.assessSystemHealth()
      }
    };
    
    // Save report
    const reportPath = path.join(process.cwd(), 'reports', 'monitoring', `${report.reportId}.json`);
    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    this.observer.log('info', `📊 Automated report generated: ${reportPath}`);
    this.emit('report-generated', { reportPath, report });
    
    return report;
  }

  // Helper methods for health checks and analysis
  calculateCompletenessScore(snapshot) {
    const weights = { sku: 0.4, images: 0.3, descriptions: 0.2, categories: 0.1 };
    return (
      (snapshot.itemsWithSKU / snapshot.totalItems) * weights.sku +
      (snapshot.itemsWithImages / snapshot.totalItems) * weights.images +
      (snapshot.itemsWithDescriptions / snapshot.totalItems) * weights.descriptions +
      (snapshot.itemsWithCategories / snapshot.totalItems) * weights.categories
    );
  }

  assessDescriptionQuality(snapshot) {
    // Implementation would analyze description lengths, keywords, etc.
    return 0.75; // Placeholder
  }

  analyzePriceRange(items) {
    const prices = items
      .filter(item => item.itemData?.variations?.[0]?.itemVariationData?.priceMoney?.amount)
      .map(item => item.itemData.variations[0].itemVariationData.priceMoney.amount);
    
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      average: prices.reduce((sum, price) => sum + price, 0) / prices.length,
      count: prices.length
    };
  }

  detectPriceAnomalies(items) {
    // Simple anomaly detection - in production would be more sophisticated
    return 0; // Placeholder
  }

  calculateAverageHealthScore() {
    if (this.monitoringState.healthHistory.length === 0) return 0;
    
    const scores = this.monitoringState.healthHistory.map(h => h.overallHealth);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /**
   * Get current monitoring status
   * @returns {Object} Current status
   */
  getMonitoringStatus() {
    return {
      isActive: this.monitoringState.isActive,
      lastCheck: this.monitoringState.lastCheck,
      consecutiveErrors: this.monitoringState.consecutiveErrors,
      uptime: this.monitoringState.startTime ? Date.now() - this.monitoringState.startTime : 0,
      stats: this.stats,
      currentHealth: this.monitoringState.healthHistory.length > 0 
        ? this.monitoringState.healthHistory[this.monitoringState.healthHistory.length - 1].overallHealth 
        : null
    };
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return { ...this.stats };
  }
}