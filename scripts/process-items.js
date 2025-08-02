#!/usr/bin/env node

import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import { ImageAnalysisAgent } from '../src/agents/ImageAnalysisAgent.js';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class ItemProcessor {
  constructor() {
    this.catalogAgent = new SquareCatalogAgent();
    this.imageAgent = new ImageAnalysisAgent();
    this.processedItems = [];
    this.errors = [];
    this.logFile = `./logs/processing-${Date.now()}.json`;
  }

  /**
   * Process a single item: analyze image, upload to Square, create catalog item
   */
  async processItem(imagePath, categoryOverride = null) {
    const itemName = path.basename(imagePath, path.extname(imagePath));
    console.log(`\n🔄 Processing: ${itemName}`);
    
    try {
      // Step 1: Validate image exists
      if (!(await fs.pathExists(imagePath))) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      // Step 2: Analyze image with AI (if enabled)
      let productData = {
        productName: this.formatProductName(itemName),
        description: `High-quality product - ${itemName}`,
        category: categoryOverride || this.inferCategoryFromPath(imagePath)
      };

      if (process.env.OPENAI_API_KEY && !this.catalogAgent.enableDryRun) {
        console.log('🔍 Analyzing image with AI...');
        try {
          const analysis = await this.imageAgent.analyzeImage(imagePath);
          if (analysis.success) {
            productData = {
              productName: analysis.productName || productData.productName,
              description: analysis.description || productData.description,
              category: analysis.category || productData.category
            };
            console.log(`   ✅ AI Analysis: ${analysis.productName}`);
          }
        } catch (aiError) {
          console.warn(`   ⚠️ AI analysis failed, using defaults: ${aiError.message}`);
        }
      }

      // Step 3: Upload image to Square
      console.log('📤 Uploading image to Square...');
      const imageBuffer = await fs.readFile(imagePath);
      const uploadedImage = await this.catalogAgent.uploadImage(
        imageBuffer,
        productData.productName,
        productData.description.substring(0, 100)
      );
      console.log(`   ✅ Image uploaded: ${uploadedImage.id}`);

      // Step 4: Create catalog item
      console.log('📦 Creating catalog item...');
      const locationId = await this.catalogAgent.getMainLocationId();
      const catalogItem = await this.catalogAgent.createCatalogItem(
        productData,
        uploadedImage.id,
        locationId
      );
      console.log(`   ✅ Catalog item created: ${catalogItem.id}`);

      // Step 5: Record success
      const result = {
        success: true,
        originalPath: imagePath,
        productName: productData.productName,
        category: productData.category,
        catalogItemId: catalogItem.id,
        imageId: uploadedImage.id,
        sku: catalogItem.itemData.variations[0].itemVariationData.sku,
        processedAt: new Date().toISOString()
      };

      this.processedItems.push(result);
      console.log(`✅ Successfully processed: ${productData.productName}`);
      console.log(`   SKU: ${result.sku}`);
      
      return result;

    } catch (error) {
      console.error(`❌ Failed to process ${itemName}: ${error.message}`);
      
      const errorResult = {
        success: false,
        originalPath: imagePath,
        itemName,
        error: error.message,
        processedAt: new Date().toISOString()
      };
      
      this.errors.push(errorResult);
      return errorResult;
    }
  }

  /**
   * Process all items in a directory
   */
  async processDirectory(directoryPath, category = null) {
    console.log(`\n📁 Processing directory: ${directoryPath}`);
    
    try {
      if (!(await fs.pathExists(directoryPath))) {
        console.warn(`⚠️ Directory not found: ${directoryPath}`);
        return;
      }

      const files = await fs.readdir(directoryPath);
      const imageFiles = files.filter(file => 
        /\.(jpg|jpeg|png|gif)$/i.test(file)
      );

      console.log(`Found ${imageFiles.length} image files`);

      for (const imageFile of imageFiles) {
        const imagePath = path.join(directoryPath, imageFile);
        const inferredCategory = category || this.inferCategoryFromPath(directoryPath);
        
        await this.processItem(imagePath, inferredCategory);
        
        // Add delay to avoid rate limiting
        await this.delay(1000);
      }

    } catch (error) {
      console.error(`❌ Error processing directory ${directoryPath}: ${error.message}`);
    }
  }

  /**
   * Process items in batch with specific configurations
   */
  async processBatch(items) {
    console.log(`\n🔄 Starting batch processing of ${items.length} items...`);
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`\n[${i + 1}/${items.length}] Processing batch item...`);
      
      if (typeof item === 'string') {
        // Item is just a file path
        await this.processItem(item);
      } else if (item.imagePath) {
        // Item is an object with configuration
        await this.processItem(item.imagePath, item.category);
      }
      
      // Add delay between items
      if (i < items.length - 1) {
        await this.delay(2000);
      }
    }
  }

  /**
   * Save processing results to log file
   */
  async saveResults() {
    try {
      // Ensure logs directory exists
      await fs.ensureDir('./logs');
      
      const results = {
        processedAt: new Date().toISOString(),
        summary: {
          totalProcessed: this.processedItems.length + this.errors.length,
          successful: this.processedItems.length,
          failed: this.errors.length,
          successRate: this.processedItems.length / (this.processedItems.length + this.errors.length) * 100
        },
        processedItems: this.processedItems,
        errors: this.errors
      };

      await fs.writeJSON(this.logFile, results, { spaces: 2 });
      console.log(`\n💾 Results saved to: ${this.logFile}`);
      
      return results;
    } catch (error) {
      console.error(`❌ Failed to save results: ${error.message}`);
    }
  }

  /**
   * Print processing summary
   */
  printSummary() {
    const total = this.processedItems.length + this.errors.length;
    const successRate = total > 0 ? (this.processedItems.length / total * 100).toFixed(1) : 0;
    
    console.log('\n📊 Processing Summary:');
    console.log(`   📦 Total Items: ${total}`);
    console.log(`   ✅ Successful: ${this.processedItems.length}`);
    console.log(`   ❌ Failed: ${this.errors.length}`);
    console.log(`   📈 Success Rate: ${successRate}%`);
    
    if (this.errors.length > 0) {
      console.log('\n❌ Failed Items:');
      this.errors.forEach(error => {
        console.log(`   - ${error.itemName}: ${error.error}`);
      });
    }
  }

  /**
   * Utility methods
   */
  formatProductName(filename) {
    return filename
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
  }

  inferCategoryFromPath(pathStr) {
    const pathLower = pathStr.toLowerCase();
    
    if (pathLower.includes('jewelry')) return 'jewelry';
    if (pathLower.includes('candle')) return 'candle holders';
    if (pathLower.includes('first-aid')) return 'first aid';
    if (pathLower.includes('pet')) return 'pet products';
    if (pathLower.includes('shoe')) return 'shoes';
    if (pathLower.includes('holographic') || pathLower.includes('purse')) return 'holographic purses';
    
    return 'miscellaneous';
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const processor = new ItemProcessor();
  
  try {
    // Test Square connection first
    console.log('🔍 Testing Square API connection...');
    if (!(await processor.catalogAgent.testConnection())) {
      throw new Error('Square API connection failed');
    }
    console.log('✅ Square API connected successfully\n');

    // Get command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      // Process all product directories
      console.log('🚀 Starting comprehensive item processing...');
      
      const directories = [
        { path: './jewelry', category: 'jewelry' },
        { path: './candles-holders', category: 'candle holders' },
        { path: './first-aid-kits', category: 'first aid' },
        { path: './shoes-sneakers', category: 'shoes' },
        { path: './pet-products', category: 'pet products' },
        { path: './holographic-purses', category: 'holographic purses' },
        { path: './miscellaneous-products', category: 'miscellaneous' }
      ];

      for (const dir of directories) {
        await processor.processDirectory(dir.path, dir.category);
      }
      
    } else if (args[0] === '--directory' || args[0] === '-d') {
      // Process specific directory
      const directory = args[1];
      const category = args[2];
      
      if (!directory) {
        console.error('❌ Please specify a directory path');
        process.exit(1);
      }
      
      await processor.processDirectory(directory, category);
      
    } else if (args[0] === '--file' || args[0] === '-f') {
      // Process specific file
      const filePath = args[1];
      const category = args[2];
      
      if (!filePath) {
        console.error('❌ Please specify a file path');
        process.exit(1);
      }
      
      await processor.processItem(filePath, category);
      
    } else {
      console.log('Usage:');
      console.log('  node scripts/process-items.js                     # Process all directories');
      console.log('  node scripts/process-items.js -d <dir> [category] # Process specific directory');
      console.log('  node scripts/process-items.js -f <file> [category] # Process specific file');
      process.exit(1);
    }

    // Save results and print summary
    await processor.saveResults();
    processor.printSummary();
    
    console.log('\n🎉 Processing completed!');
    
  } catch (error) {
    console.error('💥 Processing failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ItemProcessor };
