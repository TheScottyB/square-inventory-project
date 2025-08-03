#!/usr/bin/env node

import { SquareCatalogAgent } from '../../src/agents/SquareCatalogAgent.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Fetch and Analyze Square Catalog Items
 * 
 * This script:
 * 1. Fetches all catalog items from Square
 * 2. Analyzes descriptions for consistency and SEO opportunities
 * 3. Identifies items with only one image
 * 4. Saves analysis results for processing
 */

class CatalogAnalyzer {
  constructor() {
    this.agent = new SquareCatalogAgent();
    this.dataDir = path.join(process.cwd(), 'data');
    this.results = {
      totalItems: 0,
      itemsNeedingDescriptionUpdate: [],
      itemsNeedingMoreImages: [],
      itemsWithNoImages: [],
      categorySummary: {},
      errors: []
    };
  }

  async main() {
    try {
      console.log('🔍 Fetching and Analyzing Square Catalog Items\n');
      
      // Ensure data directory exists
      await fs.ensureDir(this.dataDir);
      
      // Test Square connection
      console.log('🔗 Testing Square API connection...');
      const isConnected = await this.agent.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to Square API');
      }
      console.log('✅ Connected successfully\n');
      
      // Fetch all catalog items
      console.log('📦 Fetching all catalog items...');
      const catalogItems = await this.fetchAllCatalogItems();
      console.log(`   Found ${catalogItems.length} catalog objects\n`);
      
      // Analyze items
      console.log('🔍 Analyzing catalog items...');
      await this.analyzeCatalogItems(catalogItems);
      
      // Save results
      await this.saveResults(catalogItems);
      
      // Display summary
      this.displaySummary();
      
    } catch (error) {
      console.error('💥 Script failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Fetch all catalog items using search API (more reliable than list)
   */
  async fetchAllCatalogItems() {
    const allItems = [];
    
    // Fetch different object types separately using search API
    const objectTypes = [
      ['ITEM'],
      ['ITEM_VARIATION'], 
      ['CATEGORY'],
      ['IMAGE']
    ];
    
    for (const types of objectTypes) {
      console.log(`   📄 Fetching ${types[0]} objects...`);
      
      try {
        const items = await this.fetchObjectsByType(types);
        allItems.push(...items);
        console.log(`      Added ${items.length} ${types[0]} objects`);
      } catch (error) {
        console.error(`   ❌ Error fetching ${types[0]}:`, error.message);
        this.results.errors.push({
          type: 'fetch_error',
          objectType: types[0],
          error: error.message
        });
      }
    }
    
    return allItems;
  }
  
  /**
   * Fetch objects of specific types using search API with pagination
   */
  async fetchObjectsByType(objectTypes) {
    const allObjects = [];
    let cursor = null;
    let pageCount = 0;
    
    do {
      try {
        pageCount++;
        
        const response = await this.agent.catalogApi.search({
          objectTypes,
          cursor,
          limit: 1000 // Maximum allowed by Square API
        });
        
        const result = response.result || response;
        
        if (result.objects && result.objects.length > 0) {
          allObjects.push(...result.objects);
        }
        
        cursor = result.cursor;
      } catch (error) {
        console.error(`     ❌ Error on page ${pageCount}:`, error.message);
        break;
      }
    } while (cursor);
    
    return allObjects;
  }

  /**
   * Analyze catalog items for description and image needs
   */
  async analyzeCatalogItems(catalogItems) {
    // Separate items by type
    const items = catalogItems.filter(obj => obj.type === 'ITEM');
    const images = catalogItems.filter(obj => obj.type === 'IMAGE');
    const categories = catalogItems.filter(obj => obj.type === 'CATEGORY');

    console.log(`   📊 Found ${items.length} items, ${images.length} images, ${categories.length} categories`);

    this.results.totalItems = items.length;

    // Create image lookup map
    const imageMap = new Map();
    images.forEach(image => {
      imageMap.set(image.id, image);
    });

    // Analyze each item
    for (const item of items) {
      try {
        await this.analyzeItem(item, imageMap);
      } catch (error) {
        console.error(`   ❌ Error analyzing item ${item.id}:`, error.message);
        this.results.errors.push({
          type: 'analysis_error',
          itemId: item.id,
          itemName: item.itemData?.name,
          error: error.message
        });
      }
    }

    // Build category summary
    this.buildCategorySummary(items, categories);
  }

  /**
   * Analyze individual item for description and image needs
   */
  async analyzeItem(item, imageMap) {
    const itemData = item.itemData;
    if (!itemData) return;

    const analysis = {
      id: item.id,
      name: itemData.name,
      description: itemData.description,
      category: itemData.categories?.[0]?.name || 'Uncategorized',
      imageCount: itemData.imageIds?.length || 0,
      imageIds: itemData.imageIds || [],
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };

    // Check if description needs updating
    if (this.needsDescriptionUpdate(analysis)) {
      this.results.itemsNeedingDescriptionUpdate.push({
        ...analysis,
        descriptionIssues: this.identifyDescriptionIssues(analysis)
      });
    }

    // Check image count
    if (analysis.imageCount === 0) {
      this.results.itemsWithNoImages.push(analysis);
    } else if (analysis.imageCount === 1) {
      this.results.itemsNeedingMoreImages.push({
        ...analysis,
        existingImages: analysis.imageIds.map(id => imageMap.get(id)).filter(Boolean)
      });
    }

    // Update category summary
    const category = analysis.category;
    if (!this.results.categorySummary[category]) {
      this.results.categorySummary[category] = {
        totalItems: 0,
        itemsWithOneImage: 0,
        itemsWithNoImages: 0,
        itemsNeedingDescriptionUpdate: 0
      };
    }
    
    this.results.categorySummary[category].totalItems++;
    
    if (analysis.imageCount === 0) {
      this.results.categorySummary[category].itemsWithNoImages++;
    } else if (analysis.imageCount === 1) {
      this.results.categorySummary[category].itemsWithOneImage++;
    }
    
    if (this.needsDescriptionUpdate(analysis)) {
      this.results.categorySummary[category].itemsNeedingDescriptionUpdate++;
    }
  }

  /**
   * Determine if an item needs description update
   */
  needsDescriptionUpdate(item) {
    const description = item.description || '';
    
    // Check for common issues
    const issues = this.identifyDescriptionIssues(item);
    return issues.length > 0;
  }

  /**
   * Identify specific description issues
   */
  identifyDescriptionIssues(item) {
    const description = item.description || '';
    const name = item.name || '';
    const issues = [];

    // Check for missing description
    if (!description || description.trim().length === 0) {
      issues.push('missing_description');
    }

    // Check for too short description (less than 10 characters)
    if (description.length > 0 && description.length < 10) {
      issues.push('too_short');
    }

    // Check for generic descriptions
    const genericPhrases = [
      'product description',
      'item description',
      'no description',
      'coming soon',
      'tbd',
      'to be determined'
    ];
    
    if (genericPhrases.some(phrase => description.toLowerCase().includes(phrase))) {
      issues.push('generic_description');
    }

    // Check for missing SEO elements (keywords from name not in description)
    if (name && description) {
      const nameWords = name.toLowerCase().split(/\s+/).filter(word => word.length > 3);
      const descriptionLower = description.toLowerCase();
      const missingKeywords = nameWords.filter(word => !descriptionLower.includes(word));
      
      if (missingKeywords.length > nameWords.length * 0.5) {
        issues.push('missing_seo_keywords');
      }
    }

    // Check for inconsistent formatting
    if (description.includes('  ') || description.startsWith(' ') || description.endsWith(' ')) {
      issues.push('formatting_issues');
    }

    // Check for missing punctuation
    if (description.length > 10 && !description.match(/[.!?]$/)) {
      issues.push('missing_punctuation');
    }

    return issues;
  }

  /**
   * Build category summary
   */
  buildCategorySummary(items, categories) {
    // Add category names to summary
    categories.forEach(category => {
      const categoryName = category.categoryData?.name || 'Unknown';
      if (this.results.categorySummary[categoryName]) {
        this.results.categorySummary[categoryName].categoryId = category.id;
      }
    });
  }

  /**
   * Convert BigInt values to strings for JSON serialization
   */
  serializeBigInt(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }));
  }

  /**
   * Save results to files
   */
  async saveResults(catalogItems) {
    console.log('\n💾 Saving results...');

    try {
      // Convert BigInt values before saving
      const serializedCatalogItems = this.serializeBigInt(catalogItems);
      const serializedResults = this.serializeBigInt(this.results);

      // Save full catalog data
      const catalogPath = path.join(this.dataDir, 'catalog-full.json');
      await fs.writeJson(catalogPath, serializedCatalogItems, { spaces: 2 });
      console.log(`   📄 Full catalog saved: ${catalogPath}`);

      // Save analysis results
      const analysisPath = path.join(this.dataDir, 'catalog-analysis.json');
      await fs.writeJson(analysisPath, {
        ...serializedResults,
        analyzedAt: new Date().toISOString(),
        version: '1.0.0'
      }, { spaces: 2 });
      console.log(`   📊 Analysis results saved: ${analysisPath}`);

      // Save items needing updates (for processing)
      const updatesPath = path.join(this.dataDir, 'items-needing-updates.json');
      await fs.writeJson(updatesPath, {
        descriptionUpdates: this.serializeBigInt(this.results.itemsNeedingDescriptionUpdate),
        imageUpdates: this.serializeBigInt(this.results.itemsNeedingMoreImages),
        noImages: this.serializeBigInt(this.results.itemsWithNoImages),
        generatedAt: new Date().toISOString()
      }, { spaces: 2 });
      console.log(`   🔄 Items needing updates saved: ${updatesPath}`);
      
    } catch (error) {
      console.error('   ❌ Error saving results:', error.message);
      throw error;
    }
  }

  /**
   * Display analysis summary
   */
  displaySummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 CATALOG ANALYSIS SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`📦 Total Items: ${this.results.totalItems}`);
    console.log(`📝 Items needing description updates: ${this.results.itemsNeedingDescriptionUpdate.length}`);
    console.log(`🖼️  Items needing more images: ${this.results.itemsNeedingMoreImages.length}`);
    console.log(`❌ Items with no images: ${this.results.itemsWithNoImages.length}`);
    
    if (this.results.errors.length > 0) {
      console.log(`⚠️  Errors encountered: ${this.results.errors.length}`);
    }

    console.log('\n📋 Category Breakdown:');
    Object.entries(this.results.categorySummary)
      .sort(([,a], [,b]) => b.totalItems - a.totalItems)
      .forEach(([category, stats]) => {
        console.log(`   ${category}:`);
        console.log(`     Total: ${stats.totalItems}`);
        console.log(`     Need description update: ${stats.itemsNeedingDescriptionUpdate}`);
        console.log(`     Need more images: ${stats.itemsWithOneImage}`);
        console.log(`     No images: ${stats.itemsWithNoImages}`);
      });

    console.log('\n🎯 Next Steps:');
    console.log('   1. Review items in data/items-needing-updates.json');
    console.log('   2. Run description update script for individual items');
    console.log('   3. Run image enrichment script for items with few images');
    console.log('   4. Use batch update script to apply changes to Square');
    
    console.log('\n' + '='.repeat(60));
  }
}

// Run the analyzer
if (import.meta.url === `file://${process.argv[1]}`) {
  const analyzer = new CatalogAnalyzer();
  analyzer.main().catch(console.error);
}

export { CatalogAnalyzer };
