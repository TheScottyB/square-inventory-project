import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import fs from 'fs-extra';

/**
 * Real-world integration test with observability
 * This test will attempt to connect to the actual Square API if credentials are available
 */

console.log('🌐 Starting Real-World Integration Test with Observability\n');

async function testRealIntegration() {
  console.log('📋 Real Integration Test: Square API with Full Observability');
  
  try {
    // Check if we have Square credentials
    if (!process.env.SQUARE_ACCESS_TOKEN) {
      console.log('⚠️ No Square credentials found. Skipping real API test.');
      console.log('   Set SQUARE_ACCESS_TOKEN environment variable to test with real API.');
      return { success: true, skipped: true };
    }
    
    console.log('🔑 Square credentials found. Testing with real API...');
    
    // Initialize agent with observability
    const agent = new SquareCatalogAgent();
    
    console.log('🔧 Agent initialized with observability system');
    console.log(`   - File logging: ${agent.observer.options.enableFileLogging}`);
    console.log(`   - Metrics collection: ${agent.observer.options.enableMetrics}`);
    console.log(`   - Tracing: ${agent.observer.options.enableTracing}`);
    
    // Test real connection
    console.log('\n🔍 Testing real Square API connection...');
    const connectionResult = await agent.testConnection();
    
    if (!connectionResult) {
      throw new Error('Real API connection failed');
    }
    
    console.log('✅ Real API connection successful!');
    
    // Get observability metrics
    const metrics = agent.getObservabilityMetrics();
    console.log('\n📊 Observability Metrics after real API calls:');
    console.log('   - Active traces:', metrics.traces.active);
    console.log('   - Total traces:', metrics.traces.total);
    console.log('   - System alerts:', metrics.alerts.length);
    
    // Get performance report
    const report = await agent.generatePerformanceReport();
    console.log('\n📈 Performance Report:');
    console.log('   - Total requests:', report.summary.totalRequests);
    console.log('   - Average response time:', report.summary.averageResponseTime + 'ms');
    console.log('   - Error rate:', report.summary.errorRate.toFixed(2) + '%');
    console.log('   - Operations tracked:', Object.keys(report.operations).length);
    
    // Test graceful shutdown
    console.log('\n🛑 Testing graceful shutdown...');
    await agent.shutdown();
    console.log('✅ Graceful shutdown completed');
    
    return { success: true, metrics, report };
    
  } catch (error) {
    console.error('❌ Real integration test failed:', error.message);
    return { success: false, error };
  }
}

// Run the test
testRealIntegration().then(result => {
  console.log('\n📊 Real Integration Test Results:');
  console.log('==================================');
  
  if (result.skipped) {
    console.log('⏭️ Test skipped - no Square credentials available');
    console.log('   To test with real API, set SQUARE_ACCESS_TOKEN in your .env file');
  } else if (result.success) {
    console.log('🎉 Real integration test passed!');
    console.log('   The observability system works correctly with real Square API calls');
  } else {
    console.log('❌ Real integration test failed');
    console.log('   Error:', result.error.message);
  }
}).catch(error => {
  console.error('Fatal error in real integration test:', error.message);
});
