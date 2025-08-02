/**
 * Version Drift Monitor for Square Catalog
 * Monitors catalog version changes and detects unexpected API updates
 */
export class VersionDriftMonitor {
  constructor(catalogAgent, options = {}) {
    this.catalogAgent = catalogAgent;
    this.options = {
      canaryInterval: options.canaryInterval || 300000, // 5 minutes
      versionCheckInterval: options.versionCheckInterval || 60000, // 1 minute
      alertThreshold: options.alertThreshold || 3, // Alert after 3 unexpected changes
      expectedChangeWindow: options.expectedChangeWindow || 3600000, // 1 hour window for expected changes
      enableCanaryOperations: options.enableCanaryOperations ?? true,
      merchantId: options.merchantId || 'primary',
      ...options
    };

    this.currentVersion = null;
    this.versionHistory = [];
    this.unexpectedChanges = 0;
    this.expectedChanges = new Set(); // Track expected version changes
    this.canaryInterval = null;
    this.versionCheckInterval = null;
    this.alerts = [];

    this.initialize();
  }

  /**
   * Initialize version monitoring
   */
  async initialize() {
    try {
      // Get initial version
      await this.updateCurrentVersion();
      
      // Start monitoring intervals
      this.startVersionMonitoring();
      
      console.log(`📊 Version drift monitor initialized for merchant ${this.options.merchantId}`);
      console.log(`   - Current catalog version: ${this.currentVersion}`);
      console.log(`   - Canary interval: ${this.options.canaryInterval / 1000}s`);
    } catch (error) {
      console.error('Failed to initialize version drift monitor:', error.message);
      throw error;
    }
  }

  /**
   * Start version monitoring intervals
   */
  startVersionMonitoring() {
    // Periodic version checks
    this.versionCheckInterval = setInterval(async () => {
      try {
        await this.checkVersionDrift();
      } catch (error) {
        console.error('Version drift check failed:', error.message);
      }
    }, this.options.versionCheckInterval);

    // Canary operations
    if (this.options.enableCanaryOperations) {
      this.canaryInterval = setInterval(async () => {
        try {
          await this.performCanaryOperation();
        } catch (error) {
          console.error('Canary operation failed:', error.message);
        }
      }, this.options.canaryInterval);
    }
  }

  /**
   * Update current catalog version
   */
  async updateCurrentVersion(expectationCheck = null) {
    try {
      const version = await this.catalogAgent.getCurrentCatalogVersion();
      const previousVersion = this.currentVersion;
      
      if (version !== this.currentVersion) {
        this.recordVersionChange(previousVersion, version, expectationCheck);
      }
      
      this.currentVersion = version;
      
      // Update Prometheus metrics if available
      if (this.catalogAgent.prometheusMetrics) {
        this.catalogAgent.prometheusMetrics.updateCatalogVersion(version, this.options.merchantId);
      }
      
      return version;
    } catch (error) {
      console.error('Failed to update catalog version:', error.message);
      throw error;
    }
  }

  /**
   * Check for version drift
   */
  async checkVersionDrift() {
    const previousVersion = this.currentVersion;
    const newVersion = await this.updateCurrentVersion();
    
    // No change detected
    if (newVersion === previousVersion) {
      return { drift: false, currentVersion: newVersion };
    }

    const versionChange = {
      from: previousVersion,
      to: newVersion,
      timestamp: Date.now(),
      expected: this.isExpectedChange(newVersion)
    };

    if (!versionChange.expected) {
      this.unexpectedChanges++;
      this.createVersionDriftAlert(versionChange);
    }

    return { drift: true, change: versionChange };
  }

  /**
   * Record version change in history
   */
  recordVersionChange(fromVersion, toVersion, expected = null) {
    const change = {
      from: fromVersion,
      to: toVersion,
      timestamp: Date.now(),
      expected: expected !== null ? expected : this.isExpectedChange(toVersion, false), // Don't consume here
      source: 'version_monitor'
    };

    this.versionHistory.push(change);
    
    // Keep only last 100 changes
    if (this.versionHistory.length > 100) {
      this.versionHistory = this.versionHistory.slice(-100);
    }

    // Log version change
    if (this.catalogAgent.observer) {
      const logLevel = change.expected ? 'info' : 'warn';
      this.catalogAgent.observer.log(logLevel, 'Catalog version changed', {
        fromVersion,
        toVersion,
        expected: change.expected,
        merchantId: this.options.merchantId
      });
    }
  }

  /**
   * Check if version change is expected
   */
  isExpectedChange(version, consume = true) {
    const now = Date.now();
    
    // Check if this version was marked as expected
    for (const expectedChange of this.expectedChanges) {
      if (expectedChange.version === version && 
          now <= expectedChange.expectedBy) {
        if (consume) {
          this.expectedChanges.delete(expectedChange);
        }
        return true;
      }
    }
    
    // Clean up expired expected changes
    for (const expectedChange of this.expectedChanges) {
      if (now > expectedChange.expectedBy) {
        this.expectedChanges.delete(expectedChange);
      }
    }
    
    return false;
  }

  /**
   * Mark a version change as expected
   */
  expectVersionChange(version, withinMinutes = 60) {
    const expectedBy = Date.now() + (withinMinutes * 60 * 1000);
    this.expectedChanges.add({ version, expectedBy });
    
    console.log(`📅 Marked version ${version} as expected within ${withinMinutes} minutes`);
  }

  /**
   * Perform canary operation to detect API changes
   */
  async performCanaryOperation() {
    const canaryTraceId = `canary_${Date.now()}`;
    
    try {
      // Log canary operation start
      if (this.catalogAgent.observer) {
        this.catalogAgent.observer.log('debug', 'Starting canary operation', {
          canaryId: canaryTraceId,
          merchantId: this.options.merchantId
        });
      }

      // Perform lightweight operations to detect API behavior changes
      const operations = [
        this.canaryGetCatalogInfo(),
        this.canaryListLocations(),
        this.canarySearchCatalog()
      ];

      const results = await Promise.allSettled(operations);
      
      // Analyze results for anomalies
      const anomalies = this.analyzeCanaryResults(results);
      
      if (anomalies.length > 0) {
        this.createCanaryAlert(canaryTraceId, anomalies);
      }

      return {
        canaryId: canaryTraceId,
        success: true,
        anomalies: anomalies.length,
        timestamp: Date.now()
      };

    } catch (error) {
      this.createCanaryAlert(canaryTraceId, [{ type: 'canary_failure', error: error.message }]);
      throw error;
    }
  }

  /**
   * Canary: Get catalog info
   */
  async canaryGetCatalogInfo() {
    const start = Date.now();
    try {
      const info = await this.catalogAgent.getCatalogInfo();
      const duration = Date.now() - start;
      
      return {
        operation: 'getCatalogInfo',
        success: true,
        duration,
        limits: info.limits,
        hasLimits: !!info.limits
      };
    } catch (error) {
      return {
        operation: 'getCatalogInfo',
        success: false,
        duration: Date.now() - start,
        error: error.message
      };
    }
  }

  /**
   * Canary: List locations
   */
  async canaryListLocations() {
    const start = Date.now();
    try {
      const locations = await this.catalogAgent.getLocations();
      const duration = Date.now() - start;
      
      return {
        operation: 'getLocations',
        success: true,
        duration,
        locationCount: locations.length,
        hasLocations: locations.length > 0
      };
    } catch (error) {
      return {
        operation: 'getLocations',
        success: false,
        duration: Date.now() - start,
        error: error.message
      };
    }
  }

  /**
   * Canary: Search catalog (minimal query)
   */
  async canarySearchCatalog() {
    const start = Date.now();
    try {
      const searchResult = await this.catalogAgent.searchCatalogObjects({
        objectTypes: ['ITEM'],
        limit: 1
      });
      const duration = Date.now() - start;
      
      return {
        operation: 'searchCatalog',
        success: true,
        duration,
        resultCount: searchResult.length,
        hasResults: searchResult.length > 0
      };
    } catch (error) {
      return {
        operation: 'searchCatalog',
        success: false,
        duration: Date.now() - start,
        error: error.message
      };
    }
  }

  /**
   * Analyze canary results for anomalies
   */
  analyzeCanaryResults(results) {
    const anomalies = [];
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        anomalies.push({
          type: 'operation_failure',
          operation: `canary_${index}`,
          error: result.reason?.message || 'Unknown error'
        });
        return;
      }

      const data = result.value;
      
      // Check for unusual response times
      if (data.duration > 10000) { // 10 seconds
        anomalies.push({
          type: 'high_latency',
          operation: data.operation,
          duration: data.duration,
          threshold: 10000
        });
      }
      
      // Check for API structure changes
      if (data.operation === 'getCatalogInfo' && !data.hasLimits) {
        anomalies.push({
          type: 'api_structure_change',
          operation: data.operation,
          issue: 'Missing limits in catalog info response'
        });
      }
    });
    
    return anomalies;
  }

  /**
   * Create version drift alert
   */
  createVersionDriftAlert(versionChange) {
    const alert = {
      id: `version_drift_${Date.now()}`,
      type: 'version_drift',
      severity: this.unexpectedChanges >= this.options.alertThreshold ? 'critical' : 'warning',
      timestamp: Date.now(),
      merchantId: this.options.merchantId,
      details: {
        fromVersion: versionChange.from,
        toVersion: versionChange.to,
        unexpectedChanges: this.unexpectedChanges,
        threshold: this.options.alertThreshold
      },
      message: `Unexpected catalog version change: ${versionChange.from} → ${versionChange.to}`,
      runbook: 'Check Square API changelog and verify if this change was announced. Monitor for related issues.'
    };

    this.alerts.push(alert);
    
    // Log alert
    if (this.catalogAgent.observer) {
      this.catalogAgent.observer.log(alert.severity, alert.message, alert.details);
    }

    console.warn(`🚨 Version drift alert: ${alert.message}`);
    
    return alert;
  }

  /**
   * Create canary alert
   */
  createCanaryAlert(canaryId, anomalies) {
    const alert = {
      id: `canary_alert_${Date.now()}`,
      type: 'canary_anomaly',
      severity: 'warning',
      timestamp: Date.now(),
      merchantId: this.options.merchantId,
      details: {
        canaryId,
        anomalies,
        anomalyCount: anomalies.length
      },
      message: `Canary operation detected ${anomalies.length} anomalies`,
      runbook: 'Review canary anomalies for potential API changes or issues. Check Square API status.'
    };

    this.alerts.push(alert);
    
    // Log alert
    if (this.catalogAgent.observer) {
      this.catalogAgent.observer.log(alert.severity, alert.message, alert.details);
    }

    console.warn(`🔍 Canary alert: ${alert.message}`);
    
    return alert;
  }

  /**
   * Get version history
   */
  getVersionHistory(limit = 10) {
    return this.versionHistory.slice(-limit);
  }

  /**
   * Get current monitoring status
   */
  getMonitoringStatus() {
    return {
      currentVersion: this.currentVersion,
      unexpectedChanges: this.unexpectedChanges,
      expectedChanges: Array.from(this.expectedChanges),
      totalVersionChanges: this.versionHistory.length,
      alertCount: this.alerts.length,
      monitoring: {
        versionCheck: !!this.versionCheckInterval,
        canaryOperations: !!this.canaryInterval
      }
    };
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(minutes = 60) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.alerts.filter(alert => alert.timestamp > cutoff);
  }

  /**
   * Reset unexpected change counter
   */
  resetUnexpectedChanges() {
    this.unexpectedChanges = 0;
    console.log('📊 Reset unexpected version change counter');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.versionCheckInterval) {
      clearInterval(this.versionCheckInterval);
      this.versionCheckInterval = null;
    }
    
    if (this.canaryInterval) {
      clearInterval(this.canaryInterval);
      this.canaryInterval = null;
    }
    
    console.log('🛑 Version drift monitoring stopped');
  }

  /**
   * Get monitoring metrics for external systems
   */
  getMetrics() {
    return {
      current_version: this.currentVersion,
      unexpected_changes: this.unexpectedChanges,
      total_version_changes: this.versionHistory.length,
      recent_alerts: this.getRecentAlerts(60).length,
      monitoring_active: !!(this.versionCheckInterval && this.canaryInterval)
    };
  }
}

export default VersionDriftMonitor;
