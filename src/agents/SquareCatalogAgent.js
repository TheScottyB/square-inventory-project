import { SquareClient, SquareEnvironment, SquareError } from 'square';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
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
    
    // Version management for optimistic concurrency
    this.lastKnownCatalogVersion = null;
    this.versionCache = new Map(); // Cache object versions for conflict resolution
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
      const idempotencyKey = crypto.randomUUID();
      
      // Upload the image using the correct Square SDK pattern
      const { result } = await this.client.catalog.images.create({
        idempotencyKey,
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
      this.handleSquareError(error, `Failed to upload image ${imageName}`);
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
  async createCatalogItem(productData, imageId = null, locationId, price = 0) {
    if (this.enableDryRun) {
      console.log(`[DRY RUN] Would create catalog item: ${productData.productName}`);
      return { id: `mock-item-${Date.now()}`, itemData: { name: productData.productName } };
    }

    try {
      const idempotencyKey = crypto.randomUUID();
      const itemId = `#${productData.productName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
      
      // Create basic item structure with required price
      const catalogObject = {
        type: 'ITEM',
        id: itemId,
        presentAtAllLocations: true,
        itemData: {
          name: productData.productName,
          description: productData.description,
          productType: 'REGULAR',
          variations: [
            {
              type: 'ITEM_VARIATION',
              id: `${itemId}-regular`,
              presentAtAllLocations: true,
              itemVariationData: {
                itemId: itemId,
                name: 'Regular',
                sku: this.generateSku(productData),
                trackInventory: true,
                inventoryAlertType: 'LOW_QUANTITY',
                inventoryAlertThreshold: BigInt(5),
                pricingType: 'FIXED_PRICING',
                priceMoney: {
                  amount: BigInt(price || 0), // Default to $0.00 if no price provided
                  currency: 'USD'
                }
              }
            }
          ]
        }
      };

      // Add category if available
      const categoryId = await this.getOrCreateCategory(productData.category);
      if (categoryId) {
        catalogObject.itemData.categories = [{ id: categoryId }];
      }

      // Add image if provided
      if (imageId) {
        catalogObject.itemData.imageIds = [imageId];
      }

      const response = await this.catalogApi.batchUpsert({
        idempotencyKey,
        batches: [{
          objects: [catalogObject]
        }]
      });

      const result = response.result || response;
      const objects = result.objects || [];
      
      if (objects.length === 0) {
        throw new Error('No objects returned from batch upsert');
      }

      console.log(`✅ Created catalog item: ${productData.productName} (ID: ${objects[0].id})`);
      return objects[0];
      
    } catch (error) {
      this.handleSquareError(error, `Failed to create catalog item ${productData.productName}`);
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
      const response = await this.catalogApi.search({
        objectTypes: ['CATEGORY'],
        query: {
          textQuery: {
            keywords: [categoryName]
          }
        }
      });

      const result = response.result || response;
      const objects = result.objects || [];

      if (objects.length > 0) {
        const existingCategory = objects.find(obj => 
          obj.categoryData?.name?.toLowerCase() === categoryName.toLowerCase()
        );
        if (existingCategory) {
          console.log(`🏷️ Found existing category: ${categoryName} (ID: ${existingCategory.id})`);
          return existingCategory.id;
        }
      }

      // Create new category
      const idempotencyKey = crypto.randomUUID();
      const createResponse = await this.catalogApi.batchUpsert({
        idempotencyKey,
        batches: [{
          objects: [{
            type: 'CATEGORY',
            id: `#${categoryName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
            presentAtAllLocations: true,
            categoryData: {
              name: categoryName
            }
          }]
        }]
      });

      const createResult = createResponse.result || createResponse;
      const createdObjects = createResult.objects || [];
      
      if (createdObjects.length === 0) {
        throw new Error('No category objects returned from batch upsert');
      }

      console.log(`🏷️ Created new category: ${categoryName} (ID: ${createdObjects[0].id})`);
      return createdObjects[0].id;
      
    } catch (error) {
      this.handleSquareError(error, `Failed to get/create category ${categoryName}`);
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
   * Handle Square API errors with structured information
   * @param {Error} error - The error object
   * @param {string} context - Context description
   */
  handleSquareError(error, context) {
    console.error(`❌ ${context}:`, error.message);
    
    if (error instanceof SquareError) {
      console.error('Square Error Details:');
      if (error.result) {
        console.error('  Category:', error.result.errors?.[0]?.category);
        console.error('  Code:', error.result.errors?.[0]?.code);
        console.error('  Detail:', error.result.errors?.[0]?.detail);
        console.error('  Field:', error.result.errors?.[0]?.field);
      }
    } else if (error.result) {
      console.error('Error details:', JSON.stringify(error.result, null, 2));
    }
  }

  /**
   * Get catalog information including batch limits
   * @returns {Promise<Object>} Catalog info with limits
   */
  async getCatalogInfo() {
    try {
      const response = await this.catalogApi.info();
      const result = response.result || response;
      
      // Provide default limits if not available
      const limits = result.limits || {
        batchUpsertMaxObjectsPerBatch: 1000,
        batchUpsertMaxTotalObjects: 10000,
        batchRetrieveMaxObjectIds: 1000,
        searchMaxPageLimit: 1000,
        batchDeleteMaxObjectIds: 200
      };
      
      console.log('📊 Catalog API Limits:');
      console.log(`  Max objects per batch: ${limits.batchUpsertMaxObjectsPerBatch}`);
      console.log(`  Max total objects: ${limits.batchUpsertMaxTotalObjects}`);
      
      return { ...result, limits };
    } catch (error) {
      console.warn('⚠️ Could not retrieve catalog info, using default limits');
      // Return default limits if API call fails
      return {
        limits: {
          batchUpsertMaxObjectsPerBatch: 1000,
          batchUpsertMaxTotalObjects: 10000,
          batchRetrieveMaxObjectIds: 1000,
          searchMaxPageLimit: 1000,
          batchDeleteMaxObjectIds: 200
        }
      };
    }
  }

  /**
   * List catalog objects with async iteration support
   * @param {Object} options - List options
   * @returns {AsyncIterable} Async iterable of catalog objects
   */
  async *listCatalogObjects(options = {}) {
    try {
      const response = await this.catalogApi.list({
        types: options.types || 'ITEM,ITEM_VARIATION,CATEGORY',
        catalogVersion: options.catalogVersion,
        ...options
      });
      
      // Use async iteration pattern as recommended
      for await (const obj of response) {
        yield obj;
      }
    } catch (error) {
      this.handleSquareError(error, 'Failed to list catalog objects');
      throw error;
    }
  }

  /**
   * Enhanced batch upsert with proper limits checking
   * @param {Array} objects - Array of catalog objects
   * @param {Object} options - Batch options
   * @returns {Promise<Object>} Batch upsert results
   */
  async batchUpsertCatalogObjects(objects, options = {}) {
    try {
      // Get current limits
      const catalogInfo = await this.getCatalogInfo();
      const maxObjectsPerBatch = catalogInfo.limits?.batchUpsertMaxObjectsPerBatch || 1000;
      const maxTotalObjects = catalogInfo.limits?.batchUpsertMaxTotalObjects || 10000;
      
      if (objects.length > maxTotalObjects) {
        throw new Error(`Too many objects (${objects.length}). Maximum allowed is ${maxTotalObjects}`);
      }
      
      // Split into batches if necessary
      const batches = [];
      for (let i = 0; i < objects.length; i += maxObjectsPerBatch) {
        batches.push({
          objects: objects.slice(i, i + maxObjectsPerBatch)
        });
      }
      
      const idempotencyKey = crypto.randomUUID();
      
      const { result } = await this.catalogApi.batchUpsert({
        idempotencyKey,
        batches,
        ...options
      });
      
      console.log(`✅ Batch upsert completed: ${result.objects?.length || 0} objects processed`);
      return result;
      
    } catch (error) {
      this.handleSquareError(error, 'Batch upsert failed');
      throw error;
    }
  }

  /**
   * Enhanced search with proper pagination
   * @param {Object} searchQuery - Search parameters
   * @returns {Promise<Array>} Search results
   */
  async searchCatalogObjects(searchQuery) {
    try {
      const allResults = [];
      let cursor = null;
      
      do {
        const { result } = await this.catalogApi.search({
          ...searchQuery,
          cursor,
          limit: Math.min(searchQuery.limit || 1000, 1000) // Respect API limits
        });
        
        if (result.objects) {
          allResults.push(...result.objects);
        }
        
        cursor = result.cursor;
      } while (cursor && allResults.length < (searchQuery.maxResults || 10000));
      
      return allResults;
    } catch (error) {
      this.handleSquareError(error, 'Search failed');
      throw error;
    }
  }

  /**
   * Get current catalog version for optimistic concurrency
   * @returns {Promise<number>} Current catalog version
   */
  async getCurrentCatalogVersion() {
    try {
      const response = await this.catalogApi.list({
        types: 'ITEM',
        limit: 1
      });
      
      const result = response.result || response;
      const catalogVersion = result.catalogVersion || 0;
      
      if (catalogVersion > 0) {
        this.lastKnownCatalogVersion = catalogVersion;
        console.log(`📊 Current catalog version: ${catalogVersion}`);
      }
      
      return catalogVersion;
    } catch (error) {
      this.handleSquareError(error, 'Failed to get catalog version');
      return 0;
    }
  }

  /**
   * Retrieve catalog objects with version tracking
   * @param {Array} objectIds - Array of object IDs to retrieve
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} Retrieved objects with versions cached
   */
  async retrieveCatalogObjectsWithVersions(objectIds, options = {}) {
    try {
      const { result } = await this.catalogApi.batchGet({
        objectIds,
        includeRelatedObjects: options.includeRelatedObjects || false,
        includeCategoryPathToRoot: options.includeCategoryPathToRoot || false
      });
      
      const objects = result.objects || [];
      
      // Cache versions for optimistic concurrency
      objects.forEach(obj => {
        if (obj.version) {
          this.versionCache.set(obj.id, obj.version);
        }
      });
      
      console.log(`📋 Retrieved ${objects.length} objects with versions cached`);
      return objects;
      
    } catch (error) {
      this.handleSquareError(error, 'Failed to retrieve catalog objects');
      throw error;
    }
  }

  /**
   * Enhanced batch upsert with version conflict handling
   * @param {Array} objects - Array of catalog objects
   * @param {Object} options - Batch options
   * @returns {Promise<Object>} Batch upsert results with version updates
   */
  async batchUpsertWithVersions(objects, options = {}) {
    try {
      // Add versions to objects if available
      const objectsWithVersions = objects.map(obj => {
        const cachedVersion = this.versionCache.get(obj.id);
        if (cachedVersion && !obj.version) {
          return { ...obj, version: cachedVersion };
        }
        return obj;
      });
      
      const result = await this.batchUpsertCatalogObjects(objectsWithVersions, options);
      
      // Update version cache with new versions
      if (result.objects) {
        result.objects.forEach(obj => {
          if (obj.version) {
            this.versionCache.set(obj.id, obj.version);
          }
        });
      }
      
      // Update catalog version
      if (result.catalogVersion) {
        this.lastKnownCatalogVersion = result.catalogVersion;
      }
      
      return result;
      
    } catch (error) {
      // Handle version conflicts (409 errors)
      if (error.result?.errors?.[0]?.code === 'CONFLICT') {
        console.warn('⚠️ Version conflict detected. Refetching objects and retrying...');
        
        // Clear version cache for conflicted objects
        const conflictedIds = objects.map(obj => obj.id).filter(id => id);
        conflictedIds.forEach(id => this.versionCache.delete(id));
        
        // Refetch with latest versions (if this is not already a retry)
        if (!options._isRetry) {
          const freshObjects = await this.retrieveCatalogObjectsWithVersions(conflictedIds);
          const updatedObjects = objects.map(obj => {
            const freshObj = freshObjects.find(fresh => fresh.id === obj.id);
            return freshObj ? { ...obj, version: freshObj.version } : obj;
          });
          
          return await this.batchUpsertWithVersions(updatedObjects, { ...options, _isRetry: true });
        }
      }
      
      this.handleSquareError(error, 'Batch upsert with versions failed');
      throw error;
    }
  }

  /**
   * List catalog objects for a specific version (historical snapshot)
   * @param {number} catalogVersion - Specific catalog version to retrieve
   * @param {Object} options - List options
   * @returns {Promise<Array>} Objects from the specified version
   */
  async listCatalogObjectsAtVersion(catalogVersion, options = {}) {
    try {
      const allObjects = [];
      let cursor = null;
      
      do {
        const response = await this.catalogApi.list({
          types: options.types || 'ITEM,ITEM_VARIATION,CATEGORY',
          catalogVersion: catalogVersion,
          cursor,
          limit: options.limit || 1000
        });
        
        const result = response.result || response;
        
        if (result.objects) {
          allObjects.push(...result.objects);
        }
        
        cursor = result.cursor;
      } while (cursor && allObjects.length < (options.maxResults || 10000));
      
      console.log(`📜 Retrieved ${allObjects.length} objects from catalog version ${catalogVersion}`);
      return allObjects;
      
    } catch (error) {
      this.handleSquareError(error, `Failed to list catalog objects at version ${catalogVersion}`);
      throw error;
    }
  }

  /**
   * Compare catalog versions and detect changes
   * @param {number} fromVersion - Starting version
   * @param {number} toVersion - Ending version (optional, defaults to current)
   * @returns {Promise<Object>} Change summary
   */
  async compareCatalogVersions(fromVersion, toVersion = null) {
    try {
      if (!toVersion) {
        toVersion = await this.getCurrentCatalogVersion();
      }
      
      console.log(`🔍 Comparing catalog versions ${fromVersion} → ${toVersion}`);
      
      if (fromVersion === toVersion) {
        return { hasChanges: false, fromVersion, toVersion, changes: [] };
      }
      
      const oldObjects = await this.listCatalogObjectsAtVersion(fromVersion, { limit: 5000 });
      const newObjects = await this.listCatalogObjectsAtVersion(toVersion, { limit: 5000 });
      
      const oldMap = new Map(oldObjects.map(obj => [obj.id, obj]));
      const newMap = new Map(newObjects.map(obj => [obj.id, obj]));
      
      const changes = [];
      
      // Find added objects
      for (const [id, obj] of newMap) {
        if (!oldMap.has(id)) {
          changes.push({ type: 'ADDED', id, object: obj });
        }
      }
      
      // Find removed objects
      for (const [id, obj] of oldMap) {
        if (!newMap.has(id)) {
          changes.push({ type: 'REMOVED', id, object: obj });
        }
      }
      
      // Find modified objects
      for (const [id, newObj] of newMap) {
        const oldObj = oldMap.get(id);
        if (oldObj && oldObj.version !== newObj.version) {
          changes.push({ type: 'MODIFIED', id, oldObject: oldObj, newObject: newObj });
        }
      }
      
      console.log(`🔍 Found ${changes.length} changes between versions`);
      return { hasChanges: changes.length > 0, fromVersion, toVersion, changes };
      
    } catch (error) {
      this.handleSquareError(error, 'Failed to compare catalog versions');
      throw error;
    }
  }

  /**
   * Sync local state with Square catalog using version management
   * @param {Array} localObjects - Local objects to sync
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Sync results
   */
  async syncWithVersionControl(localObjects, options = {}) {
    try {
      console.log(`🔄 Starting version-controlled sync of ${localObjects.length} objects`);
      
      // Get current catalog version
      const currentVersion = await this.getCurrentCatalogVersion();
      
      // If we have a last known version, check for conflicts
      if (this.lastKnownCatalogVersion && this.lastKnownCatalogVersion < currentVersion) {
        console.log(`⚠️ Catalog has changed (v${this.lastKnownCatalogVersion} → v${currentVersion}). Checking for conflicts...`);
        
        const versionDiff = await this.compareCatalogVersions(this.lastKnownCatalogVersion, currentVersion);
        
        if (versionDiff.hasChanges) {
          console.log(`🔍 Found ${versionDiff.changes.length} changes in catalog since last sync`);
          
          if (options.onVersionConflict) {
            const resolution = await options.onVersionConflict(versionDiff);
            if (resolution === 'abort') {
              throw new Error('Sync aborted due to version conflicts');
            }
          }
        }
      }
      
      // Perform sync with version control
      const result = await this.batchUpsertWithVersions(localObjects, options);
      
      // Update our version tracking
      this.lastKnownCatalogVersion = currentVersion;
      
      console.log(`✅ Version-controlled sync completed successfully`);
      return result;
      
    } catch (error) {
      this.handleSquareError(error, 'Version-controlled sync failed');
      throw error;
    }
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
      
      // Test catalog access and get limits
      await this.getCatalogInfo();
      
      // Test basic catalog listing and get version
      const catalogVersion = await this.getCurrentCatalogVersion();
      
      console.log('✅ Catalog API access confirmed with version tracking enabled.');
      return true;
      
    } catch (error) {
      this.handleSquareError(error, 'Square API connection failed');
      return false;
    }
  }
}

export default SquareCatalogAgent;
