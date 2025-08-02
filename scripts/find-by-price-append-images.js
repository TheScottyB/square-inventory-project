#!/usr/bin/env node

import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'path';
import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import { AdvancedObservabilityAgent } from '../src/observability/AdvancedObservabilityAgent.js';

// Load environment variables
dotenv.config();

/**
 * Advanced Square Catalog Price-Based Image Appender
 * Find items by exact price and append additional images to them with full observability
 */
class SquarePriceImageAppender {
  constructor() {
    this.catalogAgent = new SquareCatalogAgent();
    
    // Initialize advanced observability
    this.observabilityAgent = new AdvancedObservabilityAgent(this.catalogAgent, {
      merchantId: process.env.SQUARE_MERCHANT_ID || 'primary',
      serviceName: 'square-price-image-appender',
      environment: process.env.NODE_ENV || 'development',
      enableOpenTelemetry: false, // Disable for local script
      enablePrometheus: true,
      enableVersionMonitoring: true,
      enableLegacyObserver: true,
      logLevel: 'info'
    });
    
    this.processedItems = [];
    this.errors = [];
  }

  /**
   * Find ITEM_VARIATIONs by exact price using direct Square API pagination
   * @param {number} exactPrice - Exact price in cents
   * @param {number} tolerance - Price tolerance in cents
   * @param {number} limit - Limit on number of items returned
   * @returns {Promise<Array>} Array of catalog item IDs with price information
   */
  async findVariationsByExactPrice(exactPrice, tolerance = 0, limit = 50) {
    return await this.observabilityAgent.traceSquareOperation(
      'catalog.findVariationsByExactPrice',
      async () => {
        const matchedItems = [];
        let cursor = null;
        console.log(`🔍 Searching for ITEM_VARIATIONs with price around $${(exactPrice/100).toFixed(2)}...`);

        do {
          try {
            // Use the catalogApi directly for better cursor control
            const response = await this.catalogAgent.catalogApi.search({
              objectTypes: ['ITEM_VARIATION'],
              cursor,
              limit: 100
            });

            const result = response.result || response;
            const variations = result.objects || [];

            console.log(`   📦 Processing ${variations.length} variations...`);

            for (const variation of variations) {
              const variationData = variation.itemVariationData;
              if (variationData?.priceMoney?.amount) {
                const amount = Number(variationData.priceMoney.amount);

                if (amount >= exactPrice - tolerance && amount <= exactPrice + tolerance) {
                  matchedItems.push({
                    itemId: variationData.itemId,
                    variationId: variation.id,
                    price: amount,
                    priceFormatted: `$${(amount/100).toFixed(2)}`,
                    hasImage: false // Will be determined when we fetch the parent item
                  });

                  if (matchedItems.length >= limit) {
                    break;
                  }
                }
              }
            }

            cursor = result.cursor;
          } catch (error) {
            console.error(`❌ Error during search: ${error.message}`);
            break;
          }
        } while (cursor && matchedItems.length < limit);

        console.log(`   💰 Found ${matchedItems.length} matching variations`);
        return matchedItems;
      },
      { exactPrice, tolerance, limit }
    );
  }

  /**
   * Append a new image to a catalog item
   * @param {string} itemId - Catalog item ID
   * @param {string} imagePath - Path to the new image file
   * @returns {Promise} New image ID
   */
  async appendImageToItem(itemId, imagePath) {
    return await this.observabilityAgent.traceSquareOperation(
      'catalog.appendImageToItem',
      async () => {
        // Validate file existence and size
        if (!(await fs.pathExists(imagePath))) {
          throw new Error(`Image file not found: ${imagePath}`);
        }

        const stats = await fs.stat(imagePath);
        if (stats.size > 10 * 1024 * 1024) { // 10MB limit
          throw new Error(`Image file too large: ${Math.round(stats.size / 1024 / 1024)}MB (max 10MB)`);
        }

        // Read the file buffer
        const imageBuffer = await fs.readFile(imagePath);

        // Upload the image
        const image = await this.catalogAgent.uploadImage(
          imageBuffer,
          `Image for item ${itemId}`,
          `Appended image for item ${itemId}`
        );

        console.log(`✅ Image uploaded with ID: ${image.id}`);
        return image.id;
      },
      { itemId, imagePath }
    );
  }

  /**
   * Update catalog item with new image ID using version-safe upsert
   * @param {string} itemId - Catalog item ID
   * @param {string} newImageId - New image ID to append
   * @returns {Promise<Object>} Updated catalog item
   */
  async updateItemWithNewImage(itemId, newImageId) {
    return await this.observabilityAgent.traceSquareOperation(
      'catalog.updateItemWithNewImage',
      async () => {
        // Retrieve full object with related objects
        const items = await this.catalogAgent.retrieveCatalogObjectsWithVersions([itemId], {
          includeRelatedObjects: true
        });

        if (!items || items.length === 0) {
          throw new Error(`Item ${itemId} not found`);
        }

        const item = items[0];
        if (item.type !== 'ITEM') {
          throw new Error(`Object ${itemId} is not an ITEM (type: ${item.type})`);
        }

        // Merge existing imageIds with new image ID
        const existingImageIds = item.itemData?.imageIds || [];
        const updatedImageIds = [...existingImageIds, newImageId];

        // Construct catalog object for upsert, preserving all fields
        const catalogObject = {
          type: 'ITEM',
          id: item.id,
          version: item.version,
          presentAtAllLocations: item.presentAtAllLocations,
          itemData: {
            ...item.itemData,
            imageIds: updatedImageIds
          }
        };

        console.log(`🔄 Updating item ${itemId} with new image ${newImageId}...`);
        console.log(`   🖼️ Before: ${existingImageIds.length} images`);
        console.log(`   🖼️ After: ${updatedImageIds.length} images`);

        // Use version-safe batch upsert
        const result = await this.catalogAgent.batchUpsertWithVersions([catalogObject]);

        if (!result.objects || result.objects.length === 0) {
          throw new Error('No objects returned from upsert');
        }

        const updatedItem = result.objects[0];
        console.log(`✅ Item updated successfully (version ${updatedItem.version})`);

        return updatedItem;
      },
      { itemId, newImageId }
    );
  }

  /**
   * Process multiple items and append images to them
   * @param {Array} itemIds - Array of item IDs
   * @param {Array} imagePaths - Array of image file paths
   * @returns {Promise<Object>} Processing results
   */
  async processItemImages(itemIds, imagePaths) {
    const results = [];
    const errors = [];

    console.log(`\n🔄 Processing ${itemIds.length} items with ${imagePaths.length} images...`);

    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      
      try {
        console.log(`\n[${i + 1}/${itemIds.length}] Processing item ${itemId}...`);
        
        for (const imagePath of imagePaths) {
          const imageId = await this.appendImageToItem(itemId, imagePath);
          const updatedItem = await this.updateItemWithNewImage(itemId, imageId);
          
          results.push({
            itemId,
            imagePath,
            imageId,
            version: updatedItem.version,
            timestamp: new Date().toISOString()
          });
        }
        
        // Add delay to avoid rate limiting
        if (i < itemIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
      } catch (error) {
        console.error(`❌ Failed to process item ${itemId}: ${error.message}`);
        errors.push({
          itemId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    return { results, errors };
  }

  /**
   * Save processing results to JSON file
   * @param {Object} results - Processing results
   */
  async saveResults(results) {
    try {
      await fs.ensureDir('./logs');
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const logFile = `./logs/append-images-${timestamp}.json`;
      
      const reportData = {
        timestamp: new Date().toISOString(),
        summary: {
          totalProcessed: results.results.length + results.errors.length,
          successful: results.results.length,
          failed: results.errors.length,
          successRate: results.results.length / (results.results.length + results.errors.length) * 100
        },
        results: results.results,
        errors: results.errors
      };
      
      await fs.writeJSON(logFile, reportData, { spaces: 2 });
      console.log(`\n💾 Results saved to: ${logFile}`);
      
    } catch (error) {
      console.error(`❌ Failed to save results: ${error.message}`);
    }
  }

  /**
   * Print summary of operations
   * @param {Object} results - Processing results
   */
  printSummary(results) {
    const total = results.results.length + results.errors.length;
    const successRate = total > 0 ? (results.results.length / total * 100).toFixed(1) : 0;
    
    console.log('\n📊 Image Append Summary:');
    console.log(`   📦 Total Items: ${total}`);
    console.log(`   ✅ Successful: ${results.results.length}`);
    console.log(`   ❌ Failed: ${results.errors.length}`);
    console.log(`   📈 Success Rate: ${successRate}%`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Failed Items:');
      results.errors.forEach(error => {
        console.log(`   - ${error.itemId}: ${error.error}`);
      });
    }
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup() {
    try {
      await this.observabilityAgent.shutdown();
    } catch (error) {
      console.warn('⚠️ Warning: Error during cleanup:', error.message);
    }
  }
}

// Main execution function
async function main() {
  const appender = new SquarePriceImageAppender();
  
  try {
    // Test Square connection
    console.log('🔍 Testing Square API connection...');
    if (!(await appender.catalogAgent.testConnection())) {
      throw new Error('Square API connection failed');
    }
    console.log('✅ Square API connected successfully\n');

    // Parse command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === '--help') {
      console.log('Usage:');
      console.log('  node scripts/find-by-price-append-images.js --exact-price-append <price> [tolerance] --image-dir <directory> [--limit <n>]');
      console.log('');
      console.log('Arguments:');
      console.log('  --exact-price-append <price> [tolerance]  # Find items at exact price (in cents) with optional tolerance');
      console.log('  --image-dir <directory>                   # Directory containing images to append');
      console.log('  --limit <n>                               # Maximum number of items to process (default: 10)');
      console.log('');
      console.log('Examples:');
      console.log('  node scripts/find-by-price-append-images.js --exact-price-append 4999 --image-dir ./new-images --limit 5');
      console.log('  node scripts/find-by-price-append-images.js --exact-price-append 2500 50 --image-dir ./jewelry-images');
      process.exit(0);
    }

    let exactPrice = null;
    let tolerance = 0;
    let imageDir = null;
    let limit = 10;

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--exact-price-append' && i + 1 < args.length) {
        exactPrice = parseInt(args[i + 1]);
        if (i + 2 < args.length && !args[i + 2].startsWith('--') && !isNaN(parseInt(args[i + 2]))) {
          tolerance = parseInt(args[i + 2]);
          i++; // Skip tolerance argument
        }
        i++; // Skip price argument
      } else if (args[i] === '--image-dir' && i + 1 < args.length) {
        imageDir = args[i + 1];
        i++;
      } else if (args[i] === '--limit' && i + 1 < args.length) {
        limit = parseInt(args[i + 1]);
        i++;
      }
    }

    // Validate arguments
    if (exactPrice === null || isNaN(exactPrice)) {
      throw new Error('--exact-price-append requires a valid price in cents');
    }
    
    if (!imageDir) {
      throw new Error('--image-dir is required');
    }
    
    if (!(await fs.pathExists(imageDir))) {
      throw new Error(`Image directory not found: ${imageDir}`);
    }
    
    if (isNaN(limit) || limit <= 0) {
      throw new Error('--limit must be a positive number');
    }

    // Find items by price
    const matchedVariations = await appender.findVariationsByExactPrice(exactPrice, tolerance, limit);
    
    if (matchedVariations.length === 0) {
      console.log('🔍 No items found matching your criteria.');
      await appender.cleanup();
      return;
    }

    const uniqueItemIds = [...new Set(matchedVariations.map(v => v.itemId))];
    console.log(`\n📋 Found ${matchedVariations.length} variations across ${uniqueItemIds.length} unique items`);

    // Get image files from directory
    const imageFiles = (await fs.readdir(imageDir))
      .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
      .map(file => path.join(imageDir, file));
      
    if (imageFiles.length === 0) {
      throw new Error(`No image files found in ${imageDir}`);
    }
    
    console.log(`🖼️ Found ${imageFiles.length} image files to append`);

    // Process items and append images
    const processingResults = await appender.processItemImages(uniqueItemIds, imageFiles);
    
    // Print summary and save results
    appender.printSummary(processingResults);
    await appender.saveResults(processingResults);
    
    await appender.cleanup();
    console.log('\n🎉 Image append process completed successfully!');
    
  } catch (error) {
    console.error('💥 Operation failed:', error.message);
    await appender.cleanup();
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { SquarePriceImageAppender };
