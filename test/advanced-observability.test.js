import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import { AdvancedObservabilityAgent } from '../src/observability/AdvancedObservabilityAgent.js';
import fs from 'fs-extra';

/**
 * Advanced Observability Test Suite
 * Tests next-level observability features including OpenTelemetry, Prometheus, and version monitoring
 */

console.log('🚀 Starting Advanced Observability Test Suite\n');

// Test configuration
const testConfig = {
  merchantId: 'test-merchant-123',
  serviceName: 'square-catalog-agent-test',
  environment: 'test',
  enableAllFeatures: true
};

/**
 * Test 1: Advanced Observability Agent Initialization
 */
async function testAdvancedObservabilityInit() {
  console.log('📋 Test 1: Advanced Observability Agent Initialization');
  
  try {
    // Set test environment
    process.env.SQUARE_ENVIRONMENT = 'sandbox';
    process.env.SQUARE_ACCESS_TOKEN = 'test-token';
    process.env.NODE_ENV = 'test';
    
    const catalogAgent = new SquareCatalogAgent();
    
    // Initialize Advanced Observability with all features
    const observabilityAgent = new AdvancedObservabilityAgent(catalogAgent, {
      merchantId: testConfig.merchantId,
      serviceName: testConfig.serviceName,
      environment: testConfig.environment,
      enableOpenTelemetry: false, // Disable for testing to avoid external dependencies
      enablePrometheus: true,
      enableVersionMonitoring: true,
      enableLegacyObserver: true,
      logLevel: 'info'
    });

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify components
    if (!observabilityAgent.prometheusMetrics) {
      throw new Error('Prometheus metrics not initialized');
    }
    
    if (!observabilityAgent.versionDriftMonitor) {
      throw new Error('Version drift monitor not initialized');
    }
    
    if (!observabilityAgent.legacyObserver) {
      throw new Error('Legacy observer not initialized');
    }

    console.log('✅ Advanced observability agent initialized successfully');
    console.log(`   - Merchant ID: ${testConfig.merchantId}`);
    console.log(`   - Service: ${testConfig.serviceName}`);
    console.log(`   - Environment: ${testConfig.environment}`);
    console.log(`   - Components: Prometheus, Version Monitor, Legacy Observer`);
    
    return { success: true, observabilityAgent, catalogAgent };
    
  } catch (error) {
    console.error('❌ Advanced observability initialization failed:', error.message);
    return { success: false, error };
  }
}

/**
 * Test 2: Prometheus Metrics Collection
 */
async function testPrometheusMetrics(observabilityAgent) {
  console.log('\n📋 Test 2: Prometheus Metrics Collection');
  
  try {
    const metrics = observabilityAgent.prometheusMetrics;
    
    // Record test operations
    metrics.recordOperation('test_operation', 1500, 'success', { merchantId: testConfig.merchantId });
    metrics.recordOperation('test_operation', 2500, 'success', { merchantId: testConfig.merchantId });
    metrics.recordOperation('test_operation', 800, 'error', { merchantId: testConfig.merchantId });
    
    // Record batch operation
    metrics.recordBatchOperation('catalog.batchUpsert', 25, 'success', testConfig.merchantId);
    
    // Record version update
    metrics.updateCatalogVersion(12345, testConfig.merchantId);
    
    // Test metrics export
    const prometheusMetrics = await metrics.getMetrics('prometheus');
    const jsonMetrics = await metrics.getMetrics('json');
    
    if (!prometheusMetrics || !jsonMetrics) {
      throw new Error('Failed to export metrics');
    }
    
    // Check for expected metrics
    if (!prometheusMetrics.includes('square_catalog_requests_total')) {
      throw new Error('Missing request counter metric');
    }
    
    if (!prometheusMetrics.includes('square_catalog_operation_duration_seconds')) {
      throw new Error('Missing latency histogram metric');
    }
    
    // Test alerting rules generation
    const alertingRules = metrics.generateAlertingRules();
    if (!alertingRules.groups || alertingRules.groups.length === 0) {
      throw new Error('No alerting rules generated');
    }
    
    console.log('✅ Prometheus metrics test completed');
    console.log(`   - Metrics exported: Prometheus (${prometheusMetrics.split('\n').length} lines)`);
    console.log(`   - JSON metrics: ${Object.keys(jsonMetrics).length} metric families`);
    console.log(`   - Alerting rules: ${alertingRules.groups[0].rules.length} rules generated`);
    
    return { success: true, metricsSize: prometheusMetrics.length, alertRules: alertingRules.groups[0].rules.length };
    
  } catch (error) {
    console.error('❌ Prometheus metrics test failed:', error.message);
    return { success: false, error };
  }
}

/**
 * Test 3: Version Drift Monitoring
 */
async function testVersionDriftMonitoring(observabilityAgent) {
  console.log('\n📋 Test 3: Version Drift Monitoring');
  
  try {
    const versionMonitor = observabilityAgent.versionDriftMonitor;
    
    // Mock catalog agent methods for testing
    const originalGetCurrentCatalogVersion = observabilityAgent.catalogAgent.getCurrentCatalogVersion;
    let mockVersion = 1000;
    
    observabilityAgent.catalogAgent.getCurrentCatalogVersion = async function() {
      return mockVersion;
    };
    
    // Test initial version setup
    await versionMonitor.updateCurrentVersion();
    console.log(`   - Initial version set: ${versionMonitor.currentVersion}`);
    
    // Test expected version change
    const newVersion = 1001;
    versionMonitor.expectVersionChange(newVersion, 5); // Expect change within 5 minutes
    mockVersion = newVersion;
    
    const driftResult = await versionMonitor.checkVersionDrift();
    if (!driftResult.drift) {
      throw new Error('Expected version drift not detected');
    }
    
    if (!driftResult.change.expected) {
      throw new Error('Expected change marked as unexpected');
    }
    
    // Test unexpected version change
    mockVersion = 1002;
    const unexpectedDrift = await versionMonitor.checkVersionDrift();
    if (!unexpectedDrift.drift || unexpectedDrift.change.expected) {
      throw new Error('Unexpected change not properly detected');
    }
    
    // Test monitoring status
    const status = versionMonitor.getMonitoringStatus();
    if (!status.monitoring.versionCheck) {
      throw new Error('Version monitoring not active');
    }
    
    // Test version history
    const history = versionMonitor.getVersionHistory(5);
    if (history.length < 2) {
      throw new Error('Version history not recorded properly');
    }
    
    // Restore original method
    observabilityAgent.catalogAgent.getCurrentCatalogVersion = originalGetCurrentCatalogVersion;
    
    console.log('✅ Version drift monitoring test completed');
    console.log(`   - Current version: ${versionMonitor.currentVersion}`);
    console.log(`   - Unexpected changes: ${versionMonitor.unexpectedChanges}`);
    console.log(`   - Version history entries: ${history.length}`);
    console.log(`   - Recent alerts: ${versionMonitor.getRecentAlerts(60).length}`);
    
    return { 
      success: true, 
      currentVersion: versionMonitor.currentVersion,
      unexpectedChanges: versionMonitor.unexpectedChanges,
      historyEntries: history.length
    };
    
  } catch (error) {
    console.error('❌ Version drift monitoring test failed:', error.message);
    return { success: false, error };
  }
}

/**
 * Test 4: Integrated Operation Tracing
 */
async function testIntegratedOperationTracing(observabilityAgent) {
  console.log('\n📋 Test 4: Integrated Operation Tracing');
  
  try {
    // Mock Square API call
    const mockApiCall = async () => {
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate API delay
      return {
        objects: [
          { id: 'test-item-1', type: 'ITEM' },
          { id: 'test-item-2', type: 'ITEM' }
        ],
        catalogVersion: 12346
      };
    };
    
    // Test successful operation tracing
    const result = await observabilityAgent.traceSquareOperation(
      'catalog.batchUpsert',
      mockApiCall,
      { itemCount: 2, batchSize: 2 }
    );
    
    if (!result || !result.objects || result.objects.length !== 2) {
      throw new Error('Operation result not properly returned');
    }
    
    // Test error operation tracing
    const errorApiCall = async () => {
      throw new Error('Test API error');
    };
    
    let errorCaught = false;
    try {
      await observabilityAgent.traceSquareOperation(
        'catalog.search',
        errorApiCall,
        { searchType: 'items' }
      );
    } catch (error) {
      errorCaught = true;
      if (error.message !== 'Test API error') {
        throw new Error('Error not properly propagated');
      }
    }
    
    if (!errorCaught) {
      throw new Error('Error operation should have thrown');
    }
    
    // Check metrics were recorded
    const currentMetrics = observabilityAgent.prometheusMetrics.getCurrentMetrics();
    console.log('   - Current metrics after operations:', currentMetrics);
    
    console.log('✅ Integrated operation tracing test completed');
    console.log(`   - Successful operation traced: catalog.batchUpsert`);
    console.log(`   - Error operation traced: catalog.search`);
    console.log(`   - Result objects: ${result.objects.length}`);
    
    return { success: true, resultCount: result.objects.length };
    
  } catch (error) {
    console.error('❌ Integrated operation tracing test failed:', error.message);
    return { success: false, error };
  }
}

/**
 * Test 5: Observability Dashboard and Health Check
 */
async function testObservabilityDashboard(observabilityAgent) {
  console.log('\n📋 Test 5: Observability Dashboard and Health Check');
  
  try {
    // Test dashboard data
    const dashboard = await observabilityAgent.getObservabilityDashboard();
    
    if (!dashboard.timestamp || !dashboard.merchantId) {
      throw new Error('Dashboard missing required metadata');
    }
    
    if (!dashboard.components.prometheus) {
      throw new Error('Dashboard missing Prometheus component');
    }
    
    if (!dashboard.components.versionMonitoring) {
      throw new Error('Dashboard missing version monitoring component');
    }
    
    // Test health check
    const health = await observabilityAgent.healthCheck();
    
    if (!health.status || !health.components) {
      throw new Error('Health check missing required fields');
    }
    
    if (health.status === 'critical') {
      throw new Error('System health is critical');
    }
    
    // Test alerting configuration
    const alertingConfig = observabilityAgent.getAlertingConfiguration();
    
    if (!alertingConfig.prometheus || !alertingConfig.runbooks) {
      throw new Error('Alerting configuration incomplete');
    }
    
    // Test metrics export
    const healthMetrics = await observabilityAgent.exportMetrics('health');
    if (!healthMetrics.healthy) {
      throw new Error('Health metrics indicate unhealthy system');
    }
    
    console.log('✅ Observability dashboard and health check test completed');
    console.log(`   - Dashboard components: ${Object.keys(dashboard.components).length}`);
    console.log(`   - System health: ${health.status}`);
    console.log(`   - Component status: ${Object.keys(health.components).join(', ')}`);
    console.log(`   - Alert rules: ${alertingConfig.prometheus.groups[0].rules.length}`);
    
    return { 
      success: true, 
      dashboardComponents: Object.keys(dashboard.components).length,
      healthStatus: health.status,
      alertRules: alertingConfig.prometheus.groups[0].rules.length
    };
    
  } catch (error) {
    console.error('❌ Observability dashboard test failed:', error.message);
    return { success: false, error };
  }
}

/**
 * Test 6: Enhanced Logging and Context
 */
async function testEnhancedLogging(observabilityAgent) {
  console.log('\n📋 Test 6: Enhanced Logging and Context');
  
  try {
    // Test enhanced logging with context
    observabilityAgent.log('info', 'Test enhanced logging', 
      { operation: 'test', itemCount: 5 },
      { correlationId: 'test-123' }
    );
    
    observabilityAgent.log('warn', 'Test warning with merchant context',
      { warningType: 'rate_limit_approaching' }
    );
    
    observabilityAgent.log('error', 'Test error logging',
      { errorType: 'api_timeout' },
      { duration: 5000, threshold: 3000 }
    );
    
    // Test force sampling
    observabilityAgent.forceSampleOperation('test_operation', 1.0);
    
    // Test version expectation
    observabilityAgent.expectVersionChange(99999, 30);
    
    console.log('✅ Enhanced logging and context test completed');
    console.log(`   - Log entries created with merchant context`);
    console.log(`   - Force sampling applied to test_operation`);
    console.log(`   - Version change expectation set`);
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Enhanced logging test failed:', error.message);
    return { success: false, error };
  }
}

/**
 * Run all advanced observability tests
 */
async function runAdvancedObservabilityTests() {
  console.log('🚀 Starting Advanced Observability Test Suite\n');
  
  const results = [];
  let observabilityAgent = null;
  
  try {
    // Test 1: Initialization
    const initResult = await testAdvancedObservabilityInit();
    results.push({ test: 'Advanced Observability Init', ...initResult });
    
    if (!initResult.success) {
      console.log('\n❌ Cannot proceed with other tests due to initialization failure');
      return results;
    }
    
    observabilityAgent = initResult.observabilityAgent;
    
    // Test 2: Prometheus Metrics
    const metricsResult = await testPrometheusMetrics(observabilityAgent);
    results.push({ test: 'Prometheus Metrics', ...metricsResult });
    
    // Test 3: Version Drift Monitoring
    const versionResult = await testVersionDriftMonitoring(observabilityAgent);
    results.push({ test: 'Version Drift Monitoring', ...versionResult });
    
    // Test 4: Integrated Operation Tracing
    const tracingResult = await testIntegratedOperationTracing(observabilityAgent);
    results.push({ test: 'Integrated Operation Tracing', ...tracingResult });
    
    // Test 5: Dashboard and Health Check
    const dashboardResult = await testObservabilityDashboard(observabilityAgent);
    results.push({ test: 'Dashboard and Health Check', ...dashboardResult });
    
    // Test 6: Enhanced Logging
    const loggingResult = await testEnhancedLogging(observabilityAgent);
    results.push({ test: 'Enhanced Logging', ...loggingResult });
    
  } catch (error) {
    console.error('❌ Test suite failed with unexpected error:', error.message);
    results.push({ test: 'Test Suite', success: false, error });
  } finally {
    // Cleanup
    if (observabilityAgent) {
      try {
        await observabilityAgent.shutdown();
        console.log('\n🧹 Observability agent shut down cleanly');
      } catch (error) {
        console.warn('⚠️ Warning: Error during shutdown:', error.message);
      }
    }
  }
  
  // Summary
  console.log('\n📊 Advanced Observability Test Results:');
  console.log('==========================================');
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.test}`);
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error.message}`);
    }
  });
  
  console.log(`\nOverall: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All advanced observability tests passed!');
    console.log('🏆 Your observability system has achieved legendary status!');
  } else {
    console.log('⚠️ Some tests failed. Check the details above.');
  }
  
  return results;
}

// Run the tests
runAdvancedObservabilityTests().catch(error => {
  console.error('Fatal error running advanced observability tests:', error.message);
  process.exit(1);
});
