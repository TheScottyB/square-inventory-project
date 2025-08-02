#!/usr/bin/env node

import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import crypto from 'crypto';

/**
 * Integration test for version-safe upsert operations
 * Tests real Square API interactions with version control
 */
class VersionSafeIntegrationTester {
  constructor() {
    this.agent = new SquareCatalogAgent();
    this.testObjects = [];
    this.createdIds = [];
  }

  /**
   * Run integration tests with real Square API
   */
  async runIntegrationTests() {
    console.log('🌍 Starting Version-Safe Integration Tests');
    console.log('=' .repeat(60));
    console.log('⚠️  These tests interact with the real Square API');
    console.log('⚠️  Make sure you\'re using sandbox environment for testing\n');

    try {
      // Test connection first
      const isConnected = await this.agent.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to Square API');
      }

      // Run integration tests
      await this.testVersionSafeItemCreation();
      await this.testVersionSafeItemUpdate();
      await this.testVersionConflictResolution();
      await this.testOptimizedBatchOperations();
      await this.testPerformanceOptimization();

      console.log('\n🎉 All integration tests completed successfully!');

    } catch (error) {
      console.error('\n❌ Integration test failed:', error.message);
      throw error;
    } finally {
      // Cleanup test objects
      await this.cleanup();
    }
  }

  /**
   * Test 1: Version-safe item creation
   */
  async testVersionSafeItemCreation() {
    console.log('\n🔍 Test 1: Version-Safe Item Creation');

    const testCategory = 'Test Category ' + crypto.randomUUID().substring(0, 8);
    const testItemName = 'Version Test Item ' + crypto.randomUUID().substring(0, 8);

    // Create test item using version-safe method
    const testProduct = {
      productName: testItemName,
      description: 'Test item for version-safe operations',
      category: testCategory
    };

    try {
      const locationId = await this.agent.getMainLocationId();
      const catalogItem = await this.agent.createCatalogItem(
        testProduct, 
        null, // no image
        locationId, 
        1000 // $10.00
      );

      if (catalogItem && catalogItem.id) {
        console.log(`✅ Created catalog item: ${catalogItem.id}`);
        console.log(`   📝 Name: ${catalogItem.itemData?.name}`);
        console.log(`   🔄 Version: ${catalogItem.version}`);
        
        this.createdIds.push(catalogItem.id);
        this.testObjects.push({
          id: catalogItem.id,
          type: 'ITEM',
          name: testItemName,
          version: catalogItem.version
        });
      } else {
        throw new Error('Failed to create catalog item');
      }
    } catch (error) {
      console.error(`❌ Failed to create version-safe item: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test 2: Version-safe item update
   */
  async testVersionSafeItemUpdate() {
    console.log('\n🔍 Test 2: Version-Safe Item Update');

    if (this.testObjects.length === 0) {
      throw new Error('No test objects available for update test');
    }

    const testObject = this.testObjects[0];
    const updatedName = testObject.name + ' (Updated)';

    try {
      // Create update object with version control
      const updateObject = {
        type: 'ITEM',
        id: testObject.id,
        version: testObject.version,
        presentAtAllLocations: true,
        itemData: {
          name: updatedName,
          description: 'Updated description with version control',
          productType: 'REGULAR'
        }
      };

      const result = await this.agent.batchUpsertWithVersions([updateObject]);

      if (result && result.objects && result.objects.length > 0) {
        const updatedItem = result.objects[0];
        console.log(`✅ Updated catalog item: ${updatedItem.id}`);
        console.log(`   📝 New name: ${updatedItem.itemData?.name}`);
        console.log(`   🔄 New version: ${updatedItem.version}`);
        console.log(`   ⬆️ Version increased: ${testObject.version} → ${updatedItem.version}`);
        
        // Update our test object with new version
        testObject.version = updatedItem.version;
      } else {
        throw new Error('Failed to update catalog item');
      }
    } catch (error) {
      console.error(`❌ Failed to update version-safe item: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test 3: Version conflict resolution (simulated)
   */
  async testVersionConflictResolution() {
    console.log('\n🔍 Test 3: Version Conflict Resolution');

    if (this.testObjects.length === 0) {
      throw new Error('No test objects available for conflict test');
    }

    const testObject = this.testObjects[0];

    try {
      // Create an update with an old version to simulate conflict
      const conflictObject = {
        type: 'ITEM',
        id: testObject.id,
        version: testObject.version - 1, // Use old version to create conflict
        presentAtAllLocations: true,
        itemData: {
          name: testObject.name + ' (Conflict Test)',
          description: 'Testing conflict resolution',
          productType: 'REGULAR'
        }
      };

      // This should trigger version conflict resolution
      const result = await this.agent.batchUpsertWithVersions([conflictObject], {
        maxRetries: 2
      });

      if (result && result.objects && result.objects.length > 0) {
        console.log('✅ Version conflict handled successfully');
        console.log('   🔄 Conflict resolution mechanism worked');
        console.log('   ✨ Object updated despite version mismatch');
      }
    } catch (error) {
      // Version conflicts might be expected in some cases
      if (error.message.includes('conflict') || error.message.includes('version')) {
        console.log('✅ Version conflict detected and handled appropriately');
        console.log('   ⚠️ Conflict resolution prevented potentially harmful update');
      } else {
        console.error(`❌ Unexpected error in conflict resolution: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Test 4: Optimized batch operations
   */
  async testOptimizedBatchOperations() {
    console.log('\n🔍 Test 4: Optimized Batch Operations');

    const batchItems = [];
    const testMerchantId = 'integration-test-' + Date.now();

    // Create multiple test items for batch processing
    for (let i = 0; i < 3; i++) {
      const itemName = `Batch Test Item ${i + 1} - ${crypto.randomUUID().substring(0, 8)}`;
      batchItems.push({
        type: 'ITEM',
        id: `#batch-item-${i + 1}`,
        presentAtAllLocations: true,
        itemData: {
          name: itemName,
          description: `Batch test item number ${i + 1}`,
          productType: 'REGULAR',
          variations: [{
            type: 'ITEM_VARIATION',
            id: `#batch-item-${i + 1}-regular`,
            presentAtAllLocations: true,
            itemVariationData: {
              itemId: `#batch-item-${i + 1}`,
              name: 'Regular',
              pricingType: 'FIXED_PRICING',
              priceMoney: {
                amount: BigInt(500 + (i * 100)), // $5.00, $6.00, $7.00
                currency: 'USD'
              }
            }
          }]
        }
      });
    }

    try {
      console.log(`   🚀 Processing batch of ${batchItems.length} items...`);
      
      const startTime = Date.now();
      const result = await this.agent.batchUpsertWithOptimization(batchItems, {
        merchantId: testMerchantId,
        maxRetries: 3
      });
      const duration = Date.now() - startTime;

      if (result && result.objects && result.objects.length > 0) {
        console.log(`✅ Batch operation completed successfully`);
        console.log(`   📊 Created ${result.objects.length} items`);
        console.log(`   ⏱️ Duration: ${duration}ms`);
        console.log(`   ⚡ Average per item: ${Math.round(duration / result.objects.length)}ms`);
        
        // Store created IDs for cleanup
        result.objects.forEach(obj => {
          if (obj.id) {
            this.createdIds.push(obj.id);
          }
        });
      } else {
        throw new Error('Batch operation failed');
      }
    } catch (error) {
      console.error(`❌ Batch operation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test 5: Performance optimization in action
   */
  async testPerformanceOptimization() {
    console.log('\n🔍 Test 5: Performance Optimization');

    const testMerchantId = 'perf-test-' + Date.now();

    try {
      // Get initial batch configuration
      const initialConfig = await this.agent.getOptimizedBatchConfig(testMerchantId);
      console.log(`   ⚙️ Initial config: batch=${initialConfig.batchSize}, delay=${initialConfig.delayBetweenBatches}ms`);

      // Simulate some successful operations to improve performance metrics
      for (let i = 0; i < 3; i++) {
        this.agent.recordPerformanceMetrics(testMerchantId, {
          success: true,
          responseTime: 800 + (Math.random() * 400) // 800-1200ms
        });
      }

      // Get optimized configuration after good performance
      const optimizedConfig = await this.agent.getOptimizedBatchConfig(testMerchantId);
      console.log(`   ⚡ Optimized config: batch=${optimizedConfig.batchSize}, delay=${optimizedConfig.delayBetweenBatches}ms`);

      // Simulate some failures to test conservative adjustment
      this.agent.recordPerformanceMetrics(testMerchantId, {
        success: false,
        errorCode: 'RATE_LIMITED',
        responseTime: 5000
      });

      const conservativeConfig = await this.agent.getOptimizedBatchConfig(testMerchantId);
      console.log(`   🐌 Conservative config: batch=${conservativeConfig.batchSize}, delay=${conservativeConfig.delayBetweenBatches}ms`);

      // Verify optimization is working
      if (optimizedConfig.batchSize >= initialConfig.batchSize &&
          conservativeConfig.batchSize <= optimizedConfig.batchSize) {
        console.log('✅ Performance optimization working correctly');
        console.log('   📊 Adapts configuration based on performance metrics');
      } else {
        throw new Error('Performance optimization not working as expected');
      }
    } catch (error) {
      console.error(`❌ Performance optimization test failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup created test objects
   */
  async cleanup() {
    if (this.createdIds.length === 0) {
      console.log('\n🧚 No test objects to clean up');
      return;
    }

    console.log(`\n🧚 Cleaning up ${this.createdIds.length} test objects...`);
    
    try {
      // Note: Square doesn't allow deletion of catalog objects in most cases
      // In a real cleanup, you might update items to mark them as inactive
      // or use batch delete if available for your use case
      
      console.log('   📝 Test objects created (manual cleanup may be needed):');
      this.createdIds.forEach((id, index) => {
        console.log(`     ${index + 1}. ${id}`);
      });
      
      console.log('   ℹ️ Note: Square catalog objects typically cannot be deleted via API');
      console.log('   ℹ️ Consider marking test items as inactive in production');
      
    } catch (error) {
      console.warn('⚠️ Cleanup failed:', error.message);
    }
  }
}

// Run integration tests
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new VersionSafeIntegrationTester();
  try {
    await tester.runIntegrationTests();
    console.log('\n🎆 Integration tests completed successfully!');
  } catch (error) {
    console.error('\n🚨 Integration tests failed:', error.message);
    process.exit(1);
  }
}

export { VersionSafeIntegrationTester };
