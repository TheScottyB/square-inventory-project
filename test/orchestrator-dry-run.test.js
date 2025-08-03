import { InventoryAutomationOrchestrator } from '../src/orchestration/InventoryAutomationOrchestrator.js';
import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import path from 'path';
import fs from 'fs-extra';

/**
 * Integration test suite for InventoryAutomationOrchestrator
 * Tests the full automation pipeline in dry-run mode with realistic data
 */

describe('InventoryAutomationOrchestrator Integration Tests', () => {
  let orchestrator;
  let catalogAgent;
  const testImageDir = path.resolve(__dirname, '../assets/images/miscellaneous-products');

  beforeAll(async () => {
    // Initialize orchestrator in dry-run mode
    orchestrator = new InventoryAutomationOrchestrator({
      enableDryRun: true,
      autoApplyFileRenames: false,
      batchSize: 5,
      concurrency: 2
    });

    // Initialize catalog agent for real API testing (when not in dry-run)
    catalogAgent = new SquareCatalogAgent();
    
    // Verify test images exist
    const imageExists = await fs.pathExists(testImageDir);
    if (!imageExists) {
      throw new Error(`Test image directory not found: ${testImageDir}`);
    }
  });

  test('should complete full pipeline in dry-run mode', async () => {
    console.log('\n🧪 Testing full orchestrator pipeline in dry-run mode...');
    
    try {
      const report = await orchestrator.executeFullPipeline(testImageDir);

      // Validate report structure
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('processedImages');
      expect(report).toHaveProperty('groupedProducts');
      expect(report).toHaveProperty('catalogResults');
      expect(report).toHaveProperty('successRate');
      
      // Validate metrics
      expect(report.successRate).toBeGreaterThanOrEqual(95);
      expect(report.summary.totalImages).toBeGreaterThan(0);
      expect(report.summary.processedSuccessfully).toBeGreaterThanOrEqual(0);
      
      console.log('\n📊 Pipeline Report:');
      console.log(`   Images Processed: ${report.summary.totalImages}`);
      console.log(`   Success Rate: ${report.successRate}%`);
      console.log(`   Groups Created: ${report.groupedProducts?.length || 0}`);
      console.log('\n✅ Full pipeline executed successfully in dry-run mode!');

    } catch (error) {
      console.error('❌ Pipeline execution failed:', error.message);
      throw error;
    }
  }, 30000); // 30 second timeout for full pipeline

  test('should handle individual agent operations', async () => {
    console.log('\n🔧 Testing individual agent operations...');
    
    try {
      // Test image discovery
      const images = await orchestrator.discoverImages(testImageDir);
      expect(images).toBeInstanceOf(Array);
      expect(images.length).toBeGreaterThan(0);
      console.log(`   📸 Discovered ${images.length} images`);

      // Test batch processing setup
      const batches = orchestrator.createProcessingBatches(images, 3);
      expect(batches).toBeInstanceOf(Array);
      expect(batches.length).toBeGreaterThan(0);
      console.log(`   📦 Created ${batches.length} processing batches`);
      
      console.log('   ✅ Individual operations working correctly');
      
    } catch (error) {
      console.error('❌ Individual operations failed:', error.message);
      throw error;
    }
  });

  test('should validate configuration options', () => {
    console.log('\n⚙️ Testing configuration validation...');
    
    // Test default configuration
    const defaultOrchestrator = new InventoryAutomationOrchestrator();
    expect(defaultOrchestrator.config).toHaveProperty('enableDryRun');
    expect(defaultOrchestrator.config).toHaveProperty('batchSize');
    expect(defaultOrchestrator.config).toHaveProperty('concurrency');
    
    // Test custom configuration
    const customOrchestrator = new InventoryAutomationOrchestrator({
      batchSize: 10,
      concurrency: 5,
      confidenceThreshold: 0.8,
      matchingThreshold: 0.7
    });
    expect(customOrchestrator.config.batchSize).toBe(10);
    expect(customOrchestrator.config.concurrency).toBe(5);
    expect(customOrchestrator.config.confidenceThreshold).toBe(0.8);
    expect(customOrchestrator.config.matchingThreshold).toBe(0.7);
    
    console.log('   ✅ Configuration validation passed');
  });

  test('should handle error conditions gracefully', async () => {
    console.log('\n🚨 Testing error handling...');
    
    try {
      // Test with non-existent directory
      const invalidDir = '/path/that/does/not/exist';
      
      await expect(async () => {
        await orchestrator.executeFullPipeline(invalidDir);
      }).rejects.toThrow();
      
      console.log('   ✅ Error handling for invalid directory works');
      
      // Test with empty directory (if we can create one)
      const tempDir = path.resolve(__dirname, '../temp-test-empty');
      await fs.ensureDir(tempDir);
      
      try {
        const report = await orchestrator.executeFullPipeline(tempDir);
        expect(report.summary.totalImages).toBe(0);
        console.log('   ✅ Error handling for empty directory works');
      } finally {
        await fs.remove(tempDir);
      }
      
    } catch (error) {
      console.error('❌ Error handling test failed:', error.message);
      throw error;
    }
  });

  // Optional: Test with real Square API if not in CI environment
  test.skip('should connect to Square API in non-dry-run mode', async () => {
    console.log('\n🔗 Testing real Square API connection...');
    
    try {
      const isConnected = await catalogAgent.testConnection();
      expect(isConnected).toBe(true);
      
      const locations = await catalogAgent.getLocations();
      expect(locations).toBeInstanceOf(Array);
      expect(locations.length).toBeGreaterThan(0);
      
      console.log(`   ✅ Connected to Square API with ${locations.length} locations`);
      
    } catch (error) {
      console.warn('   ⚠️ Square API connection test skipped:', error.message);
      // Don't fail the test if API credentials aren't available
    }
  });
});
