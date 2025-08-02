#!/usr/bin/env node

import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import fs from 'fs-extra';
import path from 'path';

// Test the real image upload functionality
async function testRealImageUpload() {
  console.log('🧪 Testing Real Square Image Upload');
  console.log('====================================\n');

  try {
    // Initialize the agent
    const agent = new SquareCatalogAgent();
    
    // Test connection first
    console.log('🔗 Testing Square API connection...');
    const isConnected = await agent.testConnection();
    
    if (!isConnected) {
      throw new Error('Failed to connect to Square API');
    }
    
    console.log('✅ Square API connection successful\n');
    
    // Find a test image
    const testImagePaths = [
      './first-aid-kits/ambulance-family-first-aid-kit-cute-medicine-lock-storage-box-organizer-403303.jpg',
      './first-aid-kits/ambulance-family-first-aid-kit-cute-medicine-lock-storage-box-organizer-818791.jpg',
      './first-aid-kits/portableambulancemedicinestorageboxorganizerfirstaidkit7.jpg'
    ];
    
    let testImagePath = null;
    for (const imagePath of testImagePaths) {
      if (await fs.pathExists(imagePath)) {
        testImagePath = imagePath;
        break;
      }
    }
    
    if (!testImagePath) {
      throw new Error('No test images found. Please ensure you have images in the jewelry or candles-holders directories.');
    }
    
    console.log(`📸 Using test image: ${testImagePath}`);
    
    // Read the image file
    const imageBuffer = await fs.readFile(testImagePath);
    const imageName = path.basename(testImagePath, path.extname(testImagePath));
    const imageSize = imageBuffer.length;
    
    console.log(`   Size: ${Math.round(imageSize / 1024)}KB`);
    console.log(`   Name: ${imageName}\n`);
    
    // Test the upload
    console.log('🚀 Attempting real image upload...');
    const startTime = Date.now();
    
    const uploadedImage = await agent.uploadImage(
      imageBuffer,
      `Test Upload - ${imageName}`,
      `Test image upload of ${imageName} at ${new Date().toISOString()}`
    );
    
    const uploadTime = Date.now() - startTime;
    
    console.log('✅ Image upload successful!');
    console.log(`   Upload time: ${uploadTime}ms`);
    console.log(`   Image ID: ${uploadedImage.id}`);
    console.log(`   Image type: ${uploadedImage.type}`);
    console.log(`   Image name: ${uploadedImage.imageData?.name || 'N/A'}`);
    console.log(`   Image URL: ${uploadedImage.imageData?.url || 'N/A'}`);
    console.log(`   Version: ${uploadedImage.version || 'N/A'}`);
    
    return {
      success: true,
      imageId: uploadedImage.id,
      uploadTime,
      imageSize,
      imageName
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.result?.errors) {
      console.error('\nSquare API Errors:');
      error.result.errors.forEach((err, index) => {
        console.error(`  ${index + 1}. ${err.code}: ${err.detail}`);
        if (err.field) {
          console.error(`     Field: ${err.field}`);
        }
      });
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
(async () => {
  console.log('⚠️  Note: This test will attempt to upload a real image to Square.');
  console.log('   Make sure you have SQUARE_ACCESS_TOKEN set and ENABLE_DRY_RUN=false\n');
  
  const result = await testRealImageUpload();
  
  if (result.success) {
    console.log('\n🎉 Real image upload test completed successfully!');
    console.log(`   📊 Performance: ${Math.round(result.imageSize / 1024)}KB uploaded in ${result.uploadTime}ms`);
    console.log(`   🆔 Image ID: ${result.imageId}`);
  } else {
    console.log('\n💥 Real image upload test failed');
    process.exit(1);
  }
})();
