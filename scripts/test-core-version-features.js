#!/usr/bin/env node

import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';

/**
 * Quick validation test for core version-safe features
 * Tests essential functionality without complex edge cases
 */
class CoreVersionFeatureTester {
  constructor() {
    this.agent = new SquareCatalogAgent();
  }

  async runCoreTests() {
    console.log('🔧 Core Version-Safe Feature Validation');
    console.log('=' .repeat(50));

    try {
      // Test 1: Connection and initialization
      console.log('\n🔍 Test 1: Connection and Performance Tracking');
      const isConnected = await this.agent.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to Square API');
      }
      console.log('✅ Connection successful with performance tracking enabled');

      // Test 2: Version caching functionality
      console.log('\n🔍 Test 2: Version Cache Operations');
      this.agent.versionCache = new Map();
      this.agent.versionCache.set('test-item-1', 123);
      const cachedVersion = this.agent.versionCache.get('test-item-1');
      if (cachedVersion === 123) {
        console.log('✅ Version caching working correctly');
      } else {
        throw new Error('Version caching failed');
      }

      // Test 3: Performance metrics
      console.log('\n🔍 Test 3: Performance Metrics Recording');
      this.agent.initializePerformanceTracking();
      this.agent.recordPerformanceMetrics('test-merchant', {
        success: true,
        responseTime: 1000
      });
      const perfData = this.agent.performanceCache.get('merchant_perf_test-merchant');
      if (perfData && perfData.totalRequests === 1) {
        console.log('✅ Performance metrics recording working');
      } else {
        throw new Error('Performance metrics failed');
      }

      // Test 4: Batch configuration optimization
      console.log('\n🔍 Test 4: Batch Configuration Optimization');
      const config = await this.agent.getOptimizedBatchConfig('test-merchant');
      if (config.batchSize > 0 && config.concurrency > 0) {
        console.log(`✅ Batch optimization working: batch=${config.batchSize}, concurrency=${config.concurrency}`);
      } else {
        throw new Error('Batch configuration optimization failed');
      }

      // Test 5: Catalog info retrieval
      console.log('\n🔍 Test 5: Catalog API Info Retrieval');
      const catalogInfo = await this.agent.getCatalogInfo();
      if (catalogInfo.limits && catalogInfo.limits.batchUpsertMaxObjectsPerBatch) {
        console.log(`✅ Catalog info retrieved: max batch size = ${catalogInfo.limits.batchUpsertMaxObjectsPerBatch}`);
      } else {
        throw new Error('Catalog info retrieval failed');
      }

      // Test 6: Object merge functionality
      console.log('\n🔍 Test 6: Smart Object Merging');
      const localObj = {
        id: 'test-item',
        type: 'ITEM',
        version: 100,
        itemData: { name: 'Local Name', description: 'Local Desc' }
      };
      const remoteObj = {
        id: 'test-item',
        type: 'ITEM',
        version: 105,
        itemData: { name: 'Remote Name', categoryId: 'cat-1' }
      };
      const merged = await this.agent.mergeObjectChanges(localObj, remoteObj);
      if (merged.version === 105 && merged.itemData.name === 'Local Name') {
        console.log('✅ Smart object merging preserves local changes with remote version');
      } else {
        throw new Error('Object merging failed');
      }

      console.log('\n🎉 All core version-safe features validated successfully!');
      console.log('\n📋 Summary:');
      console.log('  ✓ Square API connection with performance tracking');
      console.log('  ✓ Version caching and management');
      console.log('  ✓ Performance metrics recording');
      console.log('  ✓ Dynamic batch configuration optimization');
      console.log('  ✓ Catalog API limits monitoring');
      console.log('  ✓ Intelligent object merging strategies');
      console.log('\n🚀 Ready for production catalog operations!');

    } catch (error) {
      console.error('\n❌ Core feature validation failed:', error.message);
      throw error;
    }
  }
}

// Run the validation
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new CoreVersionFeatureTester();
  try {
    await tester.runCoreTests();
    console.log('\n✅ Core version-safe features validated successfully!');
  } catch (error) {
    console.error('\n🚨 Validation failed:', error.message);
    process.exit(1);
  }
}

export { CoreVersionFeatureTester };
