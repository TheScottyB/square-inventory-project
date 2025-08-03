#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';

/**
 * Analyze Square catalog items to identify active vs archived status
 */

class ItemStatusAnalyzer {
  constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
  }

  async main() {
    console.log('🔍 Analyzing Item Status (Active vs Archived)\n');
    
    try {
      // Load catalog data
      const catalogPath = path.join(this.dataDir, 'catalog-full.json');
      if (!(await fs.pathExists(catalogPath))) {
        throw new Error('Catalog data not found. Run fetch-and-analyze-catalog.js first.');
      }
      
      const catalogItems = await fs.readJson(catalogPath);
      const items = catalogItems.filter(obj => obj.type === 'ITEM');
      
      console.log(`📦 Analyzing ${items.length} items...\n`);
      
      // Analyze status indicators
      const statusAnalysis = {
        active: [],
        archived: [],
        unknown: [],
        statusFields: new Set(),
        ecomVisibility: {},
        isDeletedCounts: { true: 0, false: 0, undefined: 0 }
      };
      
      items.forEach((item, index) => {
        if (index < 5) {
          console.log(`Sample Item ${index + 1}: ${item.itemData?.name}`);
          console.log(`  isDeleted: ${item.isDeleted}`);
          console.log(`  ecom_available: ${item.itemData?.ecom_available}`);
          console.log(`  ecom_visibility: ${item.itemData?.ecom_visibility}`);
          console.log(`  presentAtAllLocations: ${item.presentAtAllLocations}`);
          console.log(`  presentAtLocationIds: ${item.presentAtLocationIds?.length || 0} locations`);
          console.log(`  variations: ${item.itemData?.variations?.length || 0}`);
          
          // Check variation status
          if (item.itemData?.variations?.length > 0) {
            const variation = item.itemData.variations[0];
            console.log(`  variation.isDeleted: ${variation.isDeleted}`);
            console.log(`  variation.sellable: ${variation.itemVariationData?.sellable}`);
            console.log(`  variation.stockable: ${variation.itemVariationData?.stockable}`);
          }
          console.log('');
        }
        
        // Collect status field information
        Object.keys(item).forEach(key => statusAnalysis.statusFields.add(key));
        if (item.itemData) {
          Object.keys(item.itemData).forEach(key => statusAnalysis.statusFields.add(`itemData.${key}`));
        }
        
        // Count ecom_visibility values
        const ecomVis = item.itemData?.ecom_visibility;
        statusAnalysis.ecomVisibility[ecomVis] = (statusAnalysis.ecomVisibility[ecomVis] || 0) + 1;
        
        // Count isDeleted values
        if (item.isDeleted === true) statusAnalysis.isDeletedCounts.true++;
        else if (item.isDeleted === false) statusAnalysis.isDeletedCounts.false++;
        else statusAnalysis.isDeletedCounts.undefined++;
        
        // Determine item status based on multiple criteria
        const status = this.determineItemStatus(item);
        statusAnalysis[status.category].push({
          id: item.id,
          name: item.itemData?.name,
          ...status.details
        });
      });
      
      this.displayStatusSummary(statusAnalysis);
      
      // Save separated items
      await this.saveSeparatedItems(statusAnalysis);
      
    } catch (error) {
      console.error('💥 Analysis failed:', error.message);
      process.exit(1);
    }
  }
  
  determineItemStatus(item) {
    const details = {
      isDeleted: item.isDeleted,
      ecomAvailable: item.itemData?.ecom_available,
      ecomVisibility: item.itemData?.ecom_visibility,
      presentAtAllLocations: item.presentAtAllLocations,
      hasActiveVariations: false,
      variationCount: item.itemData?.variations?.length || 0
    };
    
    // Check if any variations are active
    if (item.itemData?.variations) {
      details.hasActiveVariations = item.itemData.variations.some(variation => 
        !variation.isDeleted && 
        variation.itemVariationData?.sellable !== false
      );
    }
    
    // Determine category based on various criteria
    let category = 'unknown';
    
    // Item is clearly deleted/archived
    if (item.isDeleted === true) {
      category = 'archived';
    }
    // Item is not deleted and has active characteristics
    else if (
      item.isDeleted === false && 
      (
        details.hasActiveVariations ||
        item.itemData?.ecom_available === true ||
        item.itemData?.ecom_visibility === 'PUBLIC' ||
        item.presentAtAllLocations === true ||
        item.presentAtLocationIds?.length > 0
      )
    ) {
      category = 'active';
    }
    // Items that might be inactive but not deleted
    else if (
      item.isDeleted === false &&
      item.itemData?.ecom_visibility === 'UNINDEXED' &&
      !details.hasActiveVariations
    ) {
      category = 'archived'; // Treating UNINDEXED as archived
    }
    
    return { category, details };
  }
  
  displayStatusSummary(analysis) {
    console.log('=' .repeat(60));
    console.log('📊 ITEM STATUS ANALYSIS SUMMARY');
    console.log('=' .repeat(60));
    
    console.log(`✅ Active Items: ${analysis.active.length}`);
    console.log(`📦 Archived Items: ${analysis.archived.length}`);
    console.log(`❓ Unknown Status: ${analysis.unknown.length}`);
    
    console.log('\n🔍 Status Field Analysis:');
    console.log(`   isDeleted counts:`, analysis.isDeletedCounts);
    console.log(`   ecom_visibility breakdown:`, analysis.ecomVisibility);
    
    console.log('\n📋 Available Status Fields:');
    Array.from(analysis.statusFields).sort().forEach(field => {
      console.log(`   - ${field}`);
    });
    
    if (analysis.active.length > 0) {
      console.log('\n✅ Sample Active Items:');
      analysis.active.slice(0, 5).forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.name} (${item.id})`);
        console.log(`      ecom_visibility: ${item.ecomVisibility}, sellable variations: ${item.hasActiveVariations}`);
      });
    }
    
    if (analysis.archived.length > 0) {
      console.log('\n📦 Sample Archived Items:');
      analysis.archived.slice(0, 5).forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.name} (${item.id})`);
        console.log(`      isDeleted: ${item.isDeleted}, ecom_visibility: ${item.ecomVisibility}`);
      });
    }
  }
  
  async saveSeparatedItems(analysis) {
    console.log('\n💾 Saving separated item lists...');
    
    // Save active items list
    const activeItemsPath = path.join(this.dataDir, 'active-items.json');
    await fs.writeJson(activeItemsPath, {
      items: analysis.active,
      count: analysis.active.length,
      generatedAt: new Date().toISOString(),
      criteria: 'Items with isDeleted=false and active variations or ecom visibility'
    }, { spaces: 2 });
    
    console.log(`   ✅ Active items saved: ${activeItemsPath}`);
    
    // Save archived items list  
    const archivedItemsPath = path.join(this.dataDir, 'archived-items.json');
    await fs.writeJson(archivedItemsPath, {
      items: analysis.archived,
      count: analysis.archived.length,
      generatedAt: new Date().toISOString(),
      criteria: 'Items with isDeleted=true or UNINDEXED visibility without active variations'
    }, { spaces: 2 });
    
    console.log(`   📦 Archived items saved: ${archivedItemsPath}`);
    
    console.log('\n🎯 Next Steps:');
    console.log('   1. Review active items for description updates');
    console.log('   2. Focus SEO optimization on active items only');
    console.log('   3. Consider archiving inactive items if needed');
  }
}

// Run analyzer
if (import.meta.url === `file://${process.argv[1]}`) {
  const analyzer = new ItemStatusAnalyzer();
  analyzer.main().catch(console.error);
}

export { ItemStatusAnalyzer };
