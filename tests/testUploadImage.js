import { strict as assert } from 'assert';
import fs from 'fs-extra';
import path from 'path';
import SquareCatalogAgent from '../src/agents/SquareCatalogAgent.js';

// Test function for uploading image
async function testUploadImage() {
  console.log('🧪 Starting image upload test...');
  
  try {
    // Initialize agent
    const agent = new SquareCatalogAgent();
    
    // Test connection first
    console.log('📡 Testing Square API connection...');
    const connectionOk = await agent.testConnection();
    if (!connectionOk) {
      throw new Error('Square API connection failed');
    }
    console.log('✅ Square API connection successful');
    
    // Prepare test image
    const imagePath = path.resolve('test/resources/test-image.jpg');
    console.log(`📁 Reading test image from: ${imagePath}`);
    
    if (!await fs.pathExists(imagePath)) {
      throw new Error(`Test image not found at: ${imagePath}`);
    }
    
    const imageBuffer = await fs.readFile(imagePath);
    console.log(`📊 Image size: ${imageBuffer.length} bytes`);
    
    // Upload image
    console.log('🖼️ Uploading image to Square...');
    const result = await agent.uploadImage(
      imageBuffer, 
      'test-amethyst-lamp', 
      'Test upload of amethyst lamp image', 
      null, // No objectId attachment
      false // Not primary
    );
    
    // Validate result
    assert(result !== null, 'Image upload result should not be null');
    assert(result.id, 'Result should contain an image id');
    assert(result.imageData, 'Result should contain imageData');
    assert(result.imageData.name === 'test-amethyst-lamp', 'Image name should match');
    assert(result.imageData.caption, 'Result should contain image caption');
    
    console.log('✅ Image uploaded successfully!');
    console.log('📋 Upload details:', {
      imageId: result.id,
      name: result.imageData?.name,
      caption: result.imageData?.caption,
      version: result.version
    });
    
    return result;
    
  } catch (error) {
    console.error('❌ Image upload test failed:', error.message);
    if (error.result?.errors) {
      console.error('📋 Square API errors:', error.result.errors);
    }
    throw error;
  }
}

// Execute the test
(async () => {
  await testUploadImage();
})().catch(err => {
  console.error('❌ Test script execution failed:', err);
  process.exit(1);
});

