import { SquareClient, SquareEnvironment, SquareError } from 'square';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { CatalogObserver } from '../observability/CatalogObserver.js';

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
    
    // Initialize observability system
    this.observer = new CatalogObserver({
      enableFileLogging: !this.enableDryRun, // Disable file logging in dry run mode
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/square-catalog'
    });
  }

  /**
   * Get all locations for the merchant
   * @returns {Promise<Array>} Array of location objects
   */
  async getLocations() {
    const traceId = this.observer.startTrace('getLocations');
    
    try {
      this.observer.addSpan(traceId, 'api_call', { endpoint: 'locations.list' });
      const { locations } = await this.locationsApi.list();
      
      const result = locations || [];
      this.observer.log('info', `Found ${result.length} Square locations`, { count: result.length });
      this.observer.endTrace(traceId, { locationCount: result.length });
      
      return result;
    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      this.handleSquareError(error, 'Failed to retrieve locations');
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
   * Upload an image to Square Catalog using v43 SDK pattern
   * @param {Buffer} imageBuffer - Image file buffer
   * @param {string} imageName - Name for the image
   * @param {string} caption - Optional caption
   * @param {string} objectId - Optional object ID to attach image to
   * @param {boolean} isPrimary - Whether this should be the primary image
   * @returns {Promise<Object>} Uploaded image object
   */
  async uploadImage(imageBuffer, imageName, caption = '', objectId = null, isPrimary = false) {
    const traceId = this.observer.startTrace('uploadImage', {
      imageName,
      imageSize: imageBuffer ? imageBuffer.length : 0,
      caption: caption ? caption.substring(0, 50) : null,
      objectId,
      isPrimary
    });
    
    if (this.enableDryRun) {
      this.observer.log('info', `[DRY RUN] Would upload image: ${imageName}`);
      const mockResult = { id: `mock-image-${Date.now()}`, name: imageName };
      this.observer.endTrace(traceId, mockResult);
      return mockResult;
    }

    try {
      const idempotencyKey = crypto.randomUUID();
      this.observer.addSpan(traceId, 'generate_idempotency_key', { key: idempotencyKey });
      
      this.observer.addSpan(traceId, 'api_call', { 
        endpoint: 'catalog.createCatalogImage',
        imageSize: imageBuffer.length,
        objectId,
        isPrimary
      });
      
      // Determine file extension for content type
      const contentType = this.getImageContentType(imageName);
      
      // Upload the image using the correct v43 SDK pattern
      const requestParams = {
        idempotencyKey,
        image: {
          imageData: {
            name: imageName,
            caption: caption || `Product image for ${imageName}`,
          }
        },
        isPrimary
      };
      
      // If objectId is provided, attach the image automatically
      if (objectId) {
        requestParams.objectId = objectId;
      }
      
      const response = await this.catalogApi.createCatalogImage(requestParams, imageBuffer);
      
      const result = response.result || response;

      this.observer.log('info', `Successfully uploaded image: ${imageName}`, { 
        imageId: result.image.id,
        imageName,
        attachedTo: objectId || 'none'
      });
      
      this.observer.endTrace(traceId, { imageId: result.image.id, imageName, objectId });
      return result.image;
      
    } catch (error) {
      this.observer.endTrace(traceId, null, error);
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
    const traceId = this.observer.startTrace('createCatalogItem', {
      productName: productData.productName,
      category: productData.category,
      hasImage: !!imageId,
      price
    });
    
    if (this.enableDryRun) {
      this.observer.log('info', `[DRY RUN] Would create catalog item: ${productData.productName}`);
      const mockResult = { id: `mock-item-${Date.now()}`, itemData: { name: productData.productName } };
      this.observer.endTrace(traceId, mockResult);
      return mockResult;
    }

    try {
      const idempotencyKey = crypto.randomUUID();
      const itemId = `#${productData.productName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
      
      this.observer.addSpan(traceId, 'generate_item_structure', { itemId, idempotencyKey });
      
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
      this.observer.addSpan(traceId, 'resolve_category', { category: productData.category });
      const categoryId = await this.getOrCreateCategory(productData.category);
      if (categoryId) {
        catalogObject.itemData.categories = [{ id: categoryId }];
        this.observer.addSpan(traceId, 'category_resolved', { categoryId });
      }

      // Add image if provided
      if (imageId) {
        catalogObject.itemData.imageIds = [imageId];
        this.observer.addSpan(traceId, 'image_attached', { imageId });
      }

      this.observer.addSpan(traceId, 'api_call', { endpoint: 'catalog.batchUpsert' });
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

      this.observer.log('info', `Created catalog item: ${productData.productName}`, { 
        catalogId: objects[0].id,
        productName: productData.productName
      });
      
      this.observer.endTrace(traceId, { catalogId: objects[0].id, productName: productData.productName });
      return objects[0];
      
    } catch (error) {
      this.observer.endTrace(traceId, null, error);
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
    
    console.log('\n📊 Integration Summary:');
    console.log(`  ✅ Successful: ${results.length}`);
    console.log(`  ❌ Errors: ${errors.length}`);
    
    return { results, errors, locationId };
  }

  /**
   * Enhanced Square API error handling with detailed classification
   * @param {Error} error - The error object
   * @param {string} context - Context description
   * @param {Object} options - Additional error handling options
   */
  handleSquareError(error, context, options = {}) {
    const errorInfo = this.classifySquareError(error);
    
    // Log error through observability system
    this.observer.log(errorInfo.severity, `Square API Error: ${context}`, {
      errorType: errorInfo.type,
      errorCategory: errorInfo.category,
      isRetryable: errorInfo.isRetryable,
      httpStatus: errorInfo.httpStatus,
      errorMessage: error.message
    }, {
      operation: context,
      errorCode: error instanceof SquareError ? error.result?.errors?.[0]?.code : error.code,
      remediation: errorInfo.remediation
    });
    
    // Enhanced error details for console (legacy support)
    if (error instanceof SquareError && error.result?.errors) {
      this.observer.log('debug', 'Square API Error Details', {
        errors: error.result.errors.map((err, index) => ({
          index: index + 1,
          code: err.code,
          category: err.category,
          detail: err.detail,
          field: err.field
        }))
      });
    }
    
    // Record error metrics for monitoring
    if (options.trackMetrics !== false) {
      this.recordErrorMetrics(errorInfo, context);
    }
    
    return errorInfo;
  }

  /**
   * Classify Square API errors with detailed categorization
   * @param {Error} error - The error to classify
   * @returns {Object} Error classification details
   */
  classifySquareError(error) {
    const classification = {
      type: 'unknown',
      category: 'UNKNOWN_ERROR',
      isRetryable: false,
      severity: 'error',
      httpStatus: null,
      remediation: null
    };
    
    // Handle Square SDK errors
    if (error instanceof SquareError) {
      classification.httpStatus = error.statusCode;
      
      // HTTP status code classification
      if (error.statusCode) {
        switch (Math.floor(error.statusCode / 100)) {
          case 4: // 4xx Client Errors
            classification.type = 'client_error';
            classification.severity = error.statusCode === 401 ? 'critical' : 'error';
            classification.isRetryable = [408, 409, 429].includes(error.statusCode);
            break;
          case 5: // 5xx Server Errors
            classification.type = 'server_error';
            classification.severity = 'critical';
            classification.isRetryable = true;
            break;
          default:
            classification.type = 'http_error';
        }
      }
      
      // Square-specific error codes
      if (error.result?.errors?.[0]) {
        const squareError = error.result.errors[0];
        classification.category = squareError.category;
        
        const errorCode = squareError.code;
        const errorMappings = this.getSquareErrorMappings();
        
        if (errorMappings[errorCode]) {
          Object.assign(classification, errorMappings[errorCode]);
        }
      }
    }
    // Handle network and system errors
    else if (error.code) {
      const networkErrors = {
        'ECONNRESET': { type: 'network', isRetryable: true, severity: 'warning', remediation: 'Check network connectivity and retry' },
        'ETIMEDOUT': { type: 'network', isRetryable: true, severity: 'warning', remediation: 'Request timed out, consider increasing timeout or retry' },
        'ENOTFOUND': { type: 'network', isRetryable: false, severity: 'error', remediation: 'DNS resolution failed, check hostname' },
        'ECONNREFUSED': { type: 'network', isRetryable: false, severity: 'error', remediation: 'Connection refused, check service availability' }
      };
      
      if (networkErrors[error.code]) {
        Object.assign(classification, networkErrors[error.code]);
      }
    }
    
    return classification;
  }

  /**
   * Get Square API error code mappings
   * @returns {Object} Error code to classification mappings
   */
  getSquareErrorMappings() {
    return {
      // Authentication & Authorization
      'UNAUTHORIZED': {
        type: 'authentication',
        isRetryable: false,
        severity: 'critical',
        remediation: 'Check access token validity and permissions'
      },
      'FORBIDDEN': {
        type: 'authorization',
        isRetryable: false,
        severity: 'critical',
        remediation: 'Insufficient permissions for this operation'
      },
      
      // Rate Limiting
      'RATE_LIMITED': {
        type: 'rate_limit',
        isRetryable: true,
        severity: 'warning',
        remediation: 'Reduce request frequency and implement backoff strategy'
      },
      
      // Validation Errors
      'BAD_REQUEST': {
        type: 'validation',
        isRetryable: false,
        severity: 'error',
        remediation: 'Check request format and required fields'
      },
      'INVALID_REQUEST_ERROR': {
        type: 'validation',
        isRetryable: false,
        severity: 'error',
        remediation: 'Validate request parameters and format'
      },
      
      // Conflict & Version Errors
      'CONFLICT': {
        type: 'version_conflict',
        isRetryable: true,
        severity: 'warning',
        remediation: 'Refresh object version and retry with latest data'
      },
      'VERSION_MISMATCH': {
        type: 'version_conflict',
        isRetryable: true,
        severity: 'warning',
        remediation: 'Object version is outdated, fetch latest version and retry'
      },
      
      // Resource Errors
      'NOT_FOUND': {
        type: 'resource',
        isRetryable: false,
        severity: 'error',
        remediation: 'Verify resource ID exists and is accessible'
      },
      'GONE': {
        type: 'resource',
        isRetryable: false,
        severity: 'error',
        remediation: 'Resource has been permanently deleted'
      },
      
      // Service Errors
      'INTERNAL_SERVER_ERROR': {
        type: 'service',
        isRetryable: true,
        severity: 'critical',
        remediation: 'Square service error, retry with exponential backoff'
      },
      'SERVICE_UNAVAILABLE': {
        type: 'service',
        isRetryable: true,
        severity: 'critical',
        remediation: 'Square service temporarily unavailable, retry later'
      },
      
      // Request Limit Errors
      'REQUEST_TIMEOUT': {
        type: 'timeout',
        isRetryable: true,
        severity: 'warning',
        remediation: 'Request took too long, consider reducing payload size'
      },
      'PAYLOAD_TOO_LARGE': {
        type: 'validation',
        isRetryable: false,
        severity: 'error',
        remediation: 'Reduce request payload size or split into smaller batches'
      }
    };
  }

  /**
   * Record error metrics for monitoring and analysis
   * @param {Object} errorInfo - Classified error information
   * @param {string} context - Error context
   */
  recordErrorMetrics(errorInfo, context) {
    if (!this.errorMetrics) {
      this.errorMetrics = new Map();
    }
    
    const timestamp = Date.now();
    const hourKey = Math.floor(timestamp / (1000 * 60 * 60)); // Hour bucket
    
    if (!this.errorMetrics.has(hourKey)) {
      this.errorMetrics.set(hourKey, {
        total: 0,
        byType: {},
        byCategory: {},
        bySeverity: {},
        retryable: 0,
        nonRetryable: 0
      });
    }
    
    const metrics = this.errorMetrics.get(hourKey);
    metrics.total++;
    metrics.byType[errorInfo.type] = (metrics.byType[errorInfo.type] || 0) + 1;
    metrics.byCategory[errorInfo.category] = (metrics.byCategory[errorInfo.category] || 0) + 1;
    metrics.bySeverity[errorInfo.severity] = (metrics.bySeverity[errorInfo.severity] || 0) + 1;
    
    if (errorInfo.isRetryable) {
      metrics.retryable++;
    } else {
      metrics.nonRetryable++;
    }
    
    // Clean up old metrics (keep last 24 hours)
    const cutoffHour = hourKey - 24;
    for (const [hour] of this.errorMetrics) {
      if (hour < cutoffHour) {
        this.errorMetrics.delete(hour);
      }
    }
  }

  /**
   * Get error metrics summary
   * @param {number} hours - Number of hours to look back (default: 1)
   * @returns {Object} Error metrics summary
   */
  getErrorMetrics(hours = 1) {
    if (!this.errorMetrics) {
      return { total: 0, summary: 'No error metrics available' };
    }
    
    const now = Math.floor(Date.now() / (1000 * 60 * 60));
    const startHour = now - hours;
    
    const summary = {
      total: 0,
      byType: {},
      byCategory: {},
      bySeverity: {},
      retryable: 0,
      nonRetryable: 0,
      period: `Last ${hours} hour(s)`
    };
    
    for (let hour = startHour; hour <= now; hour++) {
      const metrics = this.errorMetrics.get(hour);
      if (metrics) {
        summary.total += metrics.total;
        summary.retryable += metrics.retryable;
        summary.nonRetryable += metrics.nonRetryable;
        
        // Merge type counts
        for (const [type, count] of Object.entries(metrics.byType)) {
          summary.byType[type] = (summary.byType[type] || 0) + count;
        }
        
        // Merge category counts
        for (const [category, count] of Object.entries(metrics.byCategory)) {
          summary.byCategory[category] = (summary.byCategory[category] || 0) + count;
        }
        
        // Merge severity counts
        for (const [severity, count] of Object.entries(metrics.bySeverity)) {
          summary.bySeverity[severity] = (summary.bySeverity[severity] || 0) + count;
        }
      }
    }
    
    return summary;
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
    const traceId = this.observer.startTrace('batchUpsertCatalogObjects', {
      objectCount: objects.length,
      objectTypes: [...new Set(objects.map(obj => obj.type))]
    });
    
    try {
      this.observer.addSpan(traceId, 'get_catalog_limits');
      const catalogInfo = await this.getCatalogInfo();
      const maxObjectsPerBatch = catalogInfo.limits?.batchUpsertMaxObjectsPerBatch || 1000;
      const maxTotalObjects = catalogInfo.limits?.batchUpsertMaxTotalObjects || 10000;
      
      if (objects.length > maxTotalObjects) {
        throw new Error(`Too many objects (${objects.length}). Maximum allowed is ${maxTotalObjects}`);
      }
      
      this.observer.addSpan(traceId, 'prepare_batches', { 
        maxObjectsPerBatch, 
        totalObjects: objects.length 
      });
      
      // Split into batches if necessary
      const batches = [];
      for (let i = 0; i < objects.length; i += maxObjectsPerBatch) {
        batches.push({
          objects: objects.slice(i, i + maxObjectsPerBatch)
        });
      }
      
      const idempotencyKey = crypto.randomUUID();
      
      this.observer.addSpan(traceId, 'api_call', { 
        endpoint: 'catalog.batchUpsert',
        batchCount: batches.length,
        idempotencyKey
      });
      
      const { result } = await this.catalogApi.batchUpsert({
        idempotencyKey,
        batches,
        ...options
      });
      
      const processedCount = result.objects?.length || 0;
      this.observer.log('info', `Batch upsert completed: ${processedCount} objects processed`, {
        processedCount,
        batchCount: batches.length,
        totalObjects: objects.length
      });
      
      this.observer.endTrace(traceId, { processedCount, batchCount: batches.length });
      return result;
      
    } catch (error) {
      this.observer.endTrace(traceId, null, error);
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
        const response = await this.catalogApi.search({
          ...searchQuery,
          cursor,
          limit: Math.min(searchQuery.limit || 1000, 1000) // Respect API limits
        });
        
        // Handle both response.result and direct response patterns
        const result = response.result || response;
        
        if (result && result.objects) {
          allResults.push(...result.objects);
        }
        
        cursor = result?.cursor;
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
      
      console.log('✅ Version-controlled sync completed successfully');
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
   * Check if error is retryable based on enhanced error classification
   * @param {Error} error - Error to check
   * @param {Array} retryableErrors - List of retryable error codes (optional)
   * @returns {boolean} Whether error is retryable
   */
  isRetryableError(error, retryableErrors = []) {
    // Use enhanced error classification for more accurate determination
    const errorInfo = this.classifySquareError(error);
    
    // Primary determination based on classification
    if (errorInfo.isRetryable) {
      return true;
    }
    
    // Fallback to legacy retryable error codes if provided
    if (retryableErrors.length > 0) {
      if (error instanceof SquareError) {
        const errorCode = error.result?.errors?.[0]?.code;
        if (errorCode && retryableErrors.includes(errorCode)) {
          return true;
        }
      }
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
        console.log('🐌 Recent rate limiting detected, applying conservative settings');
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
    const traceId = this.observer.startTrace('testConnection');
    
    try {
      this.observer.log('info', 'Testing Square API connection...');
      
      this.observer.addSpan(traceId, 'test_locations');
      const locations = await this.getLocations();
      
      this.observer.addSpan(traceId, 'test_catalog_info');
      await this.getCatalogInfo();
      
      this.observer.addSpan(traceId, 'test_catalog_version');
      const catalogVersion = await this.getCurrentCatalogVersion();
      
      this.observer.addSpan(traceId, 'initialize_performance_tracking');
      this.initializePerformanceTracking();
      
      this.observer.log('info', 'Square API connection test successful', {
        locationCount: locations.length,
        catalogVersion,
        features: ['version_tracking', 'performance_optimization', 'observability']
      });
      
      this.observer.endTrace(traceId, { 
        success: true, 
        locationCount: locations.length, 
        catalogVersion 
      });
      
      return true;
      
    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      this.handleSquareError(error, 'Square API connection failed');
      return false;
    }
  }
  
  /**
   * Get observability metrics and system health
   * @returns {Object} Comprehensive system metrics
   */
  getObservabilityMetrics() {
    return {
      performance: this.observer.getPerformanceMetrics(24),
      systemHealth: this.observer.getSystemHealth(),
      alerts: this.observer.alerts.filter(alert => !alert.acknowledged),
      traces: {
        active: this.observer.currentOperations.size,
        total: this.observer.traces.size
      }
    };
  }
  
  /**
   * Generate and return performance report
   * @returns {Promise<Object>} Performance report
   */
  async generatePerformanceReport() {
    return await this.observer.generatePerformanceReport();
  }
  
  /**
   * Graceful shutdown with observability cleanup
   */
  async shutdown() {
    this.observer.log('info', 'Shutting down SquareCatalogAgent');
    await this.observer.shutdown();
  }
}

export default SquareCatalogAgent;
