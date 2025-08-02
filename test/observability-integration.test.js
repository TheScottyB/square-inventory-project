import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import { CatalogObserver } from '../src/observability/CatalogObserver.js';
import fs from 'fs-extra';
import path from 'path';

/**
 * Test suite for observability integration with SquareCatalogAgent
 */

console.log('🧪 Starting Observability Integration Tests\n');

// Test configuration
const testConfig = {
  enableDryRun: true, // Enable dry run to avoid actual API calls
  logLevel: 'debug',
  testLogsDir: './test-logs'
};

// Ensure test logs directory exists
await fs.ensureDir(testConfig.testLogsDir);

/**
 * Test 1: Basic Agent Initialization with Observability
 */
async function testBasicInitialization() {
  console.log('📋 Test 1: Basic Agent Initialization with Observability');
  
  try {
    // Set dry run mode for testing
    process.env.SQUARE_ENVIRONMENT = 'sandbox';
    process.env.SQUARE_ACCESS_TOKEN = 'test-token-for-dry-run';
    
    const agent = new SquareCatalogAgent();
    
    // Verify agent has observability system
    if (!agent.observer) {
      throw new Error('Agent does not have observer initialized');
    }
    
    if (!(agent.observer instanceof CatalogObserver)) {
      throw new Error('Observer is not an instance of CatalogObserver');
    }
    
    console.log('✅ Agent initialized successfully with observability');
    console.log(`   - Observer instance: ${agent.observer.constructor.name}`);
    console.log(`   - File logging enabled: ${agent.observer.enableFileLogging}`);
    console.log(`   - Metrics enabled: ${agent.observer.enableMetrics}`);
    console.log(`   - Tracing enabled: ${agent.observer.enableTracing}`);
    
    return { success: true, agent };
    
  } catch (error) {
    console.error('❌ Basic initialization test failed:', error.message);
    return { success: false, error };
  }
}

/**
 * Test 2: Observability Logging and Tracing
 */
async function testObservabilityLogging(agent) {
  console.log('\n📋 Test 2: Observability Logging and Tracing');
  
  try {
    // Test structured logging
    agent.observer.log('info', 'Test log message', { testKey: 'testValue' });
    agent.observer.log('warn', 'Test warning message', { warning: true });
    agent.observer.log('error', 'Test error message', { error: 'test_error' });
    
    // Test tracing
    const traceId = agent.observer.startTrace('test_operation', { testParam: 'value' });
    agent.observer.addSpan(traceId, 'test_span', { spanData: 'test' });
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 100));
    
    agent.observer.endTrace(traceId, { result: 'success' });
    
    // Test performance metrics
    agent.observer.recordPerformanceMetric('test_operation', 150, 'success', { status: 'success' });
    
    console.log('✅ Logging and tracing test completed');
    console.log(`   - Active traces: ${agent.observer.currentOperations.size}`);
    console.log(`   - Total traces recorded: ${agent.observer.traces.size}`);
    console.log(`   - Metrics recorded successfully`);
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Logging and tracing test failed:', error.message);
    return { success: false, error };
  }
}

/**
 * Test 3: Connection Test with Observability (Dry Run)
 */
async function testConnectionWithObservability(agent) {
  console.log('\n📋 Test 3: Connection Test with Observability (Dry Run)');
  
  try {
    // Since we're in dry run mode, this should work without actual API calls
    // but still exercise the observability system
    
    // Mock the Square API methods to simulate responses
    const originalGetLocations = agent.getLocations.bind(agent);
    agent.getLocations = async function() {
      const traceId = this.observer.startTrace('getLocations');
      
      this.observer.addSpan(traceId, 'api_call', { endpoint: 'locations.list' });
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const mockLocations = [
        { id: 'mock-location-1', name: 'Test Location 1' },
        { id: 'mock-location-2', name: 'Test Location 2' }
      ];
      
      this.observer.log('info', `Found ${mockLocations.length} Square locations`, { count: mockLocations.length });
      this.observer.endTrace(traceId, { locationCount: mockLocations.length });
      
      return mockLocations;
    };
    
    // Mock catalog info
    agent.getCatalogInfo = async function() {
      return {
        limits: {
          batchUpsertMaxObjectsPerBatch: 1000,
          batchUpsertMaxTotalObjects: 10000
        }
      };
    };
    
    // Mock catalog version
    agent.getCurrentCatalogVersion = async function() {
      return 12345;
    };
    
    // Run the connection test
    const connectionResult = await agent.testConnection();
    
    if (!connectionResult) {
      throw new Error('Connection test returned false');
    }
    
    console.log('✅ Connection test with observability completed');
    console.log(`   - Connection successful: ${connectionResult}`);
    console.log(`   - Traces generated during connection test`);
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    return { success: false, error };
  }
}

/**
 * Test 4: Observability Metrics and Reporting
 */
async function testMetricsAndReporting(agent) {
  console.log('\n📋 Test 4: Observability Metrics and Reporting');
  
  try {
    // Generate some test metrics
    for (let i = 0; i < 10; i++) {
      agent.observer.recordPerformanceMetric(`test_operation_${i % 3}`, 100 + (i * 10), i % 4 === 0 ? 'error' : 'success', {
        iteration: i
      });
    }
    
    // Test system health
    const systemHealth = agent.observer.getSystemHealth();
    console.log('   - System Health:', {
      memoryUsage: `${systemHealth.memory.used}MB`,
      uptime: `${systemHealth.uptime}s`,
      activeOperations: systemHealth.activeOperations
    });
    
    // Test performance metrics
    const perfMetrics = agent.observer.getPerformanceMetrics(1); // Last 1 hour
    console.log('   - Performance Metrics:', {
      totalRequests: perfMetrics.totalRequests,
      averageResponseTime: `${perfMetrics.averageResponseTime}ms`,
      totalErrors: perfMetrics.totalErrors
    });
    
    // Test observability metrics from agent
    const agentMetrics = agent.getObservabilityMetrics();
    console.log('   - Agent Observability Metrics:', {
      activeTraces: agentMetrics.traces.active,
      totalTraces: agentMetrics.traces.total,
      alertCount: agentMetrics.alerts.length
    });
    
    // Test performance report generation
    const performanceReport = await agent.generatePerformanceReport();
    console.log('   - Performance Report Generated:', {
      reportTimestamp: performanceReport.generatedAt,
      summaryRequests: performanceReport.summary.totalRequests,
      operationCount: Object.keys(performanceReport.operations).length
    });
    
    console.log('✅ Metrics and reporting test completed');
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Metrics and reporting test failed:', error.message);
    return { success: false, error };
  }
}

/**
 * Test 5: Error Handling with Observability
 */
async function testErrorHandlingWithObservability(agent) {
  console.log('\n📋 Test 5: Error Handling with Observability');
  
  try {
    // Create a mock Square API error
    const mockSquareError = {
      message: 'Test Square API Error',
      statusCode: 400,
      result: {
        errors: [{
          code: 'BAD_REQUEST',
          category: 'INVALID_REQUEST_ERROR',
          detail: 'Test error detail',
          field: 'test_field'
        }]
      }
    };
    
    // Test error classification and handling
    const errorInfo = agent.classifySquareError(mockSquareError);
    console.log('   - Error Classification:', {
      type: errorInfo.type,
      category: errorInfo.category,
      isRetryable: errorInfo.isRetryable,
      severity: errorInfo.severity
    });
    
    // Test error handling with observability
    const handledError = agent.handleSquareError(mockSquareError, 'Test error context', { trackMetrics: true });
    
    // Test retry logic error classification
    const isRetryable = agent.isRetryableError(mockSquareError);
    console.log('   - Is Retryable:', isRetryable);
    
    // Test error metrics recording
    const errorMetrics = agent.getErrorMetrics(1);
    console.log('   - Error Metrics:', {
      total: errorMetrics.total,
      retryable: errorMetrics.retryable,
      nonRetryable: errorMetrics.nonRetryable
    });
    
    console.log('✅ Error handling with observability test completed');
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Error handling test failed:', error.message);
    return { success: false, error };
  }
}

/**
 * Test 6: File Logging and Cleanup
 */
async function testFileLoggingAndCleanup(agent) {
  console.log('\n📋 Test 6: File Logging and Cleanup');
  
  try {
    // Force enable file logging for this test
    const originalEnableFileLogging = agent.observer.enableFileLogging;
    agent.observer.enableFileLogging = true;
    agent.observer.logsDirectory = testConfig.testLogsDir;
    
    // Generate some log entries
    agent.observer.log('info', 'Test file logging message 1', { test: true });
    agent.observer.log('warn', 'Test file logging message 2', { warning: true });
    agent.observer.log('error', 'Test file logging message 3', { error: true });
    
    // Wait a bit for file operations
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Check if log files were created
    const logFiles = await fs.readdir(testConfig.testLogsDir).catch(() => []);
    console.log(`   - Log files created: ${logFiles.length > 0 ? 'Yes' : 'No'}`);
    if (logFiles.length > 0) {
      console.log(`   - Log files: ${logFiles.join(', ')}`);
    }
    
    // Test graceful shutdown
    await agent.shutdown();
    console.log('   - Graceful shutdown completed');
    
    // Restore original setting
    agent.observer.enableFileLogging = originalEnableFileLogging;
    
    console.log('✅ File logging and cleanup test completed');
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ File logging and cleanup test failed:', error.message);
    return { success: false, error };
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🚀 Starting Observability Integration Test Suite\n');
  
  const results = [];
  let agent = null;
  
  try {
    // Test 1: Basic Initialization
    const initResult = await testBasicInitialization();
    results.push({ test: 'Basic Initialization', ...initResult });
    
    if (!initResult.success) {
      console.log('\n❌ Cannot proceed with other tests due to initialization failure');
      return results;
    }
    
    agent = initResult.agent;
    
    // Test 2: Observability Logging
    const loggingResult = await testObservabilityLogging(agent);
    results.push({ test: 'Observability Logging', ...loggingResult });
    
    // Test 3: Connection Test
    const connectionResult = await testConnectionWithObservability(agent);
    results.push({ test: 'Connection Test', ...connectionResult });
    
    // Test 4: Metrics and Reporting
    const metricsResult = await testMetricsAndReporting(agent);
    results.push({ test: 'Metrics and Reporting', ...metricsResult });
    
    // Test 5: Error Handling
    const errorResult = await testErrorHandlingWithObservability(agent);
    results.push({ test: 'Error Handling', ...errorResult });
    
    // Test 6: File Logging and Cleanup
    const fileResult = await testFileLoggingAndCleanup(agent);
    results.push({ test: 'File Logging and Cleanup', ...fileResult });
    
  } catch (error) {
    console.error('❌ Test suite failed with unexpected error:', error.message);
    results.push({ test: 'Test Suite', success: false, error });
  }
  
  // Summary
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  
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
    console.log('🎉 All observability integration tests passed!');
  } else {
    console.log('⚠️ Some tests failed. Check the details above.');
  }
  
  return results;
}

// Run the tests
runAllTests().then(results => {
  // Clean up test logs directory
  fs.remove(testConfig.testLogsDir).catch(err => {
    console.warn('Warning: Could not clean up test logs directory:', err.message);
  });
}).catch(error => {
  console.error('Fatal error running tests:', error.message);
  process.exit(1);
});
