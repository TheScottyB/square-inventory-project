#!/usr/bin/env node

import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import { config } from '../src/config/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Test data
const sampleProductData = {
  productName: 'Test Product',
  description: 'A sample product for testing',
  category: 'miscellaneous',
  metadata: {
    imagePath: 'test/images/sample-product.jpg'
  }
};

const sampleImageBuffer = Buffer.from('mock-image-data');

// Test runner class
class SquareCatalogAgentTester {
  constructor() {
    this.tests = [];
    this.results = [];
  }

  // Add test
  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  // Run all tests
  async runAll() {
    console.log(`🧪 Running ${this.tests.length} tests for SquareCatalogAgent\n`);
    
    for (const { name, testFn } of this.tests) {
      try {
        console.log(`▶️  ${name}`);
        await testFn();
        console.log(`✅ ${name} - PASSED\n`);
        this.results.push({ name, status: 'PASSED' });
      } catch (error) {
        console.log(`❌ ${name} - FAILED: ${error.message}\n`);
        this.results.push({ name, status: 'FAILED', error: error.message });
      }
    }

    // Print summary
    this.printSummary();
  }

  // Print test summary
  printSummary() {
    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;
    
    console.log('📊 Test Summary:');
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📈 Total:  ${this.results.length}`);
    
    if (failed > 0) {
      console.log('\n❌ Failed tests:');
      this.results
        .filter(r => r.status === 'FAILED')
        .forEach(r => console.log(`   - ${r.name}: ${r.error}`));
    }
  }
}

// Create test runner
const tester = new SquareCatalogAgentTester();

// Sanity checks
tester.test('Agent initialization', async () => {
  const agent = new SquareCatalogAgent();
  
  if (!agent.client) throw new Error('Square client not initialized');
  if (typeof agent.enableDryRun !== 'boolean') throw new Error('enableDryRun not set properly');
  
  console.log('   ✓ Square client initialized');
  console.log(`   ✓ Dry run mode: ${agent.enableDryRun}`);
  
  // Only check API initialization if we have credentials
  if (process.env.SQUARE_ACCESS_TOKEN) {
    if (!agent.catalogApi) throw new Error('Catalog API not initialized');
    if (!agent.locationsApi) throw new Error('Locations API not initialized');
    console.log('   ✓ APIs initialized');
  } else {
    console.log('   ⚠ API initialization skipped (no access token)');
  }
});

// Dry-run tests
tester.test('Dry-run image upload', async () => {
  const agent = new SquareCatalogAgent();
  agent.enableDryRun = true;
  
  const result = await agent.uploadImage(sampleImageBuffer, sampleProductData.productName);
  
  if (!result.id.includes('mock-image')) {
    throw new Error('Dry-run image upload did not return mock ID');
  }
  
  console.log(`   ✓ Mock image uploaded: ${result.id}`);
});

tester.test('Dry-run catalog item creation', async () => {
  const agent = new SquareCatalogAgent();
  agent.enableDryRun = true;
  
  const result = await agent.createCatalogItem(sampleProductData);
  
  if (!result.id.includes('mock-item')) {
    throw new Error('Dry-run catalog item creation did not return mock ID');
  }
  
  console.log(`   ✓ Mock catalog item created: ${result.id}`);
});

tester.test('SKU generation', async () => {
  const agent = new SquareCatalogAgent();
  
  const sku = agent.generateSku(sampleProductData);
  
  if (!sku || typeof sku !== 'string' || sku.length < 5) {
    throw new Error('Generated SKU is invalid');
  }
  
  console.log(`   ✓ Generated SKU: ${sku}`);
});

tester.test('Category color mapping', async () => {
  const agent = new SquareCatalogAgent();
  
  const jewelryColor = agent.getCategoryColor('jewelry');
  const defaultColor = agent.getCategoryColor('unknown-category');
  
  if (jewelryColor !== '9da2a6') {
    throw new Error('Jewelry category color mapping failed');
  }
  
  if (defaultColor !== '78909c') {
    throw new Error('Default category color mapping failed');
  }
  
  console.log(`   ✓ Jewelry color: ${jewelryColor}`);
  console.log(`   ✓ Default color: ${defaultColor}`);
});

// Integration tests (only run if environment variables are set)
if (process.env.SQUARE_ACCESS_TOKEN) {
  tester.test('Square API connection test', async () => {
    const agent = new SquareCatalogAgent();
    agent.enableDryRun = false;
    
    const isConnected = await agent.testConnection();
    
    if (!isConnected) {
      throw new Error('Failed to connect to Square API');
    }
    
    console.log('   ✓ Successfully connected to Square API');
  });

  tester.test('Location retrieval test', async () => {
    const agent = new SquareCatalogAgent();
    agent.enableDryRun = false;
    
    const locations = await agent.getLocations();
    
    if (!Array.isArray(locations)) {
      throw new Error('Locations not returned as array');
    }
    
    console.log(`   ✓ Retrieved ${locations.length} locations`);
  });
} else {
  console.log('⚠️  Skipping integration tests - SQUARE_ACCESS_TOKEN not set\n');
}

// Run all tests
(async () => {
  try {
    await tester.runAll();
    console.log('\n🎉 Test execution completed!');
  } catch (error) {
    console.error('💥 Test runner failed:', error.message);
    process.exit(1);
  }
})();
