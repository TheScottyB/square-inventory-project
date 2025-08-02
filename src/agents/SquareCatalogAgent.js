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
   * Enhanced batch upsert with intelligent version conflict handling
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
      return await this.handleVersionConflictWithRetry(error, objects, options);
    }
  }

  /**
   * Intelligent version conflict resolution with exponential backoff
   * @param {Error} error - The error from batch upsert
   * @param {Array} objects - Original objects being upserted
   * @param {Object} options - Original options
   * @returns {Promise<Object>} Retry result or throws error
   */
  async handleVersionConflictWithRetry(error, objects, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const currentRetry = options._retryCount || 0;
    
    // Check if this is a version conflict error
    const isVersionConflict = error.result?.errors?.some(err => 
      err.code === 'CONFLICT' || err.code === 'VERSION_MISMATCH'
    );
    
    if (isVersionConflict && currentRetry < maxRetries) {
      console.warn(`⚠️ Version conflict detected (attempt ${currentRetry + 1}/${maxRetries}). Implementing intelligent resolution...`);
      
      // Exponential backoff with jitter
      const baseDelay = Math.min(1000 * Math.pow(2, currentRetry), 8000); // Max 8s
      const jitter = Math.random() * 1000; // Up to 1s jitter
      const delay = baseDelay + jitter;
      
      console.log(`   ⏱️ Waiting ${Math.round(delay)}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        // Strategy 1: Fetch fresh versions for all objects
        const objectIds = objects.map(obj => obj.id).filter(id => id && !id.startsWith('#'));
        let freshObjects = [];
        
        if (objectIds.length > 0) {
          console.log(`   🔄 Fetching fresh versions for ${objectIds.length} existing objects`);
          freshObjects = await this.retrieveCatalogObjectsWithVersions(objectIds);
        }
        
        // Strategy 2: Merge changes intelligently
        const reconciledObjects = await this.reconcileObjectVersions(objects, freshObjects);
        
        // Strategy 3: Retry with updated options
        const retryOptions = {
          ...options,
          _retryCount: currentRetry + 1,
          _isRetry: true
        };
        
        console.log(`   ✨ Retrying with ${reconciledObjects.length} reconciled objects`);
        return await this.batchUpsertWithVersions(reconciledObjects, retryOptions);
        
      } catch (retryError) {
        // If retry also fails, check if we should try again
        if (currentRetry < maxRetries - 1) {
          return await this.handleVersionConflictWithRetry(retryError, objects, {
            ...options,
            _retryCount: currentRetry + 1
          });
        }
        
        console.error(`❌ Version conflict resolution failed after ${maxRetries} attempts`);
        this.handleSquareError(retryError, 'Final retry attempt failed');
        throw retryError;
      }
    }
    
    // Not a version conflict or exceeded retries
    this.handleSquareError(error, 'Batch upsert with versions failed');
    throw error;
  }

  /**
   * Intelligent object version reconciliation
   * @param {Array} localObjects - Objects we want to upsert
   * @param {Array} remoteObjects - Fresh objects from Square
   * @returns {Promise<Array>} Reconciled objects ready for upsert
   */
  async reconcileObjectVersions(localObjects, remoteObjects) {
    const reconciledObjects = [];
    const remoteMap = new Map(remoteObjects.map(obj => [obj.id, obj]));
    
    for (const localObj of localObjects) {
      if (localObj.id && localObj.id.startsWith('#')) {
        // New object with temp ID - no reconciliation needed
        reconciledObjects.push(localObj);
        continue;
      }
      
      const remoteObj = remoteMap.get(localObj.id);
      if (!remoteObj) {
        // Object doesn't exist remotely anymore - treat as new
        console.warn(`   ⚠️ Object ${localObj.id} no longer exists remotely, treating as new`);
        reconciledObjects.push({ ...localObj, id: `#${localObj.id}-recovered` });
        continue;
      }
      
      // Intelligent merge strategy
      const reconciledObj = await this.mergeObjectChanges(localObj, remoteObj);
      reconciledObjects.push(reconciledObj);
      
      console.log(`   🔄 Reconciled ${localObj.type} ${localObj.id} (v${remoteObj.version})`);
    }
    
    return reconciledObjects;
  }

  /**
   * Smart merge strategy for catalog objects
   * @param {Object} localObj - Local object with our changes
   * @param {Object} remoteObj - Remote object with latest version
   * @returns {Promise<Object>} Merged object
   */
  async mergeObjectChanges(localObj, remoteObj) {
    const merged = { ...remoteObj }; // Start with remote as base
    
    // Strategy: Preserve local changes for specific fields
    const preserveLocalFields = {
      'ITEM': ['itemData.name', 'itemData.description', 'itemData.imageIds'],
      'ITEM_VARIATION': ['itemVariationData.name', 'itemVariationData.priceMoney', 'itemVariationData.sku'],
      'CATEGORY': ['categoryData.name'],
      'IMAGE': ['imageData.name', 'imageData.caption']
    };
    
    const fieldsToPreserve = preserveLocalFields[localObj.type] || [];
    
    for (const fieldPath of fieldsToPreserve) {
      const localValue = this.getNestedValue(localObj, fieldPath);
      if (localValue !== undefined) {
        this.setNestedValue(merged, fieldPath, localValue);
      }
    }
    
    // Always use the remote version number
    merged.version = remoteObj.version;
    
    return merged;
  }

  /**
   * Get nested object value by path
   * @param {Object} obj - Object to traverse
   * @param {string} path - Dot-separated path
   * @returns {*} Value at path or undefined
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested object value by path
   * @param {Object} obj - Object to modify
   * @param {string} path - Dot-separated path
   * @param {*} value - Value to set
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
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
   * Adaptive retry strategy with configurable backoff and jitter
   * @param {Function} operation - Async operation to retry
   * @param {Object} options - Retry configuration
   * @returns {Promise<*>} Operation result
   */
  async withAdaptiveRetry(operation, options = {}) {
    const {
      maxRetries = 3,
      baseDelayMs = 1000,
      maxDelayMs = 30000,
      backoffFactor = 2,
      jitterFactor = 0.1,
      retryableErrors = ['RATE_LIMITED', 'TEMPORARY_ERROR', 'NETWORK_ERROR', 'CONFLICT'],
      onRetry = null
    } = options;
    
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        const isRetryable = this.isRetryableError(error, retryableErrors);
        const isLastAttempt = attempt === maxRetries;
        
        if (!isRetryable || isLastAttempt) {
          throw error;
        }
        
        // Calculate delay with exponential backoff and jitter
        const exponentialDelay = Math.min(baseDelayMs * Math.pow(backoffFactor, attempt), maxDelayMs);
        const jitter = exponentialDelay * jitterFactor * (Math.random() * 2 - 1); // ±jitterFactor
        const delay = Math.max(exponentialDelay + jitter, 100); // Min 100ms
        
        console.warn(`⚠️ Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms... (${error.message})`);
        
        if (onRetry) {
          await onRetry(error, attempt, delay);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Check if error is retryable based on configuration
   * @param {Error} error - Error to check
   * @param {Array} retryableErrors - List of retryable error codes
   * @returns {boolean} Whether error is retryable
   */
  isRetryableError(error, retryableErrors) {
    if (error instanceof SquareError) {
      const errorCode = error.result?.errors?.[0]?.code;
      if (errorCode && retryableErrors.includes(errorCode)) {
        return true;
      }
      
      // Check HTTP status codes
      const status = error.statusCode;
      if (status === 429 || status === 502 || status === 503 || status === 504) {
        return true;
      }
    }
    
    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }
    
    return false;
  }

  /**
   * Dynamic throughput optimization based on real-time API usage
   * @param {string} merchantId - Merchant identifier for per-merchant tuning
   * @returns {Promise<Object>} Optimized batch configuration
   */
  async getOptimizedBatchConfig(merchantId = 'default') {
    try {
      // Get current catalog info to understand API state
      const catalogInfo = await this.getCatalogInfo();
      const limits = catalogInfo.limits;
      
      // Base configuration
      let config = {
        batchSize: Math.floor(limits.batchUpsertMaxObjectsPerBatch * 0.8), // 80% of limit
        concurrency: 2, // Conservative default
        delayBetweenBatches: 100, // 100ms
        adaptiveBackoff: true
      };
      
      // Check if we have performance history for this merchant
      const perfKey = `merchant_perf_${merchantId}`;
      const perfHistory = this.performanceCache?.get(perfKey) || {
        successRate: 1.0,
        avgResponseTime: 1000,
        recentErrors: [],
        lastOptimization: Date.now()
      };
      
      // Adjust based on recent performance
      if (perfHistory.successRate > 0.95 && perfHistory.avgResponseTime < 2000) {
        // High success rate and fast responses - increase throughput
        config.batchSize = Math.min(config.batchSize * 1.2, limits.batchUpsertMaxObjectsPerBatch);
        config.concurrency = Math.min(config.concurrency + 1, 5);
        config.delayBetweenBatches = Math.max(config.delayBetweenBatches * 0.8, 50);
      } else if (perfHistory.successRate < 0.8 || perfHistory.avgResponseTime > 5000) {
        // Poor performance - be more conservative
        config.batchSize = Math.max(config.batchSize * 0.6, 10);
        config.concurrency = 1;
        config.delayBetweenBatches = Math.min(config.delayBetweenBatches * 1.5, 2000);
      }
      
      // Check for recent rate limiting
      const recentRateLimits = perfHistory.recentErrors.filter(err => 
        err.code === 'RATE_LIMITED' && (Date.now() - err.timestamp) < 300000 // Last 5 minutes
      );
      
      if (recentRateLimits.length > 0) {
        console.log(`🐌 Recent rate limiting detected, applying conservative settings`);
        config.batchSize = Math.max(config.batchSize * 0.5, 5);
        config.concurrency = 1;
        config.delayBetweenBatches = Math.max(config.delayBetweenBatches * 2, 1000);
      }
      
      console.log(`⚡ Optimized batch config for ${merchantId}:`, {
        batchSize: Math.floor(config.batchSize),
        concurrency: config.concurrency,
        delayMs: config.delayBetweenBatches,
        successRate: `${(perfHistory.successRate * 100).toFixed(1)}%`
      });
      
      return config;
      
    } catch (error) {
      console.warn('⚠️ Could not optimize batch config, using defaults');
      return {
        batchSize: 100,
        concurrency: 1,
        delayBetweenBatches: 500,
        adaptiveBackoff: true
      };
    }
  }

  /**
   * Initialize performance tracking cache
   */
  initializePerformanceTracking() {
    if (!this.performanceCache) {
      this.performanceCache = new Map();
    }
  }

  /**
   * Record performance metrics for adaptive optimization
   * @param {string} merchantId - Merchant identifier
   * @param {Object} metrics - Performance metrics
   */
  recordPerformanceMetrics(merchantId, metrics) {
    this.initializePerformanceTracking();
    
    const perfKey = `merchant_perf_${merchantId}`;
    const existing = this.performanceCache.get(perfKey) || {
      successRate: 1.0,
      avgResponseTime: 1000,
      recentErrors: [],
      totalRequests: 0,
      successfulRequests: 0
    };
    
    // Update metrics
    existing.totalRequests += 1;
    if (metrics.success) {
      existing.successfulRequests += 1;
    } else {
      existing.recentErrors.push({
        code: metrics.errorCode,
        timestamp: Date.now()
      });
      
      // Keep only recent errors (last hour)
      existing.recentErrors = existing.recentErrors.filter(err => 
        Date.now() - err.timestamp < 3600000
      );
    }
    
    // Calculate rolling success rate
    existing.successRate = existing.successfulRequests / existing.totalRequests;
    
    // Update average response time (simple moving average)
    if (metrics.responseTime) {
      existing.avgResponseTime = (existing.avgResponseTime * 0.8) + (metrics.responseTime * 0.2);
    }
    
    this.performanceCache.set(perfKey, existing);
  }

  /**
   * Enhanced batch upsert with adaptive throughput optimization
   * @param {Array} objects - Array of catalog objects
   * @param {Object} options - Enhanced batch options
   * @returns {Promise<Object>} Batch upsert results
   */
  async batchUpsertWithOptimization(objects, options = {}) {
    const merchantId = options.merchantId || 'default';
    const startTime = Date.now();
    
    try {
      // Get optimized configuration
      const config = await this.getOptimizedBatchConfig(merchantId);
      
      // Apply adaptive retry wrapper
      const result = await this.withAdaptiveRetry(async () => {
        return await this.batchUpsertWithVersions(objects, {
          ...options,
          batchSize: config.batchSize,
          concurrency: config.concurrency
        });
      }, {
        maxRetries: options.maxRetries || 3,
        baseDelayMs: config.delayBetweenBatches,
        onRetry: async (error, attempt, delay) => {
          this.recordPerformanceMetrics(merchantId, {
            success: false,
            errorCode: error.result?.errors?.[0]?.code,
            responseTime: Date.now() - startTime
          });
        }
      });
      
      // Record success metrics
      this.recordPerformanceMetrics(merchantId, {
        success: true,
        responseTime: Date.now() - startTime
      });
      
      return result;
      
    } catch (error) {
      // Record failure metrics
      this.recordPerformanceMetrics(merchantId, {
        success: false,
        errorCode: error.result?.errors?.[0]?.code,
        responseTime: Date.now() - startTime
      });
      
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
      
      // Initialize performance tracking
      this.initializePerformanceTracking();
      
      console.log('✅ Catalog API access confirmed with version tracking and performance optimization enabled.');
      return true;
      
    } catch (error) {
      this.handleSquareError(error, 'Square API connection failed');
      return false;
    }
  }
}

export default SquareCatalogAgent;
