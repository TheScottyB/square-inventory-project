import { SquareClient, SquareEnvironment } from 'square';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/index.js';

/**
 * SquareCatalogAgent - Manages Square Catalog items, images, and inventory
 * Uses the latest Square SDK v43.0.1 with API version 2025-07-16
 */
export class SquareCatalogAgent {
  constructor() {
    // Initialize Square client with latest SDK
    this.client = new SquareClient({
      environment: process.env.SQUARE_ENVIRONMENT === 'sandbox' 
        ? SquareEnvironment.Sandbox 
        : SquareEnvironment.Production,
      token: process.env.SQUARE_ACCESS_TOKEN,
      timeout: 10000, // 10 second timeout
    });

    this.catalogApi = this.client.catalog;
    this.imagesApi = this.client.catalog.images;
    this.locationsApi = this.client.locations;
    
    // Configuration
    this.enableDryRun = config.app.enableDryRun;
    this.maxRetries = 3;  
    this.retryDelayMs = 1000;
  }

  /**
   * Get all locations for the merchant
   * @returns {Promise<Array>} Array of location objects
   */
  async getLocations() {
    try {
      const { locations } = await this.locationsApi.list();
      console.log(`📍 Found ${locations?.length || 0} Square locations`);
      return locations || [];
    } catch (error) {
      console.error('❌ Failed to retrieve locations:', error.message);
      throw error;
    }
  }

  /**
   * Get the main location ID
   * @returns {Promise<string>} Main location ID
   */
  async getMainLocationId() {
    try {
      // Get all locations and return the first one
      const locations = await this.getLocations();
      if (locations.length === 0) {
        throw new Error('No locations found for this merchant');
      }
      return locations[0].id;
    } catch (error) {
      console.error('❌ Failed to retrieve main location:', error.message);
      throw error;
    }
  }

  /**
   * Upload an image to Square Catalog
   * @param {Buffer} imageBuffer - Image file buffer
   * @param {string} imageName - Name for the image
   * @param {string} caption - Optional caption
   * @returns {Promise<Object>} Uploaded image object
   */
  async uploadImage(imageBuffer, imageName, caption = '') {
    if (this.enableDryRun) {
      console.log(`[DRY RUN] Would upload image: ${imageName}`);
      return { id: `mock-image-${Date.now()}`, name: imageName };
    }

    try {
      const idempotencyKey = `img-${imageName.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`;
      
      // Upload the image using the createCatalogImage endpoint
      const { result } = await this.imagesApi.create({
        idempotency_key: idempotencyKey,
        image: {
          type: 'IMAGE',
          imageData: {
            name: imageName,
            caption: caption || `Product image for ${imageName}`,
          }
        }
      }, imageBuffer);

      console.log(`🖼️ Successfully uploaded image: ${imageName} (ID: ${result.image.id})`);
      return result.image;
      
    } catch (error) {
      console.error(`❌ Failed to upload image ${imageName}:`, error.message);
      if (error.result) {
        console.error('Error details:', JSON.stringify(error.result, null, 2));
      }
      throw error;
    }
  }

  /**
   * Create or update a catalog item
   * @param {Object} productData - Product analysis data
   * @param {string} imageId - ID of uploaded image
   * @param {string} locationId - Location ID for the item
   * @returns {Promise<Object>} Created/updated catalog item
   */
  async createCatalogItem(productData, imageId = null, locationId) {
    if (this.enableDryRun) {
      console.log(`[DRY RUN] Would create catalog item: ${productData.productName}`);
      return { id: `mock-item-${Date.now()}`, itemData: { name: productData.productName } };
    }

    try {
      const idempotencyKey = `item-${productData.productName.replace(/\s+/g, '-')}-${Date.now()}`;
      
      // Create basic item structure
      const catalogObject = {
        type: 'ITEM',
        id: `#${productData.productName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
        itemData: {
          name: productData.productName,
          description: productData.description,
          categoryId: await this.getOrCreateCategory(productData.category),
          labelColor: this.getCategoryColor(productData.category),
          availableOnline: true,
          availableForPickup: true,
          availableElectronically: false,
          variations: [
            {
              type: 'ITEM_VARIATION',
              id: `#${productData.productName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-regular`,
              itemVariationData: {
                itemId: `#${productData.productName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
                name: 'Regular',
                sku: this.generateSku(productData),
                trackInventory: true,
                inventoryAlertType: 'LOW_QUANTITY',
                inventoryAlertThreshold: BigInt(5), // Use BigInt for large numbers
                pricingType: 'FIXED_PRICING'
              }
            }
          ]
        }
      };

      // Add image if provided
      if (imageId) {
        catalogObject.itemData.imageIds = [imageId];
      }

      const { result } = await this.catalogApi.batchUpsert({
        idempotencyKey,
        batches: [{
          objects: [catalogObject]
        }]
      });

      console.log(`✅ Created catalog item: ${productData.productName} (ID: ${result.objects[0].id})`);
      return result.objects[0];
      
    } catch (error) {
      console.error(`❌ Failed to create catalog item ${productData.productName}:`, error.message);
      throw error;
    }
  }

  /**
   * Get or create a category
   * @param {string} categoryName - Category name
   * @returns {Promise<string>} Category ID
   */
  async getOrCreateCategory(categoryName) {
    try {
      // Search for existing category
      const { result } = await this.catalogApi.search({
        objectTypes: ['CATEGORY'],
        query: {
          textQuery: {
            keywords: [categoryName]
          }
        }
      });

      if (result.objects && result.objects.length > 0) {
        const existingCategory = result.objects.find(obj => 
          obj.categoryData?.name?.toLowerCase() === categoryName.toLowerCase()
        );
        if (existingCategory) {
          return existingCategory.id;
        }
      }

      // Create new category
      const idempotencyKey = `cat-${categoryName.replace(/\s+/g, '-')}-${Date.now()}`;
      const { result: createResult } = await this.catalogApi.batchUpsert({
        idempotencyKey,
        batches: [{
          objects: [{
            type: 'CATEGORY',
            id: `#${categoryName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
            categoryData: {
              name: categoryName
            }
          }]
        }]
      });

      console.log(`🏷️ Created new category: ${categoryName} (ID: ${createResult.objects[0].id})`);
      return createResult.objects[0].id;
      
    } catch (error) {
      console.warn(`⚠ Failed to get/create category ${categoryName}, using default:`, error.message);
      return null;
    }
  }

  /**
   * Generate SKU for product
   * @param {Object} productData - Product data
   * @returns {string} Generated SKU
   */
  generateSku(productData) {
    const categoryPrefix = productData.category
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 3)
      .toUpperCase();
    
    const namePrefix = productData.productName
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 6)
      .toUpperCase();
    
    const timestamp = Date.now().toString().slice(-4);
    
    return `${categoryPrefix}-${namePrefix}-${timestamp}`;
  }

  /**
   * Get category color based on category name
   * @param {string} category - Category name
   * @returns {string} Color code
   */
  getCategoryColor(category) {
    const colorMap = {
      'jewelry': '9da2a6',
      'candle holders': 'f06292', 
      'first aid': 'ef5350',
      'pet products': '42a5f5',
      'shoes': '66bb6a',
      'holographic purses': 'ab47bc',
      'miscellaneous': '78909c'
    };
    
    return colorMap[category.toLowerCase()] || '78909c';
  }

  /**
   * Process multiple products for Square integration
   * @param {Array} analysisResults - Array of product analysis results
   * @returns {Promise<Object>} Integration results
   */
  async processProducts(analysisResults) {
    const results = [];
    const errors = [];
    
    console.log(`🔄 Processing ${analysisResults.length} products for Square integration...`);
    
    // Get main location
    const locationId = await this.getMainLocationId();
    
    for (const product of analysisResults) {
      try {
        console.log(`\n📦 Processing: ${product.productName}`);
        
        // Upload image if available
        let imageId = null;
        if (product.metadata?.imagePath) {
          const imagePath = path.resolve(product.metadata.imagePath);
          if (await fs.pathExists(imagePath)) {
            const imageBuffer = await fs.readFile(imagePath);
            const imageObj = await this.uploadImage(
              imageBuffer, 
              product.productName,
              product.description?.substring(0, 100)
            );
            imageId = imageObj.id;
          }
        }
        
        // Create catalog item
        const catalogItem = await this.createCatalogItem(product, imageId, locationId);
        
        results.push({
          productName: product.productName,
          catalogId: catalogItem.id,
          imageId,
          success: true
        });
        
      } catch (error) {
        console.error(`❌ Failed to process ${product.productName}:`, error.message);
        errors.push({
          productName: product.productName,
          error: error.message,
          success: false
        });
      }
    }
    
    console.log(`\n📊 Integration Summary:`);
    console.log(`  ✅ Successful: ${results.length}`);
    console.log(`  ❌ Errors: ${errors.length}`);
    
    return { results, errors, locationId };
  }

  /**
   * Test Square connection and permissions
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      console.log('🔍 Testing Square API connection...');
      
      const locations = await this.getLocations();
      console.log(`✅ Connection successful. Found ${locations.length} locations.`);
      
      // Test catalog access
      const { objects } = await this.catalogApi.list({
        types: 'ITEM',
        limit: 1
      });
      
      console.log('✅ Catalog API access confirmed. Found:', objects?.length || 0);
      return true;
      
    } catch (error) {
      console.error('❌ Square API connection failed:', error.message);
      return false;
    }
  }
}

export default SquareCatalogAgent;
