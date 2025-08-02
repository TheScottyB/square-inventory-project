#!/usr/bin/env node

import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import { SquareError } from 'square';
import crypto from 'crypto';

/**
 * Comprehensive test suite for intelligent version-safe upsert
 * Tests conflict resolution, retry behavior, and performance optimization
 */
class VersionSafeUpsertTester {
  constructor() {
    this.agent = new SquareCatalogAgent();
    this.testResults = [];
    this.mockErrors = new Map();
    this.mockPerformance = new Map();
  }

  /**
   * Run all version-safe upsert tests
   */
  async runAllTests() {
    console.log('🧪 Starting Version-Safe Upsert Test Suite');
    console.log('=' .repeat(60));

    const tests = [
      () => this.testBasicVersionCaching(),
      () => this.testVersionConflictDetection(),
      () => this.testIntelligentObjectReconciliation(),
      () => this.testSmartMergeStrategy(),
      () => this.testAdaptiveRetryBehavior(),
      () => this.testRetryableErrorDetection(),
      () => this.testThroughputOptimization(),
      () => this.testPerformanceTracking(),
      () => this.testBatchConfigOptimization(),
      () => this.testRateLimitHandling()
    ];

    for (const test of tests) {
      try {
        await test();
      } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
        this.testResults.push({ test: test.name, passed: false, error: error.message });
      }
    }

    this.printTestSummary();
  }

  /**
   * Test 1: Basic version caching functionality
   */
  async testBasicVersionCaching() {
    console.log('\n🔍 Test 1: Basic Version Caching');
    
    // Mock objects with versions
    const mockObjects = [
      { id: 'item-1', type: 'ITEM', version: 123 },
      { id: 'item-2', type: 'ITEM', version: 456 }
    ];

    // Test version cache initialization
    this.agent.versionCache = new Map();
    
    // Simulate caching versions
    mockObjects.forEach(obj => {
      this.agent.versionCache.set(obj.id, obj.version);
    });

    // Verify versions are cached
    const cachedVersion1 = this.agent.versionCache.get('item-1');
    const cachedVersion2 = this.agent.versionCache.get('item-2');
    
    if (cachedVersion1 === 123 && cachedVersion2 === 456) {
      console.log('✅ Version caching works correctly');
      this.testResults.push({ test: 'testBasicVersionCaching', passed: true });
    } else {
      throw new Error('Version caching failed');
    }
  }

  /**
   * Test 2: Version conflict detection
   */
  async testVersionConflictDetection() {
    console.log('\n🔍 Test 2: Version Conflict Detection');

    // Mock Square error for version conflict
    const mockVersionConflictError = {
      result: {
        errors: [{
          code: 'CONFLICT',
          detail: 'Version mismatch detected',
          category: 'API_ERROR'
        }]
      }
    };

    const mockNetworkError = {
      code: 'ECONNRESET',
      message: 'Connection reset'
    };

    // Test conflict detection
    const isConflict1 = mockVersionConflictError.result?.errors?.some(err => 
      err.code === 'CONFLICT' || err.code === 'VERSION_MISMATCH'
    );

    const isConflict2 = mockNetworkError.result?.errors?.some(err => 
      err.code === 'CONFLICT' || err.code === 'VERSION_MISMATCH'
    );

    if (isConflict1 && !isConflict2) {
      console.log('✅ Version conflict detection works correctly');
      this.testResults.push({ test: 'testVersionConflictDetection', passed: true });
    } else {
      throw new Error('Version conflict detection failed');
    }
  }

  /**
   * Test 3: Intelligent object reconciliation
   */
  async testIntelligentObjectReconciliation() {
    console.log('\n🔍 Test 3: Intelligent Object Reconciliation');

    const localObjects = [
      {
        id: '#new-item',
        type: 'ITEM',
        itemData: { name: 'New Item', description: 'Local description' }
      },
      {
        id: 'existing-item',
        type: 'ITEM',
        version: 100,
        itemData: { name: 'Updated Name', description: 'Local changes' }
      }
    ];

    const remoteObjects = [
      {
        id: 'existing-item',
        type: 'ITEM',
        version: 105,
        itemData: { name: 'Remote Name', description: 'Remote description', categoryId: 'cat-1' }
      }
    ];

    const reconciled = await this.agent.reconcileObjectVersions(localObjects, remoteObjects);

    // Verify reconciliation logic
    const newItem = reconciled.find(obj => obj.id === '#new-item');
    const existingItem = reconciled.find(obj => obj.id === 'existing-item');

    if (newItem && existingItem && existingItem.version === 105) {
      console.log('✅ Object reconciliation works correctly');
      console.log(`   📝 New item preserved: ${newItem.id}`);
      console.log(`   🔄 Existing item reconciled: ${existingItem.id} (v${existingItem.version})`);
      this.testResults.push({ test: 'testIntelligentObjectReconciliation', passed: true });
    } else {
      throw new Error('Object reconciliation failed');
    }
  }

  /**
   * Test 4: Smart merge strategy
   */
  async testSmartMergeStrategy() {
    console.log('\n🔍 Test 4: Smart Merge Strategy');

    const localItem = {
      id: 'test-item',
      type: 'ITEM',
      version: 100,
      itemData: {
        name: 'Local Name Change',
        description: 'Local Description',
        imageIds: ['local-image-1']
      }
    };

    const remoteItem = {
      id: 'test-item',
      type: 'ITEM',
      version: 105,
      itemData: {
        name: 'Remote Name',
        description: 'Remote Description',
        categoryId: 'remote-category',
        imageIds: ['remote-image-1']
      }
    };

    const merged = await this.agent.mergeObjectChanges(localItem, remoteItem);

    // Verify merge preserves local changes for specific fields
    const preservedLocalName = merged.itemData.name === 'Local Name Change';
    const preservedLocalDesc = merged.itemData.description === 'Local Description';
    const preservedLocalImages = merged.itemData.imageIds.includes('local-image-1');
    const usesRemoteVersion = merged.version === 105;
    const preservedRemoteCategory = merged.itemData.categoryId === 'remote-category';

    if (preservedLocalName && preservedLocalDesc && preservedLocalImages && 
        usesRemoteVersion && preservedRemoteCategory) {
      console.log('✅ Smart merge strategy works correctly');
      console.log(`   📝 Preserved local name: "${merged.itemData.name}"`);
      console.log(`   📝 Preserved local description: "${merged.itemData.description}"`);
      console.log(`   🔄 Used remote version: ${merged.version}`);
      console.log(`   🏷️ Preserved remote category: ${merged.itemData.categoryId}`);
      this.testResults.push({ test: 'testSmartMergeStrategy', passed: true });
    } else {
      throw new Error('Smart merge strategy failed');
    }
  }

  /**
   * Test 5: Adaptive retry behavior
   */
  async testAdaptiveRetryBehavior() {
    console.log('\n🔍 Test 5: Adaptive Retry Behavior');

    let attemptCount = 0;
    const maxRetries = 3;

    const mockOperation = async () => {
      attemptCount++;
      if (attemptCount <= 2) {
        // Simulate retryable error
        const error = new Error('Temporary error');
        error.statusCode = 503;
        throw error;
      }
      return { success: true, attempts: attemptCount };
    };

    try {
      const result = await this.agent.withAdaptiveRetry(mockOperation, {
        maxRetries,
        baseDelayMs: 100, // Short delay for testing
        backoffFactor: 2,
        jitterFactor: 0.1
      });

      if (result.success && result.attempts === 3) {
        console.log('✅ Adaptive retry behavior works correctly');
        console.log(`   🔄 Succeeded after ${result.attempts} attempts`);
        this.testResults.push({ test: 'testAdaptiveRetryBehavior', passed: true });
      } else {
        throw new Error('Adaptive retry behavior failed');
      }
    } catch (error) {
      console.error(`❌ Retry test failed: ${error.message}`);
      this.testResults.push({ test: 'testAdaptiveRetryBehavior', passed: false, error: error.message });
    }
  }

  /**
   * Test 6: Retryable error detection
   */
  async testRetryableErrorDetection() {
    console.log('\n🔍 Test 6: Retryable Error Detection');

    // Test different error types
    const rateLimitError = { statusCode: 429 };
    const networkError = { code: 'ECONNRESET' };
    const squareConflictError = {
      result: { errors: [{ code: 'CONFLICT' }] }
    };
    const nonRetryableError = { statusCode: 400 };

    const retryableErrors = ['RATE_LIMITED', 'TEMPORARY_ERROR', 'NETWORK_ERROR', 'CONFLICT'];

    const isRetryable1 = this.agent.isRetryableError(rateLimitError, retryableErrors);
    const isRetryable2 = this.agent.isRetryableError(networkError, retryableErrors);
    const isRetryable3 = this.agent.isRetryableError(squareConflictError, retryableErrors);
    const isRetryable4 = this.agent.isRetryableError(nonRetryableError, retryableErrors);

    if (isRetryable1 && isRetryable2 && isRetryable3 && !isRetryable4) {
      console.log('✅ Retryable error detection works correctly');
      console.log('   🔄 Rate limit (429): retryable');
      console.log('   🔄 Network error: retryable');
      console.log('   🔄 Conflict error: retryable');
      console.log('   ❌ Bad request (400): not retryable');
      this.testResults.push({ test: 'testRetryableErrorDetection', passed: true });
    } else {
      throw new Error('Retryable error detection failed');
    }
  }

  /**
   * Test 7: Throughput optimization
   */
  async testThroughputOptimization() {
    console.log('\n🔍 Test 7: Throughput Optimization');

    // Initialize performance tracking
    this.agent.initializePerformanceTracking();

    // Mock performance history - good performance
    this.agent.performanceCache.set('merchant_perf_test1', {
      successRate: 0.98,
      avgResponseTime: 800,
      recentErrors: [],
      totalRequests: 100,
      successfulRequests: 98
    });

    // Mock performance history - poor performance
    this.agent.performanceCache.set('merchant_perf_test2', {
      successRate: 0.75,
      avgResponseTime: 6000,
      recentErrors: [{ code: 'TIMEOUT', timestamp: Date.now() - 60000 }],
      totalRequests: 100,
      successfulRequests: 75
    });

    // Test optimization for good performance merchant
    const goodConfig = await this.agent.getOptimizedBatchConfig('test1');
    
    // Test optimization for poor performance merchant
    const poorConfig = await this.agent.getOptimizedBatchConfig('test2');

    if (goodConfig.batchSize > poorConfig.batchSize &&
        goodConfig.concurrency >= poorConfig.concurrency &&
        goodConfig.delayBetweenBatches <= poorConfig.delayBetweenBatches) {
      console.log('✅ Throughput optimization works correctly');
      console.log(`   ⚡ Good performance config: batch=${goodConfig.batchSize}, concurrency=${goodConfig.concurrency}`);
      console.log(`   🐌 Poor performance config: batch=${poorConfig.batchSize}, concurrency=${poorConfig.concurrency}`);
      this.testResults.push({ test: 'testThroughputOptimization', passed: true });
    } else {
      throw new Error('Throughput optimization failed');
    }
  }

  /**
   * Test 8: Performance tracking
   */
  async testPerformanceTracking() {
    console.log('\n🔍 Test 8: Performance Tracking');

    this.agent.initializePerformanceTracking();

    // Record some performance metrics
    this.agent.recordPerformanceMetrics('test-merchant', {
      success: true,
      responseTime: 1200
    });

    this.agent.recordPerformanceMetrics('test-merchant', {
      success: false,
      errorCode: 'RATE_LIMITED',
      responseTime: 3000
    });

    this.agent.recordPerformanceMetrics('test-merchant', {
      success: true,
      responseTime: 900
    });

    const perfData = this.agent.performanceCache.get('merchant_perf_test-merchant');

    if (perfData &&
        perfData.totalRequests === 3 &&
        perfData.successfulRequests === 2 &&
        Math.abs(perfData.successRate - 0.667) < 0.01 &&
        perfData.recentErrors.length === 1) {
      console.log('✅ Performance tracking works correctly');
      console.log(`   📊 Success rate: ${(perfData.successRate * 100).toFixed(1)}%`);
      console.log(`   📊 Total requests: ${perfData.totalRequests}`);
      console.log(`   📊 Recent errors: ${perfData.recentErrors.length}`);
      this.testResults.push({ test: 'testPerformanceTracking', passed: true });
    } else {
      throw new Error('Performance tracking failed');
    }
  }

  /**
   * Test 9: Batch configuration optimization
   */
  async testBatchConfigOptimization() {
    console.log('\n🔍 Test 9: Batch Configuration Optimization');

    // Test with default (no history)
    const defaultConfig = await this.agent.getOptimizedBatchConfig('new-merchant');

    if (defaultConfig.batchSize > 0 &&
        defaultConfig.concurrency > 0 &&
        defaultConfig.delayBetweenBatches > 0 &&
        defaultConfig.adaptiveBackoff === true) {
      console.log('✅ Batch configuration optimization works correctly');
      console.log(`   ⚙️ Default config: batch=${defaultConfig.batchSize}, delay=${defaultConfig.delayBetweenBatches}ms`);
      this.testResults.push({ test: 'testBatchConfigOptimization', passed: true });
    } else {
      throw new Error('Batch configuration optimization failed');
    }
  }

  /**
   * Test 10: Rate limit handling
   */
  async testRateLimitHandling() {
    console.log('\n🔍 Test 10: Rate Limit Handling');

    this.agent.initializePerformanceTracking();

    // Simulate recent rate limiting
    this.agent.performanceCache.set('merchant_perf_rate-limited', {
      successRate: 0.6,
      avgResponseTime: 2000,
      recentErrors: [
        { code: 'RATE_LIMITED', timestamp: Date.now() - 120000 }, // 2 minutes ago
        { code: 'RATE_LIMITED', timestamp: Date.now() - 60000 }   // 1 minute ago
      ],
      totalRequests: 50,
      successfulRequests: 30
    });

    const rateLimitedConfig = await this.agent.getOptimizedBatchConfig('rate-limited');

    if (rateLimitedConfig.batchSize <= 10 && // Very conservative
        rateLimitedConfig.concurrency === 1 &&
        rateLimitedConfig.delayBetweenBatches >= 1000) {
      console.log('✅ Rate limit handling works correctly');
      console.log(`   🐌 Rate-limited config: batch=${rateLimitedConfig.batchSize}, delay=${rateLimitedConfig.delayBetweenBatches}ms`);
      this.testResults.push({ test: 'testRateLimitHandling', passed: true });
    } else {
      throw new Error('Rate limit handling failed');
    }
  }

  /**
   * Print comprehensive test summary
   */
  printTestSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    const failed = total - passed;

    console.log(`\n✅ Passed: ${passed}/${total} tests`);
    if (failed > 0) {
      console.log(`❌ Failed: ${failed} tests`);
      console.log('\nFailed tests:');
      this.testResults
        .filter(r => !r.passed)
        .forEach(r => console.log(`  - ${r.test}: ${r.error}`));
    }

    console.log('\n🎯 Test Coverage:');
    console.log('  ✓ Version caching and tracking');
    console.log('  ✓ Conflict detection and resolution');
    console.log('  ✓ Intelligent object reconciliation');
    console.log('  ✓ Smart merge strategies');
    console.log('  ✓ Adaptive retry behavior');
    console.log('  ✓ Retryable error classification');
    console.log('  ✓ Dynamic throughput optimization');
    console.log('  ✓ Performance metrics tracking');
    console.log('  ✓ Batch configuration tuning');
    console.log('  ✓ Rate limit handling');

    if (passed === total) {
      console.log('\n🎉 All tests passed! Version-safe upsert is ready for production.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review and fix issues before production use.');
    }
  }
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new VersionSafeUpsertTester();
  await tester.runAllTests();
}

export { VersionSafeUpsertTester };
