# SquareCatalogAgent Usage Examples

This document provides practical examples of using the SquareCatalogAgent for common Square catalog management tasks.

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Image Upload Examples](#image-upload-examples)
3. [Catalog Item Management](#catalog-item-management)
4. [Batch Processing](#batch-processing)
5. [Advanced Workflows](#advanced-workflows)
6. [Error Handling Patterns](#error-handling-patterns)

## Basic Setup

### Environment Configuration

Create a `.env` file with your Square credentials:

```bash
# Square API Configuration
SQUARE_ACCESS_TOKEN=your_production_or_sandbox_token
SQUARE_APPLICATION_ID=your_application_id
SQUARE_ENVIRONMENT=production  # or 'sandbox'

# Optional: Enable dry-run mode for testing
ENABLE_DRY_RUN=false
```

### Basic Initialization

```javascript
import { SquareCatalogAgent } from './src/agents/SquareCatalogAgent.js';
import fs from 'fs-extra';
import path from 'path';

// Initialize the agent
const agent = new SquareCatalogAgent();

// Always test connection first
if (!(await agent.testConnection())) {
  throw new Error('Failed to connect to Square API');
}

console.log('Square API connection established!');
```

## Image Upload Examples

### Single Image Upload

```javascript
async function uploadSingleImage() {
  try {
    // Read image file
    const imagePath = './jewelry/amethyst-bracelet-001.jpg';
    const imageBuffer = await fs.readFile(imagePath);
    
    // Upload to Square
    const uploadedImage = await agent.uploadImage(
      imageBuffer,
      'Amethyst Bracelet - Premium Grade',
      'Beautiful sterling silver bracelet with genuine amethyst stones'
    );
    
    console.log(`✅ Image uploaded successfully!`);
    console.log(`   ID: ${uploadedImage.id}`);
    console.log(`   Name: ${uploadedImage.imageData.name}`);
    
    return uploadedImage;
    
  } catch (error) {
    console.error('❌ Image upload failed:', error.message);
    throw error;
  }
}
```

### Multiple Images with Validation

```javascript
async function uploadMultipleImages(imagePaths) {
  const uploadedImages = [];
  const errors = [];
  
  for (const imagePath of imagePaths) {
    try {
      // Validate file exists and size
      if (!(await fs.pathExists(imagePath))) {
        throw new Error(`File not found: ${imagePath}`);
      }
      
      const stats = await fs.stat(imagePath);
      if (stats.size > 5 * 1024 * 1024) { // 5MB limit
        console.warn(`⚠️ Large file detected: ${path.basename(imagePath)} (${Math.round(stats.size / 1024 / 1024)}MB)`);
      }
      
      // Upload image
      const imageBuffer = await fs.readFile(imagePath);
      const fileName = path.basename(imagePath, path.extname(imagePath));
      
      const uploadedImage = await agent.uploadImage(
        imageBuffer,
        fileName.replace(/[-_]/g, ' '),
        `Product image for ${fileName}`
      );
      
      uploadedImages.push({
        originalPath: imagePath,
        squareId: uploadedImage.id,
        name: uploadedImage.imageData.name
      });
      
      console.log(`✅ Uploaded: ${fileName}`);
      
    } catch (error) {
      console.error(`❌ Failed to upload ${imagePath}:`, error.message);
      errors.push({ imagePath, error: error.message });
    }
  }
  
  return { uploadedImages, errors };
}

// Usage
const imagePaths = [
  './jewelry/amethyst-bracelet-001.jpg',
  './jewelry/silver-ring-002.jpg',
  './candles-holders/abundance-candle-001.jpg'
];

const { uploadedImages, errors } = await uploadMultipleImages(imagePaths);
console.log(`Uploaded ${uploadedImages.length} images, ${errors.length} errors`);
```

## Catalog Item Management

### Create Simple Item

```javascript
async function createSimpleItem() {
  // First upload an image
  const imageBuffer = await fs.readFile('./jewelry/amethyst-bracelet-001.jpg');
  const uploadedImage = await agent.uploadImage(
    imageBuffer,
    'Amethyst Bracelet Premium'
  );
  
  // Create product data
  const productData = {
    productName: 'Sterling Silver Amethyst Bracelet',
    description: 'Handcrafted sterling silver bracelet featuring genuine amethyst stones. Perfect for daily wear or special occasions.',
    category: 'jewelry'
  };
  
  // Get location
  const locationId = await agent.getMainLocationId();
  
  // Create catalog item
  const catalogItem = await agent.createCatalogItem(
    productData,
    uploadedImage.id,
    locationId
  );
  
  console.log(`✅ Created catalog item: ${catalogItem.id}`);
  console.log(`   SKU: ${catalogItem.itemData.variations[0].itemVariationData.sku}`);
  
  return catalogItem;
}
```

### Create Item with Custom Category

```javascript
async function createItemWithCustomCategory() {
  const productData = {
    productName: 'Emergency First Aid Kit - Professional',
    description: 'Comprehensive first aid kit with medical supplies for professional use. Includes bandages, antiseptics, and emergency tools.',
    category: 'Medical Supplies'
  };
  
  // The agent will automatically create the category if it doesn't exist
  const locationId = await agent.getMainLocationId();
  const catalogItem = await agent.createCatalogItem(productData, null, locationId);
  
  console.log(`✅ Item created with new category`);
  return catalogItem;
}
```

### Bulk Category Creation

```javascript
async function setupProductCategories() {
  const categories = [
    'Fine Jewelry',
    'Candles & Aromatherapy', 
    'Pet Accessories',
    'Medical & First Aid',
    'Footwear',
    'Fashion Accessories'
  ];
  
  const categoryIds = {};
  
  for (const categoryName of categories) {
    try {
      const categoryId = await agent.getOrCreateCategory(categoryName);
      categoryIds[categoryName] = categoryId;
      console.log(`✅ Category ready: ${categoryName} (${categoryId})`);
    } catch (error) {
      console.error(`❌ Failed to create category ${categoryName}:`, error.message);
    }
  }
  
  return categoryIds;
}
```

## Batch Processing

### Process Product Directory

```javascript
async function processProductDirectory(directoryPath, category) {
  try {
    // Get all image files in directory
    const files = await fs.readdir(directoryPath);
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|gif)$/i.test(file)
    );
    
    console.log(`📁 Processing ${imageFiles.length} images in ${directoryPath}`);
    
    const products = [];
    
    // Create product data for each image
    for (const imageFile of imageFiles) {
      const fileName = path.basename(imageFile, path.extname(imageFile));
      const productName = fileName
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase()); // Title case
      
      products.push({
        productName,
        description: `${productName} - High-quality product from our ${category} collection`,
        category,
        metadata: {
          imagePath: path.join(directoryPath, imageFile)
        }
      });
    }
    
    // Process all products
    const results = await agent.processProducts(products);
    
    console.log(`📊 Processing complete:`);
    console.log(`   ✅ Successful: ${results.results.length}`);
    console.log(`   ❌ Errors: ${results.errors.length}`);
    
    // Save results for review
    const resultsFile = `./results-${category}-${Date.now()}.json`;
    await fs.writeJSON(resultsFile, results, { spaces: 2 });
    console.log(`💾 Results saved to: ${resultsFile}`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Directory processing failed:', error.message);
    throw error;
  }
}

// Usage examples
await processProductDirectory('./jewelry', 'jewelry');
await processProductDirectory('./candles-holders', 'candle holders');
await processProductDirectory('./first-aid-kits', 'first aid');
```

### Smart Batch Processing with Rate Limiting

```javascript
async function smartBatchProcess(products, batchSize = 5) {
  const results = [];
  const errors = [];
  
  console.log(`🔄 Processing ${products.length} products in batches of ${batchSize}`);
  
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(products.length / batchSize);
    
    console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`);
    
    try {
      const batchResults = await agent.processProducts(batch);
      results.push(...batchResults.results);
      errors.push(...batchResults.errors);
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < products.length) {
        console.log('⏱️ Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`❌ Batch ${batchNumber} failed:`, error.message);
      errors.push({
        batch: batchNumber,
        error: error.message,
        products: batch.map(p => p.productName)
      });
    }
  }
  
  return { results, errors };
}
```

## Advanced Workflows

### Complete Product Onboarding Workflow

```javascript
async function completeProductOnboarding(productInfo) {
  const {
    imagePath,
    productName,
    description,
    category,
    price,
    inventory
  } = productInfo;
  
  try {
    console.log(`🚀 Starting onboarding for: ${productName}`);
    
    // Step 1: Validate image
    if (!(await fs.pathExists(imagePath))) {
      throw new Error(`Image not found: ${imagePath}`);
    }
    
    // Step 2: Upload image
    console.log('📤 Uploading image...');
    const imageBuffer = await fs.readFile(imagePath);
    const uploadedImage = await agent.uploadImage(
      imageBuffer,
      productName,
      description.substring(0, 100)
    );
    
    // Step 3: Create catalog item
    console.log('📦 Creating catalog item...');
    const productData = { productName, description, category };
    const locationId = await agent.getMainLocationId();
    const catalogItem = await agent.createCatalogItem(
      productData,
      uploadedImage.id,
      locationId
    );
    
    // Step 4: Generate summary
    const summary = {
      success: true,
      productName,
      catalogItemId: catalogItem.id,
      imageId: uploadedImage.id,
      sku: catalogItem.itemData.variations[0].itemVariationData.sku,
      category: catalogItem.itemData.categoryId,
      createdAt: new Date().toISOString()
    };
    
    console.log(`✅ Successfully onboarded: ${productName}`);
    console.log(`   Catalog ID: ${summary.catalogItemId}`);
    console.log(`   SKU: ${summary.sku}`);
    
    return summary;
    
  } catch (error) {
    console.error(`❌ Onboarding failed for ${productName}:`, error.message);
    return {
      success: false,
      productName,
      error: error.message,
      failedAt: new Date().toISOString()
    };
  }
}

// Usage
const productInfo = {
  imagePath: './jewelry/amethyst-bracelet-premium.jpg',
  productName: 'Premium Amethyst Bracelet',
  description: 'Exquisite sterling silver bracelet featuring hand-selected amethyst stones',
  category: 'Fine Jewelry',
  price: 89.99,
  inventory: 5
};

const result = await completeProductOnboarding(productInfo);
```

### Inventory Sync Workflow

```javascript
async function syncInventoryWithSquare(localInventory) {
  console.log(`🔄 Syncing ${localInventory.length} products with Square...`);
  
  const syncResults = {
    created: [],
    updated: [],
    errors: []
  };
  
  for (const item of localInventory) {
    try {
      // Check if item exists in Square (by SKU or name)
      // This is a simplified example - in practice you'd use search API
      
      const productData = {
        productName: item.name,
        description: item.description,
        category: item.category
      };
      
      let imageId = null;
      if (item.imagePath && await fs.pathExists(item.imagePath)) {
        const imageBuffer = await fs.readFile(item.imagePath);
        const uploadedImage = await agent.uploadImage(
          imageBuffer,
          item.name
        );
        imageId = uploadedImage.id;
      }
      
      const locationId = await agent.getMainLocationId();
      const catalogItem = await agent.createCatalogItem(
        productData,
        imageId,
        locationId
      );
      
      syncResults.created.push({
        localId: item.id,
        squareId: catalogItem.id,
        name: item.name
      });
      
    } catch (error) {
      syncResults.errors.push({
        localId: item.id,
        name: item.name,
        error: error.message
      });
    }
  }
  
  console.log(`📊 Sync completed:`);
  console.log(`   ✅ Created: ${syncResults.created.length}`);
  console.log(`   ❌ Errors: ${syncResults.errors.length}`);
  
  return syncResults;
}
```

## Error Handling Patterns

### Robust Error Handling with Retry

```javascript
async function robustImageUpload(imagePath, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const imageBuffer = await fs.readFile(imagePath);
      const fileName = path.basename(imagePath, path.extname(imagePath));
      
      const uploadedImage = await agent.uploadImage(
        imageBuffer,
        fileName.replace(/[-_]/g, ' ')
      );
      
      console.log(`✅ Upload successful on attempt ${attempt}`);
      return uploadedImage;
      
    } catch (error) {
      console.warn(`⚠️ Upload attempt ${attempt} failed: ${error.message}`);
      
      if (attempt === maxRetries) {
        console.error(`❌ Upload failed after ${maxRetries} attempts`);
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`⏱️ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}
```

### Graceful Degradation Pattern

```javascript
async function createItemWithFallbacks(productData, imagePath) {
  let imageId = null;
  let catalogItem = null;
  
  // Try to upload image, but continue even if it fails
  try {
    if (imagePath && await fs.pathExists(imagePath)) {
      const imageBuffer = await fs.readFile(imagePath);
      const uploadedImage = await agent.uploadImage(
        imageBuffer,
        productData.productName
      );
      imageId = uploadedImage.id;
      console.log('✅ Image uploaded successfully');
    }
  } catch (error) {
    console.warn('⚠️ Image upload failed, proceeding without image:', error.message);
  }
  
  // Create catalog item (this is critical, so we don't catch errors)
  try {
    const locationId = await agent.getMainLocationId();
    catalogItem = await agent.createCatalogItem(
      productData,
      imageId, // Will be null if image upload failed
      locationId
    );
    console.log('✅ Catalog item created successfully');
  } catch (error) {
    console.error('❌ Critical error: Failed to create catalog item');
    throw error;
  }
  
  return {
    catalogItem,
    hasImage: imageId !== null,
    imageId
  };
}
```

### Validation Pattern

```javascript
async function validateAndProcess(productData, imagePath) {
  const errors = [];
  
  // Validate product data
  if (!productData.productName || productData.productName.trim().length === 0) {
    errors.push('Product name is required');
  }
  
  if (!productData.description || productData.description.trim().length < 10) {
    errors.push('Description must be at least 10 characters');
  }
  
  if (!productData.category) {
    errors.push('Category is required');
  }
  
  // Validate image
  if (imagePath) {
    if (!(await fs.pathExists(imagePath))) {
      errors.push(`Image file not found: ${imagePath}`);
    } else {
      const stats = await fs.stat(imagePath);
      if (stats.size > 10 * 1024 * 1024) { // 10MB
        errors.push('Image file too large (max 10MB)');
      }
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Validation failed:\\n- ${errors.join('\\n- ')}`);
  }
  
  // Proceed with processing
  return await createItemWithFallbacks(productData, imagePath);
}
```

These examples demonstrate various patterns and use cases for the SquareCatalogAgent. Choose the approaches that best fit your specific workflow and requirements.
