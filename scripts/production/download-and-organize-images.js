#!/usr/bin/env node

import { SquareCatalogAgent } from '../../src/agents/SquareCatalogAgent.js';
import fs from 'fs-extra';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Download and Organize Square Catalog Images
 * 
 * This script:
 * 1. Loads catalog data and active items
 * 2. Downloads images from Square URLs
 * 3. Organizes them into category folders
 * 4. Creates item folders with all associated images
 * 5. Generates a manifest file for tracking
 */

class ImageDownloadOrganizer {
  constructor() {
    this.squareAgent = new SquareCatalogAgent();
    this.dataDir = path.join(process.cwd(), 'data');
    this.downloadsDir = path.join(process.cwd(), 'catalog-images');
    this.stats = {
      totalItems: 0,
      itemsWithImages: 0,
      itemsWithoutImages: 0,
      totalImagesDownloaded: 0,
      failedDownloads: 0,
      categoriesCreated: 0,
      errors: []
    };
  }

  async main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
      this.showHelp();
      return;
    }

    try {
      console.log('📥 Square Catalog Image Download & Organization\n');
      
      // Parse options
      const options = this.parseOptions(args);
      
      // Load catalog data
      console.log('📂 Loading catalog data...');
      const { items, images } = await this.loadCatalogData();
      
      // Filter active items only
      const activeItems = await this.getActiveItems(items);
      console.log(`   Found ${activeItems.length} active items\n`);
      
      // Setup directory structure
      await this.setupDirectories();
      
      // Create image lookup map
      const imageMap = this.createImageMap(images);
      
      // Process items and download images
      console.log('🔄 Processing items and downloading images...\n');
      await this.processItems(activeItems, imageMap, options);
      
      // Generate manifest
      await this.generateManifest(activeItems, imageMap);
      
      // Display summary
      this.displaySummary();
      
    } catch (error) {
      console.error('💥 Script failed:', error.message);
      process.exit(1);
    }
  }

  showHelp() {
    console.log(`
📥 Square Catalog Image Download & Organization

USAGE:
  node scripts/production/download-and-organize-images.js [options]

OPTIONS:
  --help, -h              Show this help message
  --limit N               Limit to N items (default: all)
  --category CATEGORY     Only process specific category
  --skip-existing         Skip items that already have folders
  --dry-run              Preview what would be downloaded
  --concurrent N          Number of concurrent downloads (default: 3)

EXAMPLES:
  # Download all images
  node scripts/production/download-and-organize-images.js

  # Download first 10 items
  node scripts/production/download-and-organize-images.js --limit 10

  # Download only cosmetics category
  node scripts/production/download-and-organize-images.js --category cosmetics

  # Dry run to see what would be downloaded
  node scripts/production/download-and-organize-images.js --dry-run --limit 5
`);
  }

  parseOptions(args) {
    const options = {
      limit: null,
      category: null,
      skipExisting: args.includes('--skip-existing'),
      dryRun: args.includes('--dry-run'),
      concurrent: 3
    };

    // Parse limit
    const limitIndex = args.indexOf('--limit');
    if (limitIndex !== -1 && args[limitIndex + 1]) {
      options.limit = parseInt(args[limitIndex + 1]);
    }

    // Parse category
    const categoryIndex = args.indexOf('--category');
    if (categoryIndex !== -1 && args[categoryIndex + 1]) {
      options.category = args[categoryIndex + 1];
    }

    // Parse concurrent
    const concurrentIndex = args.indexOf('--concurrent');
    if (concurrentIndex !== -1 && args[concurrentIndex + 1]) {
      options.concurrent = parseInt(args[concurrentIndex + 1]);
    }

    return options;
  }

  async loadCatalogData() {
    const catalogPath = path.join(this.dataDir, 'catalog-full.json');
    
    if (!(await fs.pathExists(catalogPath))) {
      throw new Error('Catalog data not found. Run fetch-and-analyze-catalog.js first.');
    }
    
    const catalogData = await fs.readJson(catalogPath);
    const items = catalogData.filter(obj => obj.type === 'ITEM');
    const images = catalogData.filter(obj => obj.type === 'IMAGE');
    
    console.log(`   📦 Loaded ${items.length} items and ${images.length} images`);
    
    return { items, images };
  }

  async getActiveItems(items) {
    const activeItemsPath = path.join(this.dataDir, 'active-items.json');
    
    if (await fs.pathExists(activeItemsPath)) {
      const activeData = await fs.readJson(activeItemsPath);
      const activeIds = new Set(activeData.items.map(item => item.id));
      
      return items.filter(item => activeIds.has(item.id));
    }
    
    // Fallback: assume all items are active
    console.log('   ⚠️  No active items data found, processing all items');
    return items;
  }

  async setupDirectories() {
    await fs.ensureDir(this.downloadsDir);
    console.log(`📁 Download directory: ${this.downloadsDir}`);
  }

  createImageMap(images) {
    const imageMap = new Map();
    
    images.forEach(image => {
      imageMap.set(image.id, {
        id: image.id,
        name: image.imageData?.name || 'Untitled',
        caption: image.imageData?.caption || '',
        url: image.imageData?.url,
        createdAt: image.created_at,
        updatedAt: image.updatedAt
      });
    });
    
    return imageMap;
  }

  async processItems(items, imageMap, options) {
    // Filter items if needed
    let filteredItems = items;
    
    if (options.category) {
      filteredItems = items.filter(item => {
        const category = this.getItemCategory(item);
        return category.toLowerCase().includes(options.category.toLowerCase());
      });
      console.log(`   🔍 Filtered to ${filteredItems.length} items in category: ${options.category}`);
    }
    
    if (options.limit) {
      filteredItems = filteredItems.slice(0, options.limit);
      console.log(`   📏 Limited to ${filteredItems.length} items`);
    }
    
    this.stats.totalItems = filteredItems.length;
    
    // Process items with concurrency control
    const semaphore = new Array(options.concurrent).fill(null);
    let processedCount = 0;
    
    const processNext = async () => {
      while (processedCount < filteredItems.length) {
        const itemIndex = processedCount++;
        const item = filteredItems[itemIndex];
        
        try {
          await this.processItem(item, imageMap, options, itemIndex + 1, filteredItems.length);
        } catch (error) {
          console.error(`   ❌ Failed to process ${item.itemData?.name}: ${error.message}`);
          this.stats.errors.push({
            itemId: item.id,
            itemName: item.itemData?.name,
            error: error.message
          });
        }
      }
    };
    
    // Start concurrent processing
    await Promise.all(semaphore.map(() => processNext()));
  }

  async processItem(item, imageMap, options, currentIndex, totalItems) {
    const itemData = item.itemData;
    if (!itemData) return;
    
    const itemName = itemData.name;
    const category = this.getItemCategory(item);
    const imageIds = itemData.imageIds || [];
    
    console.log(`[${currentIndex}/${totalItems}] 📦 Processing: ${itemName}`);
    console.log(`   📂 Category: ${category}`);
    console.log(`   🖼️  Images: ${imageIds.length}`);
    
    if (imageIds.length === 0) {
      console.log(`   ⚠️  No images found\n`);
      this.stats.itemsWithoutImages++;
      return;
    }
    
    this.stats.itemsWithImages++;
    
    // Create category and item directories
    const categoryDir = path.join(this.downloadsDir, this.sanitizeName(category));
    const itemDir = path.join(categoryDir, this.sanitizeName(itemName));
    
    if (options.skipExisting && await fs.pathExists(itemDir)) {
      console.log(`   ⏭️  Skipping (already exists)\n`);
      return;
    }
    
    if (!options.dryRun) {
      await fs.ensureDir(itemDir);
    }
    
    // Process each image
    for (let i = 0; i < imageIds.length; i++) {
      const imageId = imageIds[i];
      const imageData = imageMap.get(imageId);
      
      if (!imageData || !imageData.url) {
        console.log(`   ❌ Image ${i + 1}: No URL found`);
        continue;
      }
      
      const filename = `${i + 1}-${this.sanitizeName(imageData.name || 'image')}.jpg`;
      const filepath = path.join(itemDir, filename);
      
      if (options.dryRun) {
        console.log(`   🔍 [DRY RUN] Would download: ${filename}`);
        continue;
      }
      
      try {
        const success = await this.downloadImage(imageData.url, filepath);
        if (success) {
          console.log(`   ✅ Downloaded: ${filename}`);
          this.stats.totalImagesDownloaded++;
        } else {
          this.stats.failedDownloads++;
        }
      } catch (error) {
        console.log(`   ❌ Failed to download ${filename}: ${error.message}`);
        this.stats.failedDownloads++;
      }
    }
    
    // Create item info file
    if (!options.dryRun) {
      await this.createItemInfo(item, itemDir);
    }
    
    console.log('');
  }

  async downloadImage(url, filepath, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          },
          timeout: 30000
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const buffer = await response.buffer();
        await fs.writeFile(filepath, buffer);
        
        return true;
        
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return false;
  }

  async createItemInfo(item, itemDir) {
    const itemData = item.itemData;
    const info = {
      id: item.id,
      name: itemData.name,
      description: itemData.description || '',
      category: this.getItemCategory(item),
      productType: itemData.productType,
      ecomVisibility: itemData.ecom_visibility,
      imageCount: itemData.imageIds?.length || 0,
      variations: itemData.variations?.length || 0,
      createdAt: item.created_at,
      updatedAt: item.updatedAt,
      downloadedAt: new Date().toISOString()
    };
    
    const infoPath = path.join(itemDir, '_item-info.json');
    await fs.writeJson(infoPath, info, { spaces: 2 });
  }

  getItemCategory(item) {
    if (item.itemData?.categories?.length > 0) {
      return item.itemData.categories[0].name || 'Uncategorized';
    }
    
    // Infer category from name
    const name = item.itemData?.name?.toLowerCase() || '';
    
    const categoryKeywords = {
      'Cosmetics': ['lip', 'gloss', 'lipstick', 'mascara', 'foundation', 'moisturizer', 'shimmer', 'liner'],
      'Apparel': ['shirt', 'tote', 'bag', 'beanie', 'jacket', 'pants', 'dress'],
      'Digital_Art': ['digital', 'art', 'framed', 'poster'],
      'Accessories': ['mug', 'coffee', 'travel', 'case', 'iphone'],
      'Services': ['chatbot', 'brainstorming', 'tour', 'consultation', 'appointment', 'pinball', 'box', 'bar'],
      'Home_Improvement': ['improvement', 'home', 'services'],
      'Miscellaneous': []
    };
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => name.includes(keyword))) {
        return category;
      }
    }
    
    return 'Miscellaneous';
  }

  sanitizeName(name) {
    return name
      .replace(/[^a-zA-Z0-9\s\-_.]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Remove multiple underscores
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .substring(0, 100); // Limit length
  }

  async generateManifest(items, imageMap) {
    const manifest = {
      generatedAt: new Date().toISOString(),
      stats: this.stats,
      structure: {},
      itemsProcessed: items.length
    };
    
    // Build directory structure
    try {
      const categories = await fs.readdir(this.downloadsDir);
      
      for (const category of categories) {
        const categoryPath = path.join(this.downloadsDir, category);
        const categoryStats = await fs.stat(categoryPath);
        
        if (categoryStats.isDirectory()) {
          const items = await fs.readdir(categoryPath);
          manifest.structure[category] = {
            itemCount: items.length,
            items: items
          };
          this.stats.categoriesCreated++;
        }
      }
    } catch (error) {
      console.warn('⚠️  Could not generate full manifest structure');
    }
    
    const manifestPath = path.join(this.downloadsDir, '_download-manifest.json');
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
    
    console.log(`📄 Manifest saved: ${manifestPath}`);
  }

  displaySummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DOWNLOAD & ORGANIZATION SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`📦 Total Items Processed: ${this.stats.totalItems}`);
    console.log(`🖼️  Items with Images: ${this.stats.itemsWithImages}`);
    console.log(`❌ Items without Images: ${this.stats.itemsWithoutImages}`);
    console.log(`📥 Total Images Downloaded: ${this.stats.totalImagesDownloaded}`);
    console.log(`⚠️  Failed Downloads: ${this.stats.failedDownloads}`);
    console.log(`📂 Categories Created: ${this.stats.categoriesCreated}`);
    
    if (this.stats.errors.length > 0) {
      console.log(`\n❌ Errors (${this.stats.errors.length}):`);
      this.stats.errors.slice(0, 5).forEach(error => {
        console.log(`   - ${error.itemName}: ${error.error}`);
      });
      
      if (this.stats.errors.length > 5) {
        console.log(`   ... and ${this.stats.errors.length - 5} more errors`);
      }
    }
    
    const successRate = this.stats.totalImagesDownloaded / (this.stats.totalImagesDownloaded + this.stats.failedDownloads) * 100;
    console.log(`\n📈 Success Rate: ${isNaN(successRate) ? 0 : successRate.toFixed(1)}%`);
    
    console.log(`\n📁 Images organized in: ${this.downloadsDir}`);
    console.log('🎯 Next Steps:');
    console.log('   1. Review downloaded images by category');
    console.log('   2. Identify items needing additional images');
    console.log('   3. Plan image enhancement strategy');
    
    console.log('\n' + '='.repeat(60));
  }
}

// Run the organizer
if (import.meta.url === `file://${process.argv[1]}`) {
  const organizer = new ImageDownloadOrganizer();
  organizer.main().catch(console.error);
}

export { ImageDownloadOrganizer };
