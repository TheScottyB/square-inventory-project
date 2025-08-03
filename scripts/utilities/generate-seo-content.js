#!/usr/bin/env node

import { SEOContentAgent } from '../../src/agents/seo/SEOContentAgent.js';
import { ContentApprovalAgent } from '../../src/agents/content/ContentApprovalAgent.js';
import XLSX from 'xlsx';

/**
 * Generate SEO Content for Products
 * 
 * Creates comprehensive SEO packages for catalog items
 */

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔍 Generate SEO Content

USAGE:
  pnpm run seo:generate [sku] [options]

ARGUMENTS:
  [sku]                  Generate SEO for specific SKU (optional)

OPTIONS:
  --catalog <file>       Process entire catalog file
  --batch-size <n>       Items per batch (default: 5)
  --dry-run             Preview without saving
  --force               Regenerate existing SEO content

EXAMPLES:
  pnpm run seo:generate RRV-RR-001                    # Single SKU
  pnpm run seo:generate --catalog catalog.xlsx        # Entire catalog
  pnpm run seo:generate --batch-size 3 --dry-run     # Small batches, preview

SEO PACKAGE INCLUDES:
  - Optimized titles (50-60 characters)
  - Meta descriptions (150-160 characters)
  - Primary/secondary/long-tail keywords
  - Search intent analysis
  - Competition analysis
  - Technical SEO validation
`);
    return;
  }
  
  try {
    console.log('🔍 SEO Content Generation');
    console.log('=' .repeat(40));
    
    const seoAgent = new SEOContentAgent({
      enableDryRun: args.includes('--dry-run')
    });
    
    const contentApprovalAgent = new ContentApprovalAgent({
      contentRepository: './content-repository',
      enableDryRun: args.includes('--dry-run')
    });
    
    const batchSize = parseInt(args.find(arg => arg.startsWith('--batch-size'))?.split('=')[1]) || 
                     parseInt(args[args.indexOf('--batch-size') + 1]) || 5;
    const force = args.includes('--force');
    
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
      console.error('Usage: pnpm run seo:generate <sku> OR pnpm run seo:generate --catalog <file>');
      process.exit(1);
    }
    
    if (itemsToProcess.length === 0) {
      console.log('📝 No items to process');
      return;
    }
    
    console.log(`🎯 Processing ${itemsToProcess.length} items in batches of ${batchSize}`);
    console.log('');
    
    let processed = 0;
    let generated = 0;
    let skipped = 0;
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
          
          // Check if SEO content already exists
          if (!force) {
            const existingStatus = await contentApprovalAgent.checkContentApproval(sku, 'seo');
            if (existingStatus.status !== 'not-found') {
              console.log(`   ⏭️  ${sku}: SEO content exists (${existingStatus.status})`);
              skipped++;
              processed++;
              continue;
            }
          }
          
          console.log(`   🔍 ${sku}: Generating SEO content...`);
          
          // Check for existing description content for context
          let existingContent = null;
          try {
            const descStatus = await contentApprovalAgent.checkContentApproval(sku, 'description');
            if (descStatus.approved) {
              existingContent = await contentApprovalAgent.loadApprovedContent(sku, 'description');
            }
          } catch {
            // No existing content, continue without context
          }
          
          // Generate SEO content
          const seoPackage = await seoAgent.generateSEOPackage(item, existingContent);
          
          // Save for approval
          await contentApprovalAgent.saveContentForReview(
            sku,
            seoPackage,
            { 
              contentType: 'seo',
              generator: 'SEOContentAgent',
              hasExistingContent: !!existingContent,
              generatedAt: new Date().toISOString()
            }
          );
          
          console.log(`   ✅ ${sku}: SEO content generated and saved for review`);
          console.log(`       • Title: "${seoPackage.seoTitle}" (${seoPackage.seoTitle?.length} chars)`);
          console.log(`       • Meta: "${seoPackage.metaDescription}" (${seoPackage.metaDescription?.length} chars)`);
          console.log(`       • Keywords: ${seoPackage.primaryKeywords?.length} primary, ${seoPackage.secondaryKeywords?.length} secondary`);
          console.log(`       • SEO Score: ${seoPackage.qualityMetrics?.overallSEOScore}/100`);
          
          generated++;
          
        } catch (error) {
          console.error(`   ❌ ${item.sku || item.itemName}: SEO generation failed - ${error.message}`);
          errors++;
        }
        
        processed++;
      }
      
      // Brief pause between batches
      if (i + batchSize < itemsToProcess.length) {
        console.log(`   ⏸️  Pausing 3 seconds between batches...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      console.log('');
    }
    
    // Show results
    console.log('📊 SEO GENERATION RESULTS:');
    console.log(`   • Total processed: ${processed}`);
    console.log(`   • SEO content generated: ${generated}`);
    console.log(`   • Skipped (existing): ${skipped}`);
    console.log(`   • Errors: ${errors}`);
    console.log('');
    
    if (generated > 0) {
      console.log('🎯 NEXT STEPS:');
      console.log('   1. Review generated SEO content:');
      console.log('      pnpm run seo:status');
      console.log('');
      console.log('   2. Review specific items:');
      console.log('      pnpm run seo:review <sku>');
      console.log('');
      console.log('   3. Approve quality SEO content:');
      console.log('      pnpm run seo:approve <sku>');
      console.log('');
      console.log('   4. Commit approved SEO content:');
      console.log('      pnpm run content:commit-approved');
    }
    
    if (!args.includes('--dry-run')) {
      console.log('');
      console.log(`💾 SEO content saved to: content-repository/product-content/seo/pending-review/`);
    } else {
      console.log('');
      console.log('🧪 DRY RUN: No content was actually saved');
    }
    
  } catch (error) {
    console.error('❌ SEO generation failed:');
    console.error(`   ${error.message}`);
    
    if (error.message.includes('OPENAI_API_KEY')) {
      console.error('');
      console.error('🔑 Make sure your OpenAI API key is set:');
      console.error('   export OPENAI_API_KEY="your-api-key-here"');
    }
    
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