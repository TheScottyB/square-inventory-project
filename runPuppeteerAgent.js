// Main script to execute the PuppeteerSEOAgent
import PuppeteerSEOAgent from './src/agents/PuppeteerSEOAgent.js';
import { exportSEOSnapshot } from './scripts/export-seo-snapshot.js';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

// Load active items
const activeItemsData = await fs.readFile('./data/active-items.json', 'utf8');
const activeItems = JSON.parse(activeItemsData);

// Filter only items with SEO data
const seoEnabledItems = activeItems.items.filter(item => item.seo);

(async () => {
  const agent = new PuppeteerSEOAgent();
  
  try {
    // Create pre-run snapshot
    console.log('📸 Creating pre-run SEO snapshot...');
    await exportSEOSnapshot();
    
    await agent.initialize();
    await agent.loginToSquare();
    console.log(`Found ${seoEnabledItems.length} items with SEO data`);
    
    const results = await agent.processBatch(seoEnabledItems);
    
    // Create post-run snapshot for comparison
    console.log('\n📸 Creating post-run SEO snapshot...');
    await exportSEOSnapshot();
    
    // Summary report
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log('\n🎯 Final Results:');
    console.log(`   ✅ Successful updates: ${successful}`);
    console.log(`   ❌ Failed updates: ${failed}`);
    console.log(`   📊 Success rate: ${((successful / results.length) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log('\n❌ Failed items:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   • ${r.item}: ${r.error}`);
      });
    }
    
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await agent.cleanup();
  }
})();
