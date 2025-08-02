#!/usr/bin/env node

import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

/**
 * Enhanced image attachment script using improved patterns from the Node.js recipe
 * Implements direct attachment during upload and proper version management
 */

const agent = new SquareCatalogAgent();

/**
 * Find ITEM_VARIATIONs that match the given price, then return their parent ITEM IDs.
 * This follows the recipe pattern of searching variations and filtering client-side.
 */
async function findItemsByPrice(amountCents, currency = 'USD') {
  console.log(`🔍 Searching for items with price $${(amountCents / 100).toFixed(2)} (${amountCents} cents)...`);
  
  const matched = new Set(); // Use Set to avoid duplicates
  let processedCount = 0;
  
  try {
    // Search all ITEM_VARIATION objects with pagination
    const searchResponse = await agent.searchCatalogObjects({
      objectTypes: ['ITEM_VARIATION'],
      limit: 1000 // Process in larger batches for efficiency
    });
    
    const variations = searchResponse || [];
    
    for (const variation of variations) {
      processedCount++;
      
      if (processedCount % 100 === 0) {
        console.log(`   📦 Processed ${processedCount} variations...`);
      }
      
      const variationData = variation.itemVariationData;
      if (!variationData?.priceMoney) continue;
      
      // Client-side price filtering
      if (
        variationData.priceMoney.amount == amountCents &&
        variationData.priceMoney.currency === currency
      ) {
        matched.add(variationData.itemId);
        console.log(`   💰 Found matching variation: ${variation.id} -> Item: ${variationData.itemId}`);
      }
    }
    
    console.log(`   📊 Processed ${processedCount} variations total`);
    return Array.from(matched);
    
  } catch (error) {
    console.error('❌ Error searching for items by price:', error.message);
    throw error;
  }
}

/**
 * Enhanced image upload with direct attachment during creation
 * Uses the recipe's approach of attaching during upload rather than separate update
 */
async function uploadAndAttachImage(itemId, imagePath, isPrimary = false) {
  try {
    console.log(`📤 Uploading and attaching: ${path.basename(imagePath)}`);
    
    const imageBuffer = await fs.readFile(imagePath);
    const imageName = path.basename(imagePath);
    const contentType = agent.getImageContentType(imageName);
    
    // Create catalog image object for direct attachment
    const catalogImageObject = {
      type: 'IMAGE',
      id: `#image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      imageData: {
        name: imageName,
        caption: `Product image: ${imageName}`,
      }
    };
    
    // Prepare the create request with direct attachment
    const createRequest = {
      idempotencyKey: crypto.randomUUID(),
      image: catalogImageObject,
      objectId: itemId,    // 🎯 Direct attachment during upload
      isPrimary: isPrimary  // 🔑 Set primary image flag
    };
    
    // Create Blob for file upload
    const imageFile = new Blob([imageBuffer], { type: contentType });
    Object.defineProperty(imageFile, 'name', {
      value: imageName,
      writable: false
    });
    
    // Upload with direct attachment
    const startTime = Date.now();
    const response = await agent.client.catalog.images.create({
      request: createRequest,
      imageFile: imageFile
    });
    
    const uploadTime = Date.now() - startTime;
    
    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors.map(err => `${err.code}: ${err.detail}`).join('; ');
      throw new Error(`Square API error: ${errorMessages}`);
    }
    
    if (!response.image) {
      throw new Error('No image object returned from Square API');
    }
    
    console.log(`   ✅ Uploaded and attached: ${response.image.id} (${uploadTime}ms)`);
    console.log(`   🖼️ Image URL: ${response.image.imageData?.url}`);
    
    return response.image;
    
  } catch (error) {
    console.error(`   ❌ Failed to upload ${path.basename(imagePath)}:`, error.message);
    throw error;
  }
}

/**
 * Alternative method: Upload images separately then batch attach
 * Uses proper version management and full object retrieval
 */
async function addImagesToItemWithVersionControl(itemId, imagePaths, setPrimary = false) {
  try {
    console.log(`🔄 Adding ${imagePaths.length} images to item ${itemId} with version control...`);
    
    // Step 1: Upload images without attachment
    const uploadedImages = [];
    for (const imagePath of imagePaths) {
      const imageBuffer = await fs.readFile(imagePath);
      const imageName = path.basename(imagePath);
      
      const uploadedImage = await agent.uploadImage(
        imageBuffer,
        imageName,
        `Product image: ${imageName}`
        // No objectId = unattached upload
      );
      
      uploadedImages.push(uploadedImage.id);
      console.log(`   ✅ Uploaded: ${uploadedImage.id}`);
    }
    
    // Step 2: Retrieve full item with version for safe update
    console.log(`   📋 Retrieving current item state...`);
    const items = await agent.retrieveCatalogObjectsWithVersions([itemId], {
      includeRelatedObjects: true
    });
    
    if (items.length === 0 || items[0].type !== 'ITEM') {
      throw new Error(`Item ${itemId} not found or not an ITEM type`);
    }
    
    const item = items[0];
    const existingImageIds = item.itemData?.imageIds || [];
    
    console.log(`   🖼️ Current images: ${existingImageIds.length}`);
    console.log(`   🆕 Adding images: ${uploadedImages.length}`);
    
    // Step 3: Prepare updated item with version control
    let newImageIds;
    if (setPrimary && uploadedImages.length > 0) {
      // Put first new image at the front (makes it primary)
      newImageIds = [uploadedImages[0], ...existingImageIds, ...uploadedImages.slice(1)];
    } else {
      // Append new images to existing ones
      newImageIds = [...existingImageIds, ...uploadedImages];
    }
    
    const objectToUpsert = {
      type: 'ITEM',
      id: item.id,
      version: item.version, // 🛡️ Version control for optimistic concurrency
      presentAtAllLocations: item.presentAtAllLocations,
      itemData: {
        ...item.itemData,  // 🔄 Preserve all existing data
        imageIds: newImageIds
      }
    };
    
    // Step 4: Update item with new image IDs
    console.log(`   🔄 Updating item with ${newImageIds.length} total images...`);
    const result = await agent.batchUpsertWithVersions([objectToUpsert]);
    
    if (result.objects && result.objects.length > 0) {
      const updatedItem = result.objects[0];
      console.log(`   ✅ Item updated successfully`);
      console.log(`   🆔 New version: ${updatedItem.version}`);
      console.log(`   🖼️ Total images: ${updatedItem.itemData?.imageIds?.length || 0}`);
      
      return updatedItem;
    } else {
      throw new Error('No objects returned from batch upsert');
    }
    
  } catch (error) {
    console.error(`❌ Failed to add images to item ${itemId}:`, error.message);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log(`
📖 Enhanced Find by Price and Attach Images

Usage:
  node scripts/enhanced-find-and-attach-images.js <method> <price_cents> <image_directory> [options]

Methods:
  direct    - Upload and attach images directly during creation (recommended)
  batch     - Upload separately then batch attach with version control

Options:
  --primary    Set first image as primary
  --limit N    Limit to N items (default: 5)

Examples:
  node scripts/enhanced-find-and-attach-images.js direct 4999 ./new-images --primary
  node scripts/enhanced-find-and-attach-images.js batch 149423 ./first-aid-kits --limit 1
`);
    process.exit(1);
  }
  
  const [method, priceStr, imageDir] = args;
  const priceCents = parseInt(priceStr);
  const isPrimary = args.includes('--primary');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : 5;
  
  if (isNaN(priceCents)) {
    console.error('❌ Invalid price. Please provide price in cents (e.g., 4999 for $49.99)');
    process.exit(1);
  }
  
  if (!['direct', 'batch'].includes(method)) {
    console.error('❌ Invalid method. Use "direct" or "batch"');
    process.exit(1);
  }
  
  try {
    // Test connection
    console.log('🔗 Testing Square API connection...');
    const isConnected = await agent.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to Square API');
    }
    console.log('✅ Connected successfully\n');
    
    // Find items by price
    const itemIds = await findItemsByPrice(priceCents);
    
    if (itemIds.length === 0) {
      console.log(`💡 No items found with price $${(priceCents / 100).toFixed(2)}`);
      return;
    }
    
    console.log(`\n📋 Found ${itemIds.length} items, processing up to ${limit}...\n`);
    
    // Get image files
    if (!(await fs.pathExists(imageDir))) {
      throw new Error(`Image directory not found: ${imageDir}`);
    }
    
    const files = await fs.readdir(imageDir);
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
    ).map(file => path.join(imageDir, file));
    
    if (imageFiles.length === 0) {
      throw new Error(`No image files found in ${imageDir}`);
    }
    
    console.log(`🖼️ Found ${imageFiles.length} images to attach\n`);
    
    // Process items
    const itemsToProcess = itemIds.slice(0, limit);
    const results = { success: 0, failed: 0, errors: [] };
    
    for (let i = 0; i < itemsToProcess.length; i++) {
      const itemId = itemsToProcess[i];
      console.log(`\n[${i + 1}/${itemsToProcess.length}] Processing item ${itemId}...`);
      
      try {
        if (method === 'direct') {
          // Direct attachment method
          for (let j = 0; j < imageFiles.length; j++) {
            const imagePath = imageFiles[j];
            await uploadAndAttachImage(itemId, imagePath, isPrimary && j === 0);
          }
        } else {
          // Batch attachment with version control
          await addImagesToItemWithVersionControl(itemId, imageFiles, isPrimary);
        }
        
        results.success++;
        console.log(`   ✅ Successfully processed item ${itemId}`);
        
      } catch (error) {
        results.failed++;
        results.errors.push({ itemId, error: error.message });
        console.log(`   ❌ Failed to process item ${itemId}: ${error.message}`);
      }
    }
    
    // Summary
    console.log(`\n📊 Processing Summary:`);
    console.log(`   ✅ Successful: ${results.success}`);
    console.log(`   ❌ Failed: ${results.failed}`);
    console.log(`   📈 Success Rate: ${((results.success / itemsToProcess.length) * 100).toFixed(1)}%`);
    
    if (results.errors.length > 0) {
      console.log(`\n❌ Failed Items:`);
      results.errors.forEach(({ itemId, error }) => {
        console.log(`   - ${itemId}: ${error}`);
      });
    }
    
  } catch (error) {
    console.error('\n💥 Script failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { findItemsByPrice, uploadAndAttachImage, addImagesToItemWithVersionControl };
