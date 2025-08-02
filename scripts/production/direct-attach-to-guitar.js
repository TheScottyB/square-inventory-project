#!/usr/bin/env node

import { SquareCatalogAgent } from '../../src/agents/SquareCatalogAgent.js';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

/**
 * Simple script to attach all images from miscellaneous-products to "The Original" guitar item
 * using the successful direct attachment method
 */

const agent = new SquareCatalogAgent();
const TARGET_ITEM_ID = 'K7LO5CCCNKCWAB5VO426QZSQ'; // "The Original" Metal Electric Guitar
const IMAGE_DIR = 'assets/images/miscellaneous-products';

async function uploadAndAttachImages() {
  try {
    console.log('🚀 Starting Direct Image Upload and Attachment');
    console.log('============================================\n');
    
    // Test Square connection
    console.log('🔗 Testing Square API connection...');
    const isConnected = await agent.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to Square API');
    }
    console.log('✅ Connected successfully\n');
    
    // Get image files
    console.log(`📁 Reading images from directory: ${IMAGE_DIR}`);
    const imageDir = path.join(process.cwd(), IMAGE_DIR);
    
    if (!(await fs.pathExists(imageDir))) {
      throw new Error(`Directory not found: ${imageDir}`);
    }
    
    const files = await fs.readdir(imageDir);
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
    });
    
    console.log(`   📸 Found ${imageFiles.length} image files`);
    
    if (imageFiles.length === 0) {
      console.log('💡 No images to upload');
      return;
    }
    
    // Show target item
    console.log(`🎯 Target Item: ${TARGET_ITEM_ID}`);
    
    // Process first 10 images (to avoid overwhelming)
    const imagesToProcess = imageFiles.slice(0, 10);
    console.log(`   📊 Processing ${imagesToProcess.length} images\n`);
    
    const results = { success: 0, failed: 0, errors: [] };
    
    for (let i = 0; i < imagesToProcess.length; i++) {
      const filename = imagesToProcess[i];
      const imagePath = path.join(imageDir, filename);
      
      try {
        console.log(`[${i + 1}/${imagesToProcess.length}] Processing: ${filename}`);
        
        const imageBuffer = await fs.readFile(imagePath);
        const imageName = path.basename(filename, path.extname(filename));
        const contentType = agent.getImageContentType(imagePath);
        
        console.log(`   📏 Size: ${Math.round(imageBuffer.length / 1024)}KB`);
        console.log(`   📋 Type: ${contentType}`);
        
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
          objectId: TARGET_ITEM_ID,  // Direct attachment
          isPrimary: i === 0  // First image as primary
        };
        
        // Create Blob for file upload
        const imageFile = new Blob([imageBuffer], { type: contentType });
        Object.defineProperty(imageFile, 'name', {
          value: filename,
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
        
        results.success++;
        console.log(`   ✅ Uploaded: ${response.image.id} (${uploadTime}ms)`);
        console.log(`   🖼️ URL: ${response.image.imageData?.url}`);
        console.log(`   📎 Attached to: ${TARGET_ITEM_ID}${i === 0 ? ' (PRIMARY)' : ''}`);
        
      } catch (error) {
        results.failed++;
        results.errors.push({ 
          image: filename, 
          error: error.message 
        });
        console.log(`   ❌ Failed: ${error.message}`);
      }
      
      console.log(''); // Empty line for spacing
    }
    
    // Final summary
    console.log('📊 Upload Summary');
    console.log(`   ✅ Successful: ${results.success}`);
    console.log(`   ❌ Failed: ${results.failed}`);
    console.log(`   📈 Success Rate: ${((results.success / imagesToProcess.length) * 100).toFixed(1)}%`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Failed uploads:');
      results.errors.forEach(error => {
        console.log(`   - ${error.image}: ${error.error}`);
      });
    }
    
    console.log('\n🎉 Direct attachment process completed!');
    
  } catch (error) {
    console.error('\n💥 Process failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  uploadAndAttachImages().catch(console.error);
}

export { uploadAndAttachImages };
