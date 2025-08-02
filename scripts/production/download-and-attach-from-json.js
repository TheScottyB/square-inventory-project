#!/usr/bin/env node

import { SquareCatalogAgent } from '../../src/agents/SquareCatalogAgent.js';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';

/**
 * Complete workflow script to download images from JSON file and attach to Square catalog items
 * 
 * This script:
 * 1. Reads the spocket-scraped-images.json file
 * 2. Downloads all product images to the appropriate category folder
 * 3. Finds matching Square catalog items (by category or other criteria)
 * 4. Uploads and attaches images to the correct Square catalog items
 */

const agent = new SquareCatalogAgent();

/**
 * Download an image from URL and save to local directory
 */
async function downloadImage(imageUrl, savePath, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`   📥 Downloading: ${path.basename(savePath)} (attempt ${attempt}/${retries})`);
      
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 30000 // 30 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const buffer = await response.buffer();
      
      if (buffer.length === 0) {
        throw new Error('Empty response buffer');
      }
      
      // Ensure directory exists
      await fs.ensureDir(path.dirname(savePath));
      
      // Save the image
      await fs.writeFile(savePath, buffer);
      
      const stats = await fs.stat(savePath);
      console.log(`   ✅ Downloaded: ${path.basename(savePath)} (${Math.round(stats.size / 1024)}KB)`);
      
      return { success: true, size: stats.size, path: savePath };
      
    } catch (error) {
      console.log(`   ❌ Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt === retries) {
        return { success: false, error: error.message };
      }
      
      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`   ⏱️ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Create category directory structure
 */
function getCategoryDirectory(category) {
  // Normalize category name for directory
  const normalizedCategory = category
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  return normalizedCategory || 'miscellaneous';
}

/**
 * Find catalog items that might match the images (by category or other criteria)
 */
async function findMatchingCatalogItems(category, productName, description) {
  console.log(`🔍 Searching for catalog items matching category: ${category}`);
  
  try {
    // Search for items in the catalog
    const searchResults = await agent.searchCatalogObjects({
      objectTypes: ['ITEM'],
      limit: 100
    });
    
    const items = searchResults || [];
    console.log(`   📦 Found ${items.length} total catalog items`);
    
    // Try to find items that might match
    const potentialMatches = [];
    
    for (const item of items) {
      const itemData = item.itemData;
      if (!itemData) continue;
      
      const itemName = itemData.name?.toLowerCase() || '';
      const itemDescription = itemData.description?.toLowerCase() || '';
      
      // Scoring system for matches
      let score = 0;
      
      // Check for category matches in name or description
      if (category && category !== 'miscellaneous-products') {
        const categoryKeywords = category.split('-').filter(word => word.length > 2);
        categoryKeywords.forEach(keyword => {
          if (itemName.includes(keyword) || itemDescription.includes(keyword)) {
            score += 2;
          }
        });
      }
      
      // Check for product name matches
      if (productName && productName !== 'Product Description' && productName !== 'Image') {
        const productKeywords = productName.toLowerCase().split(' ').filter(word => word.length > 2);
        productKeywords.forEach(keyword => {
          if (itemName.includes(keyword) || itemDescription.includes(keyword)) {
            score += 3;
          }
        });
      }
      
      // Check for description matches
      if (description && description !== 'In Store' && description) {
        const descKeywords = description.toLowerCase().split(' ').filter(word => word.length > 2);
        descKeywords.forEach(keyword => {
          if (itemName.includes(keyword) || itemDescription.includes(keyword)) {
            score += 1;
          }
        });
      }
      
      if (score > 0) {
        potentialMatches.push({
          item,
          score,
          name: itemData.name,
          description: itemData.description,
          imageCount: itemData.imageIds?.length || 0
        });
      }
    }
    
    // Sort by score (highest first)
    potentialMatches.sort((a, b) => b.score - a.score);
    
    console.log(`   🎯 Found ${potentialMatches.length} potential matches`);
    potentialMatches.slice(0, 5).forEach((match, i) => {
      console.log(`     ${i + 1}. ${match.name} (score: ${match.score}, images: ${match.imageCount})`);
    });
    
    return potentialMatches;
    
  } catch (error) {
    console.error('❌ Error searching for catalog items:', error.message);
    return [];
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
📖 Download Images from JSON and Attach to Square Catalog Items

Usage:
  node scripts/download-and-attach-from-json.js [options]

Options:
  --json-path PATH       Path to the JSON file (default: /Users/scottybe/Downloads/spocket-scraped-images.json)
  --target-item-id ID    Specific catalog item ID to attach images to
  --category-filter CAT  Only process images from specific category
  --dry-run             Download images but don't upload to Square
  --skip-download       Skip download step, use existing images
  --limit N             Limit number of images to process (default: all)

Examples:
  node scripts/download-and-attach-from-json.js
  node scripts/download-and-attach-from-json.js --target-item-id K7LO5CCCNKCWAB5VO426QZSQ
  node scripts/download-and-attach-from-json.js --category-filter miscellaneous-products --limit 5
  node scripts/download-and-attach-from-json.js --dry-run
`);
    return;
  }
  
  // Parse arguments
  const jsonPath = args.includes('--json-path') 
    ? args[args.indexOf('--json-path') + 1] 
    : '/Users/scottybe/Downloads/spocket-scraped-images.json';
  
  const targetItemId = args.includes('--target-item-id') 
    ? args[args.indexOf('--target-item-id') + 1] 
    : null;
  
  const categoryFilter = args.includes('--category-filter') 
    ? args[args.indexOf('--category-filter') + 1] 
    : null;
  
  const isDryRun = args.includes('--dry-run');
  const skipDownload = args.includes('--skip-download');
  
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;
  
  try {
    console.log('🚀 Starting Download and Attach Workflow');
    console.log('=====================================\n');
    
    // Test Square connection (unless dry-run)
    if (!isDryRun) {
      console.log('🔗 Testing Square API connection...');
      const isConnected = await agent.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to Square API');
      }
      console.log('✅ Connected successfully\n');
    }
    
    // Read JSON file
    console.log(`📄 Reading JSON file: ${jsonPath}`);
    if (!(await fs.pathExists(jsonPath))) {
      throw new Error(`JSON file not found: ${jsonPath}`);
    }
    
    const jsonData = await fs.readJSON(jsonPath);
    let images = jsonData.productImages || [];
    
    if (categoryFilter) {
      images = images.filter(img => img.category === categoryFilter);
      console.log(`   🔍 Filtered to ${images.length} images for category: ${categoryFilter}`);
    }
    
    if (limit && images.length > limit) {
      images = images.slice(0, limit);
      console.log(`   📊 Limited to ${limit} images`);
    }
    
    console.log(`   📊 Processing ${images.length} images`);
    
    if (images.length === 0) {
      console.log('💡 No images to process');
      return;
    }
    
    // Group images by category and product
    const imageGroups = new Map();
    
    images.forEach(image => {
      const key = `${image.category}-${image.productName}`;
      if (!imageGroups.has(key)) {
        imageGroups.set(key, {
          category: image.category,
          productName: image.productName,
          description: image.description,
          images: []
        });
      }
      imageGroups.get(key).images.push(image);
    });
    
    console.log(`\n📦 Found ${imageGroups.size} product groups:\n`);
    
    // Process each group
    for (const [groupKey, group] of imageGroups) {
      console.log(`[GROUP] ${group.productName} (${group.category})`);
      console.log(`   📸 ${group.images.length} images`);
      
      const categoryDir = getCategoryDirectory(group.category);
      const downloadDir = path.join(process.cwd(), categoryDir);
      
      // Download images (unless skipped)
      const downloadedImages = [];
      
      if (!skipDownload) {
        console.log(`   📁 Download directory: ${categoryDir}/`);
        
        for (const image of group.images) {
          const filename = image.filename || `image-${image.index}.jpg`;
          const savePath = path.join(downloadDir, filename);
          
          const result = await downloadImage(image.url, savePath);
          
          if (result.success) {
            downloadedImages.push({
              ...image,
              localPath: result.path,
              size: result.size
            });
          } else {
            console.log(`   ⚠️ Skipping failed download: ${filename}`);
          }
        }
      } else {
        // Use existing images
        console.log(`   📁 Using existing images from: ${categoryDir}/`);
        for (const image of group.images) {
          const filename = image.filename || `image-${image.index}.jpg`;
          const localPath = path.join(downloadDir, filename);
          
          if (await fs.pathExists(localPath)) {
            const stats = await fs.stat(localPath);
            downloadedImages.push({
              ...image,
              localPath,
              size: stats.size
            });
          }
        }
      }
      
      console.log(`   ✅ Ready to upload: ${downloadedImages.length} images`);
      
      if (downloadedImages.length === 0) {
        console.log(`   ⚠️ No images available for upload\n`);
        continue;
      }
      
      // Skip Square upload in dry-run mode
      if (isDryRun) {
        console.log(`   🔍 [DRY RUN] Would search for matching catalog items and upload ${downloadedImages.length} images\n`);
        continue;
      }
      
      // Find matching catalog item
      let targetItem = null;
      
      if (targetItemId) {
        // Use specific target item
        console.log(`   🎯 Using specified target item: ${targetItemId}`);
        try {
          const items = await agent.retrieveCatalogObjectsWithVersions([targetItemId]);
          if (items.length > 0) {
            targetItem = { item: items[0], score: 100, name: items[0].itemData?.name };
          }
        } catch (error) {
          console.log(`   ❌ Failed to retrieve target item: ${error.message}`);
        }
      } else {
        // Search for matching items
        const matches = await findMatchingCatalogItems(
          group.category, 
          group.productName, 
          group.description
        );
        
        if (matches.length > 0) {
          targetItem = matches[0]; // Use highest scoring match
          console.log(`   🎯 Selected best match: ${targetItem.name} (score: ${targetItem.score})`);
        }
      }
      
      if (!targetItem) {
        console.log(`   ⚠️ No matching catalog item found for this group\n`);
        continue;
      }
      
      // Upload and attach images using direct attachment method
      console.log(`   🚀 Uploading ${downloadedImages.length} images to item: ${targetItem.item.id}`);
      
      const uploadResults = { success: 0, failed: 0, errors: [] };
      
      for (let i = 0; i < downloadedImages.length; i++) {
        const image = downloadedImages[i];
        
        try {
          console.log(`     [${i + 1}/${downloadedImages.length}] Uploading: ${path.basename(image.localPath)}`);
          
          const imageBuffer = await fs.readFile(image.localPath);
          const imageName = path.basename(image.localPath, path.extname(image.localPath));
          const contentType = agent.getImageContentType(image.localPath);
          
          // Create catalog image object for direct attachment
          const catalogImageObject = {
            type: 'IMAGE',
            id: `#image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            imageData: {
              name: imageName,
              caption: image.alt || `Product image: ${imageName}`,
            }
          };
          
          // Prepare the create request with direct attachment
          const createRequest = {
            idempotencyKey: crypto.randomUUID(),
            image: catalogImageObject,
            objectId: targetItem.item.id,  // Direct attachment
            isPrimary: i === 0  // First image as primary
          };
          
          // Create Blob for file upload
          const imageFile = new Blob([imageBuffer], { type: contentType });
          Object.defineProperty(imageFile, 'name', {
            value: path.basename(image.localPath),
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
          
          uploadResults.success++;
          console.log(`       ✅ Uploaded: ${response.image.id} (${uploadTime}ms)`);
          console.log(`       🖼️ URL: ${response.image.imageData?.url}`);
          
        } catch (error) {
          uploadResults.failed++;
          uploadResults.errors.push({ 
            image: path.basename(image.localPath), 
            error: error.message 
          });
          console.log(`       ❌ Failed: ${error.message}`);
        }
      }
      
      // Summary for this group
      console.log(`   📊 Upload Summary:`);
      console.log(`     ✅ Successful: ${uploadResults.success}`);
      console.log(`     ❌ Failed: ${uploadResults.failed}`);
      console.log(`     📈 Success Rate: ${((uploadResults.success / downloadedImages.length) * 100).toFixed(1)}%\n`);
    }
    
    console.log('🎉 Download and attach workflow completed!');
    
  } catch (error) {
    console.error('\n💥 Workflow failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { downloadImage, findMatchingCatalogItems };
