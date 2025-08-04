// Test script to run PuppeteerSEOAgent with a single item
import PuppeteerSEOAgent from './src/agents/PuppeteerSEOAgent.js';
import { exportSEOSnapshot } from './scripts/export-seo-snapshot.js';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

// Load active items
const activeItemsData = await fs.readFile('./data/active-items.json', 'utf8');
const activeItems = JSON.parse(activeItemsData);

// Filter only items with SEO data and take just the first one for testing
const seoEnabledItems = activeItems.items.filter(item => item.seo);
const testItems = seoEnabledItems.slice(0, 1); // Just test with 1 item

console.log(`🧪 Testing with ${testItems.length} item(s)`);
console.log(`📝 Test item: ${testItems[0]?.name} (${testItems[0]?.id})`);

(async () => {
  const agent = new PuppeteerSEOAgent({
    headless: false, // Show browser for debugging
    timeout: 60000,  // Longer timeout for manual intervention if needed
    retries: 1       // Single retry for testing
  });
  
  try {
    // Create pre-run snapshot
    console.log('📸 Creating pre-test SEO snapshot...');
    await exportSEOSnapshot();
    
    await agent.initialize();
    await agent.loginToSquare();
    
    console.log(`🔍 Found ${seoEnabledItems.length} total SEO-enabled items`);
    console.log(`🧪 Testing with: ${testItems[0].name}`);
    
    const results = await agent.processBatch(testItems);
    
    // Create post-run snapshot for comparison
    console.log('\n📸 Creating post-test SEO snapshot...');
    await exportSEOSnapshot();
    
    // Summary report
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log('\n🎯 Test Results:');
    console.log(`   ✅ Successful updates: ${successful}`);
    console.log(`   ❌ Failed updates: ${failed}`);
    console.log(`   📊 Success rate: ${((successful / results.length) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log('\n❌ Failed items:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   • ${r.item}: ${r.error}`);
      });
    }
    
    if (successful > 0) {
      console.log('\n🎉 Test completed successfully! Ready to run full batch.');
      console.log('   Run: pnpm run seo:run-agent');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await agent.cleanup();
  }
})();
