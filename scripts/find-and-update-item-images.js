#!/usr/bin/env node

import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import { AdvancedObservabilityAgent } from '../src/observability/AdvancedObservabilityAgent.js';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Advanced Square Catalog Image Updater
 * Find items by price range and update their images with full observability
 */
class SquareCatalogImageUpdater {
  constructor() {
    this.catalogAgent = new SquareCatalogAgent();
    
    // Initialize advanced observability
    this.observabilityAgent = new AdvancedObservabilityAgent(this.catalogAgent, {
      merchantId: process.env.SQUARE_MERCHANT_ID || 'primary',
      serviceName: 'square-image-updater',
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
   * Find catalog items by price range
   * @param {number} minPrice - Minimum price in cents (e.g., 1000 = $10.00)
   * @param {number} maxPrice - Maximum price in cents (e.g., 5000 = $50.00)
   * @param {number} limit - Maximum number of items to return
   * @returns {Promise<Array>} Array of catalog items with price information
   */
  async findItemsByPriceRange(minPrice, maxPrice, limit = 50) {
    return await this.observabilityAgent.traceSquareOperation(
      'catalog.findByPrice',
      async () => {
        console.log(`🔍 Searching for items with price between $${(minPrice/100).toFixed(2)} and $${(maxPrice/100).toFixed(2)}...`);
        
        // Search for all items first (Square doesn't support direct price filtering)
        const searchQuery = {
          objectTypes: ['ITEM'],
          includeRelatedObjects: true,
          limit: limit * 2 // Get more to account for filtering
        };
        
        const allItems = await this.catalogAgent.searchCatalogObjects(searchQuery);
        console.log(`   📦 Found ${allItems.length} total items in catalog`);
        
        // Filter items by price range
        const itemsInPriceRange = [];
        
        for (const item of allItems) {
          if (item.type === 'ITEM' && item.itemData?.variations) {
            for (const variation of item.itemData.variations) {
              if (variation.itemVariationData?.priceMoney?.amount) {
                const priceInCents = Number(variation.itemVariationData.priceMoney.amount);
                
                if (priceInCents >= minPrice && priceInCents <= maxPrice) {
                  itemsInPriceRange.push({
                    item,
                    variation,
                    price: priceInCents,
                    priceFormatted: `$${(priceInCents/100).toFixed(2)}`,
                    hasImage: !!(item.itemData?.imageIds?.length > 0)
                  });
                  
                  // Stop when we reach our limit
                  if (itemsInPriceRange.length >= limit) {
                    break;
                  }
                }
              }
            }
            
            if (itemsInPriceRange.length >= limit) {
              break;
            }
          }
        }
        
        console.log(`   💰 Found ${itemsInPriceRange.length} items in price range`);
        return itemsInPriceRange;
      },
      { minPrice, maxPrice, limit }
    );
  }

  /**
   * Find items by specific price
   * @param {number} exactPrice - Exact price in cents
   * @param {number} tolerance - Price tolerance in cents (default: 0)
   * @returns {Promise<Array>} Array of items at the exact price
   */
  async findItemsByExactPrice(exactPrice, tolerance = 0) {
    const minPrice = exactPrice - tolerance;
    const maxPrice = exactPrice + tolerance;
    
    console.log(`🎯 Finding items at exactly $${(exactPrice/100).toFixed(2)}${tolerance > 0 ? ` (±$${(tolerance/100).toFixed(2)})` : ''}...`);
    
    return await this.findItemsByPriceRange(minPrice, maxPrice, 100);
  }

  /**
   * Find items without images
   * @param {number} limit - Maximum number of items to return
   * @returns {Promise<Array>} Array of items without images
   */
  async findItemsWithoutImages(limit = 20) {
    return await this.observabilityAgent.traceSquareOperation(
      'catalog.findWithoutImages',
      async () => {
        console.log(`🖼️ Searching for items without images...`);
        
        const searchQuery = {
          objectTypes: ['ITEM'],
          limit: limit * 3 // Get more to account for filtering
        };
        
        const allItems = await this.catalogAgent.searchCatalogObjects(searchQuery);
        
        const itemsWithoutImages = allItems
          .filter(item => 
            item.type === 'ITEM' && 
            (!item.itemData?.imageIds || item.itemData.imageIds.length === 0)
          )
          .slice(0, limit)
          .map(item => ({
            item,
            hasImage: false,
            price: this.getItemPrice(item),
            priceFormatted: this.formatPrice(this.getItemPrice(item))
          }));
        
        console.log(`   📋 Found ${itemsWithoutImages.length} items without images`);
        return itemsWithoutImages;
      },
      { limit }
    );
  }

  /**
   * Update image for a catalog item
   * @param {Object} itemData - Item data from search results  
   * @param {string} imagePath - Path to new image file
   * @returns {Promise<Object>} Update result
   */
  async updateItemImage(itemData, imagePath) {
    const { item } = itemData;
    const itemName = item.itemData?.name || 'Unknown Item';
    
    return await this.observabilityAgent.traceSquareOperation(
      'catalog.updateImage',
      async () => {
        console.log(`\n🖼️ Updating image for: ${itemName}`);
        console.log(`   💰 Price: ${itemData.priceFormatted || 'N/A'}`);
        console.log(`   📁 Image: ${path.basename(imagePath)}`);
        
        // Validate image file
        if (!(await fs.pathExists(imagePath))) {
          throw new Error(`Image file not found: ${imagePath}`);
        }
        
        const stats = await fs.stat(imagePath);
        if (stats.size > 10 * 1024 * 1024) { // 10MB limit
          throw new Error(`Image file too large: ${Math.round(stats.size / 1024 / 1024)}MB (max 10MB)`);
        }
        
        // Upload new image
        const imageBuffer = await fs.readFile(imagePath);
        const uploadedImage = await this.catalogAgent.uploadImage(
          imageBuffer,
          `${itemName} - Updated ${new Date().toISOString().split('T')[0]}`,
          `Updated product image for ${itemName}`
        );
        
        console.log(`   ✅ Image uploaded: ${uploadedImage.id}`);
        
        // Update the catalog item with new image
        const updatedItem = {
          type: 'ITEM',
          id: item.id,
          version: item.version,
          presentAtAllLocations: item.presentAtAllLocations,
          itemData: {
            ...item.itemData,
            imageIds: [uploadedImage.id] // Replace existing images
          }
        };
        
        const result = await this.catalogAgent.batchUpsertWithVersions([updatedItem]);
        
        if (result?.objects?.length > 0) {
          const updated = result.objects[0];
          console.log(`   🔄 Item updated: ${updated.id} (version ${updated.version})`);
          
          return {
            success: true,
            item: updated,
            oldImageIds: item.itemData?.imageIds || [],
            newImageId: uploadedImage.id,
            imagePath
          };
        } else {
          throw new Error('No objects returned from update');
        }
      },
      { 
        itemId: item.id, 
        itemName, 
        imagePath: path.basename(imagePath),
        hasExistingImage: !!(item.itemData?.imageIds?.length > 0)
      }
    );
  }

  /**
   * Batch update images for multiple items
   * @param {Array} itemsWithImages - Array of {itemData, imagePath} objects
   * @returns {Promise<Object>} Batch update results
   */
  async batchUpdateImages(itemsWithImages) {
    console.log(`\n🔄 Starting batch image update for ${itemsWithImages.length} items...`);
    
    const results = [];
    const errors = [];
    
    for (let i = 0; i < itemsWithImages.length; i++) {
      const { itemData, imagePath } = itemsWithImages[i];
      
      try {
        console.log(`\n[${i + 1}/${itemsWithImages.length}] Processing item...`);
        
        const result = await this.updateItemImage(itemData, imagePath);
        results.push({
          itemName: itemData.item.itemData?.name,
          itemId: itemData.item.id,
          price: itemData.priceFormatted,
          imagePath,
          ...result
        });
        
        // Add delay to avoid rate limiting
        if (i < itemsWithImages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
      } catch (error) {
        console.error(`❌ Failed to update ${itemData.item.itemData?.name}: ${error.message}`);
        errors.push({
          itemName: itemData.item.itemData?.name,
          itemId: itemData.item.id,
          price: itemData.priceFormatted,
          imagePath,
          error: error.message
        });
      }
    }
    
    return { results, errors };
  }

  /**
   * Get item price from the first variation
   * @param {Object} item - Catalog item
   * @returns {number} Price in cents
   */
  getItemPrice(item) {
    if (item.itemData?.variations?.[0]?.itemVariationData?.priceMoney?.amount) {
      return Number(item.itemData.variations[0].itemVariationData.priceMoney.amount);
    }
    return 0;
  }

  /**
   * Format price for display
   * @param {number} priceInCents - Price in cents
   * @returns {string} Formatted price string
   */
  formatPrice(priceInCents) {
    return `$${(priceInCents / 100).toFixed(2)}`;
  }

  /**
   * Display found items in a nice table format
   * @param {Array} items - Array of item data
   */
  displayItems(items) {
    console.log('\n📋 Found Items:');
    console.log('='.repeat(80));
    
    items.forEach((itemData, index) => {
      const { item, price, priceFormatted, hasImage } = itemData;
      const name = item.itemData?.name || 'Unknown Item';
      const sku = item.itemData?.variations?.[0]?.itemVariationData?.sku || 'N/A';
      const imageStatus = hasImage ? '🖼️ Has Image' : '🚫 No Image';
      
      console.log(`${index + 1}. ${name}`);
      console.log(`   💰 Price: ${priceFormatted}`);
      console.log(`   📦 SKU: ${sku}`);
      console.log(`   🖼️ Image: ${imageStatus}`);
      console.log(`   🆔 ID: ${item.id}`);
      console.log('');
    });
  }

  /**
   * Save results to file
   * @param {Object} results - Processing results
   */
  async saveResults(results) {
    try {
      await fs.ensureDir('./logs');
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const logFile = `./logs/image-update-${timestamp}.json`;
      
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
    
    console.log(`\n📊 Image Update Summary:`);
    console.log(`   📦 Total Items: ${total}`);
    console.log(`   ✅ Successful: ${results.results.length}`);
    console.log(`   ❌ Failed: ${results.errors.length}`);
    console.log(`   📈 Success Rate: ${successRate}%`);
    
    if (results.errors.length > 0) {
      console.log(`\n❌ Failed Items:`);
      results.errors.forEach(error => {
        console.log(`   - ${error.itemName}: ${error.error}`);
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
  const updater = new SquareCatalogImageUpdater();
  
  try {
    // Test Square connection
    console.log('🔍 Testing Square API connection...');
    if (!(await updater.catalogAgent.testConnection())) {
      throw new Error('Square API connection failed');
    }
    console.log('✅ Square API connected successfully\n');

    // Parse command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      console.log('Usage:');
      console.log('  node scripts/find-and-update-item-images.js --price-range <min> <max>  # Find by price range');
      console.log('  node scripts/find-and-update-item-images.js --exact-price <price>      # Find by exact price');  
      console.log('  node scripts/find-and-update-item-images.js --no-images               # Find items without images');
      console.log('  node scripts/find-and-update-item-images.js --update-item <id> <image> # Update specific item');
      console.log('');
      console.log('Examples:');
      console.log('  node scripts/find-and-update-item-images.js --price-range 1000 5000   # $10 to $50');
      console.log('  node scripts/find-and-update-item-images.js --exact-price 2500        # Exactly $25');
      console.log('  node scripts/find-and-update-item-images.js --no-images               # Items without images');
      process.exit(1);
    }

    let items = [];

    // Handle different search modes
    if (args[0] === '--price-range' && args.length >= 3) {
      const minPrice = parseInt(args[1]);
      const maxPrice = parseInt(args[2]);
      const limit = args[3] ? parseInt(args[3]) : 20;
      
      if (isNaN(minPrice) || isNaN(maxPrice)) {
        throw new Error('Price values must be numbers (in cents)');
      }
      
      items = await updater.findItemsByPriceRange(minPrice, maxPrice, limit);
      
    } else if (args[0] === '--exact-price' && args.length >= 2) {
      const exactPrice = parseInt(args[1]);
      const tolerance = args[2] ? parseInt(args[2]) : 0;
      
      if (isNaN(exactPrice)) {
        throw new Error('Price value must be a number (in cents)');
      }
      
      items = await updater.findItemsByExactPrice(exactPrice, tolerance);
      
    } else if (args[0] === '--no-images') {
      const limit = args[1] ? parseInt(args[1]) : 20;
      items = await updater.findItemsWithoutImages(limit);
      
    } else if (args[0] === '--update-item' && args.length >= 3) {
      const itemId = args[1];
      const imagePath = args[2];
      
      // Find the specific item
      const searchQuery = {
        objectTypes: ['ITEM'],
        objectIds: [itemId]
      };
      
      const foundItems = await updater.catalogAgent.searchCatalogObjects(searchQuery);
      if (foundItems.length === 0) {
        throw new Error(`Item not found: ${itemId}`);
      }
      
      const itemData = {
        item: foundItems[0],
        price: updater.getItemPrice(foundItems[0]),
        priceFormatted: updater.formatPrice(updater.getItemPrice(foundItems[0])),
        hasImage: !!(foundItems[0].itemData?.imageIds?.length > 0)
      };
      
      const result = await updater.updateItemImage(itemData, imagePath);
      console.log('\n✅ Item updated successfully!');
      console.log(`   📦 Item: ${itemData.item.itemData?.name}`);
      console.log(`   🖼️ New Image: ${result.newImageId}`);
      
      await updater.cleanup();
      return;
      
    } else {
      throw new Error('Invalid arguments. Use --help for usage information.');
    }

    // Display found items
    if (items.length === 0) {
      console.log('🔍 No items found matching your criteria.');
      await updater.cleanup();
      return;
    }

    updater.displayItems(items);
    
    // Ask if user wants to update images (in a real interactive script, you'd use readline)
    console.log(`\n💡 Found ${items.length} items. To update images, you can:`);
    console.log('   1. Use --update-item <item-id> <image-path> for individual updates');
    console.log('   2. Modify this script to batch update with your image directory');
    
    await updater.cleanup();
    console.log('\n🎉 Search completed successfully!');
    
  } catch (error) {
    console.error('💥 Operation failed:', error.message);
    await updater.cleanup();
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { SquareCatalogImageUpdater };
