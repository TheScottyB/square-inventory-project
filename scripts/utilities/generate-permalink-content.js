#!/usr/bin/env node

import { PermalinkAgent } from '../../src/agents/seo/PermalinkAgent.js';
import { ContentApprovalAgent } from '../../src/agents/content/ContentApprovalAgent.js';
import XLSX from 'xlsx';

/**
 * Generate Permalink Content for Products
 * 
 * Creates SEO-optimized permalink structures for catalog items
 */

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔗 Generate Permalink Content

USAGE:
  pnpm run permalinks:generate [sku] [options]

ARGUMENTS:
  [sku]                  Generate permalinks for specific SKU (optional)

OPTIONS:
  --catalog <file>       Process entire catalog file
  --batch-size <n>       Items per batch (default: 10)
  --dry-run             Preview without saving
  --force               Regenerate existing permalinks
  --use-seo             Integrate with existing SEO content

EXAMPLES:
  pnpm run permalinks:generate RRV-RR-001                    # Single SKU
  pnpm run permalinks:generate --catalog catalog.xlsx        # Entire catalog
  pnpm run permalinks:generate --use-seo --batch-size 5      # With SEO integration

PERMALINK PACKAGE INCLUDES:
  - Multiple URL structure variations
  - SEO-optimized recommendations
  - Category-based paths
  - URL best practices validation
  - Alternative URL suggestions
`);
    return;
  }
  
  try {
    console.log('🔗 Permalink Content Generation');
    console.log('=' .repeat(45));
    
    const permalinkAgent = new PermalinkAgent({
      enableDryRun: args.includes('--dry-run')
    });
    
    const contentApprovalAgent = new ContentApprovalAgent({
      contentRepository: './content-repository',
      enableDryRun: args.includes('--dry-run')
    });
    
    const batchSize = parseInt(args.find(arg => arg.startsWith('--batch-size'))?.split('=')[1]) || 
                     parseInt(args[args.indexOf('--batch-size') + 1]) || 10;
    const force = args.includes('--force');
    const useSeo = args.includes('--use-seo');
    
    let itemsToProcess = [];
    
    // Determine what to process
    const singleSku = args.find(arg => !arg.startsWith('--') && arg !== 'generate');
    const catalogFile = args.find(arg => arg.startsWith('--catalog'))?.split('=')[1] || 
                       args[args.indexOf('--catalog') + 1];
    
    if (singleSku) {
      // Process single SKU
      console.log(`📋 Processing single SKU: ${singleSku}`);
      itemsToProcess = [{ sku: singleSku, itemName: singleSku }];
      
    } else if (catalogFile) {
      // Process entire catalog
      console.log(`📁 Processing catalog: ${catalogFile}`);
      const catalogData = await loadCatalogData(catalogFile);
      itemsToProcess = catalogData;
      
    } else {
      console.error('❌ Must specify either a SKU or catalog file');
      console.error('Usage: pnpm run permalinks:generate <sku> OR pnpm run permalinks:generate --catalog <file>');
      process.exit(1);
    }
    
    if (itemsToProcess.length === 0) {
      console.log('📝 No items to process');
      return;
    }
    
    console.log(`🎯 Processing ${itemsToProcess.length} items in batches of ${batchSize}`);
    if (useSeo) console.log('🔍 SEO integration enabled - will use existing SEO content when available');
    console.log('');
    
    let processed = 0;
    let generated = 0;
    let skipped = 0;
    let seoIntegrated = 0;
    let errors = 0;
    
    // Process in batches
    for (let i = 0; i < itemsToProcess.length; i += batchSize) {
      const batch = itemsToProcess.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(itemsToProcess.length / batchSize);
      
      console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`);
      
      for (const item of batch) {
        try {
          const sku = item.sku || item.itemName?.replace(/[^a-zA-Z0-9]/g, '-');
          
          // Check if permalink content already exists
          if (!force) {
            const existingStatus = await contentApprovalAgent.checkContentApproval(sku, 'permalink');
            if (existingStatus.status !== 'not-found') {
              console.log(`   ⏭️  ${sku}: Permalink content exists (${existingStatus.status})`);
              skipped++;
              processed++;
              continue;
            }
          }
          
          console.log(`   🔗 ${sku}: Generating permalink structure...`);
          
          // Get existing SEO content for integration
          let seoContent = null;
          if (useSeo) {
            try {
              const seoStatus = await contentApprovalAgent.checkContentApproval(sku, 'seo');
              if (seoStatus.approved) {
                seoContent = await contentApprovalAgent.loadApprovedContent(sku, 'seo');
                seoIntegrated++;
              }
            } catch {
              // No SEO content available
            }
          }
          
          // Generate permalink package
          const permalinkPackage = await permalinkAgent.generatePermalinkPackage(item, seoContent);
          
          // Save for approval
          await contentApprovalAgent.saveContentForReview(
            sku,
            permalinkPackage,
            { 
              contentType: 'permalink',
              generator: 'PermalinkAgent',
              seoIntegrated: !!seoContent,
              generatedAt: new Date().toISOString()
            }
          );
          
          console.log(`   ✅ ${sku}: Permalink structure generated and saved for review`);
          console.log(`       • Recommended: ${permalinkPackage.recommendedPermalink}`);
          console.log(`       • Variations: ${Object.keys(permalinkPackage.variations).length}`);
          console.log(`       • SEO Score: ${permalinkPackage.qualityMetrics?.seoScore}/100`);
          console.log(`       • Length: ${permalinkPackage.urlLength} characters`);
          if (seoContent) {
            console.log(`       • SEO Keywords in URL: ${permalinkPackage.seoKeywordsInURL?.length || 0}`);
          }
          
          generated++;
          
        } catch (error) {
          console.error(`   ❌ ${item.sku || item.itemName}: Permalink generation failed - ${error.message}`);
          errors++;
        }
        
        processed++;
      }
      
      // Brief pause between batches
      if (i + batchSize < itemsToProcess.length) {
        console.log(`   ⏸️  Pausing 2 seconds between batches...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      console.log('');
    }
    
    // Show results
    console.log('📊 PERMALINK GENERATION RESULTS:');
    console.log(`   • Total processed: ${processed}`);
    console.log(`   • Permalink structures generated: ${generated}`);
    console.log(`   • Skipped (existing): ${skipped}`);
    console.log(`   • SEO integrated: ${seoIntegrated}`);
    console.log(`   • Errors: ${errors}`);
    console.log('');
    
    if (generated > 0) {
      console.log('🎯 NEXT STEPS:');
      console.log('   1. Review generated permalink structures:');
      console.log('      pnpm run permalinks:status');
      console.log('');
      console.log('   2. Review specific items:');
      console.log('      pnpm run permalinks:review <sku>');
      console.log('');
      console.log('   3. Approve permalink structures:');
      console.log('      pnpm run permalinks:approve <sku>');
      console.log('');
      console.log('   4. Commit approved permalinks:');
      console.log('      pnpm run content:commit-approved');
      console.log('');
      console.log('💡 TIP: Use --use-seo flag to integrate with approved SEO content');
    }
    
    if (!args.includes('--dry-run')) {
      console.log('');
      console.log(`💾 Permalink content saved to: content-repository/product-content/permalinks/pending-review/`);
    } else {
      console.log('');
      console.log('🧪 DRY RUN: No content was actually saved');
    }
    
  } catch (error) {
    console.error('❌ Permalink generation failed:');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

async function loadCatalogData(catalogFile) {
  const workbook = XLSX.readFile(catalogFile);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  
  // Skip header and convert to items
  const items = rawData.slice(1).map((row, index) => ({
    rowIndex: index + 1,
    itemName: row[2], // Column 2: Item Name
    sku: row[4], // Column 4: SKU
    categories: row[6], // Column 6: Categories
    description: row[7] // Column 7: Description
  })).filter(item => item.itemName); // Only items with names
  
  return items;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}