#!/usr/bin/env node

import { EventEmitter } from 'events';
import { CatalogObserver } from '../../observability/CatalogObserver.js';

/**
 * CategoryControlAgent - Advanced Category Management with Internal Sorting
 * 
 * Implements dual categorization system:
 * - Preserves 8 established customer-visible categories
 * - Enables internal sorting categories with INTERNAL_ prefix
 * - Manages category visibility and protection
 * - Provides workflow and performance tracking categories
 */
export class CategoryControlAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      internalCategoryPrefix: options.internalCategoryPrefix || 'INTERNAL_',
      maxCategoriesPerItem: options.maxCategoriesPerItem || 8,
      enableCategoryProtection: options.enableCategoryProtection !== false,
      ...options
    };

    // Protected established categories (NEVER modify these)
    this.establishedCategories = {
      'Energy & Elements': {
        protected: true,
        visible: true,
        primary: true,
        description: 'Items focused on natural energy and elemental properties'
      },
      'Mind & Clarity': {
        protected: true,
        visible: true,
        primary: true,
        description: 'Items that promote mental focus and clarity'
      },
      'Space & Atmosphere': {
        protected: true,
        visible: true,
        primary: true,
        description: 'Items that enhance physical spaces and atmosphere'
      },
      'The Real Rarities': {
        protected: true,
        visible: true,
        primary: true,
        description: 'Exceptionally rare and unique items'
      },
      'French Collections': {
        protected: true,
        visible: true,
        primary: true,
        description: 'Items of French origin or style'
      },
      'Spiritual Items': {
        protected: true,
        visible: true,
        primary: true,
        description: 'Items with spiritual or religious significance'
      },
      'Vintage & Antique': {
        protected: true,
        visible: true,
        primary: true,
        description: 'Historical items from previous eras'
      },
      'Handmade & Artisan': {
        protected: true,
        visible: true,
        primary: true,
        description: 'Items created by skilled artisans'
      }
    };

    // Internal category templates for common use cases
    this.internalCategoryTemplates = {
      workflow: {
        'INTERNAL_WORKFLOW_New_Inventory': 'Items newly added to inventory',
        'INTERNAL_WORKFLOW_Pending_Review': 'Items awaiting content review',
        'INTERNAL_WORKFLOW_Photo_Ready': 'Items with complete photo sets',
        'INTERNAL_WORKFLOW_Price_Set': 'Items with finalized pricing',
        'INTERNAL_WORKFLOW_Content_Complete': 'Items ready for publication',
        'INTERNAL_WORKFLOW_Featured_Ready': 'Items ready for featured placement'
      },
      source: {
        'INTERNAL_SOURCE_Estate_Sale': 'Items from estate sales',
        'INTERNAL_SOURCE_Direct_Import': 'Directly imported items',
        'INTERNAL_SOURCE_Artisan_Partner': 'Items from artisan partnerships',
        'INTERNAL_SOURCE_Auction_House': 'Items from auction houses',
        'INTERNAL_SOURCE_Private_Collection': 'Items from private collections'
      },
      performance: {
        'INTERNAL_PERFORMANCE_Bestseller': 'High-performing items',
        'INTERNAL_PERFORMANCE_Slow_Mover': 'Items with low engagement',
        'INTERNAL_PERFORMANCE_Seasonal_Peak': 'Seasonal high-performers',
        'INTERNAL_PERFORMANCE_New_Arrival': 'Recently added items',
        'INTERNAL_PERFORMANCE_Featured_Item': 'Items for featuring'
      },
      condition: {
        'INTERNAL_CONDITION_Mint': 'Items in mint condition',
        'INTERNAL_CONDITION_Excellent': 'Items in excellent condition',
        'INTERNAL_CONDITION_Good': 'Items in good condition',
        'INTERNAL_CONDITION_Fair': 'Items in fair condition',
        'INTERNAL_CONDITION_Restoration': 'Items needing restoration'
      },
      seasonal: {
        'INTERNAL_SEASONAL_Spring': 'Spring seasonal items',
        'INTERNAL_SEASONAL_Summer': 'Summer seasonal items',
        'INTERNAL_SEASONAL_Fall': 'Fall seasonal items',
        'INTERNAL_SEASONAL_Winter': 'Winter seasonal items',
        'INTERNAL_SEASONAL_Holiday': 'Holiday seasonal items'
      }
    };

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/category-control'
    });

    this.stats = {
      itemsProcessed: 0,
      categoriesProtected: 0,
      internalCategoriesCreated: 0,
      categoryViolations: 0,
      dualCategorizationApplied: 0
    };
  }

  /**
   * Process item categories with dual categorization system
   * @param {Object} item - Catalog item
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Category processing result
   */
  async processItemCategories(item, options = {}) {
    const traceId = this.observer.startTrace('process_item_categories');
    
    try {
      const result = {
        sku: item.sku || item.itemName,
        itemName: item.itemName,
        originalCategories: item.categories || '',
        customerVisibleCategories: [],
        internalCategories: [],
        allCategories: [],
        categoryValidation: {
          protectedCategories: [],
          violations: [],
          warnings: []
        },
        suggestedInternalCategories: [],
        processingNotes: []
      };

      // Step 1: Parse and validate existing categories
      const existingCategories = this.parseCategories(result.originalCategories);
      
      // Step 2: Separate customer-visible and internal categories
      const categorySeparation = this.separateCategories(existingCategories);
      result.customerVisibleCategories = categorySeparation.customerVisible;
      result.internalCategories = categorySeparation.internal;

      // Step 3: Validate protected categories
      const protection = this.validateProtectedCategories(result.customerVisibleCategories);
      result.categoryValidation = protection;

      // Step 4: Suggest internal categories based on item characteristics
      if (options.suggestInternalCategories) {
        result.suggestedInternalCategories = this.suggestInternalCategories(item, result.customerVisibleCategories);
      }

      // Step 5: Combine all categories
      result.allCategories = [...result.customerVisibleCategories, ...result.internalCategories];

      // Step 6: Apply category limits
      if (result.allCategories.length > this.options.maxCategoriesPerItem) {
        result.categoryValidation.warnings.push(
          `Item has ${result.allCategories.length} categories, exceeding limit of ${this.options.maxCategoriesPerItem}`
        );
      }

      // Step 7: Generate processing notes
      result.processingNotes = this.generateProcessingNotes(result);

      this.stats.itemsProcessed++;
      if (result.internalCategories.length > 0) {
        this.stats.dualCategorizationApplied++;
      }

      this.observer.endTrace(traceId, {
        sku: result.sku,
        customerCategories: result.customerVisibleCategories.length,
        internalCategories: result.internalCategories.length,
        violations: result.categoryValidation.violations.length
      });

      return result;

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw new Error(`Category processing failed for ${item.itemName}: ${error.message}`);
    }
  }

  /**
   * Parse categories from string or array
   * @param {string|Array} categoryData - Category data to parse
   * @returns {Array} Parsed categories
   */
  parseCategories(categoryData) {
    if (!categoryData) return [];
    
    if (Array.isArray(categoryData)) {
      return categoryData.filter(cat => cat && cat.trim().length > 0);
    }
    
    if (typeof categoryData === 'string') {
      return categoryData
        .split(',')
        .map(cat => cat.trim())
        .filter(cat => cat.length > 0)
        .filter(cat => cat !== 'Default Title' && cat !== 'Uncategorized');
    }
    
    return [];
  }

  /**
   * Separate customer-visible and internal categories
   * @param {Array} categories - All categories
   * @returns {Object} Separated categories
   */
  separateCategories(categories) {
    const customerVisible = [];
    const internal = [];

    categories.forEach(category => {
      if (this.isInternalCategory(category)) {
        internal.push(category);
      } else {
        customerVisible.push(category);
      }
    });

    return { customerVisible, internal };
  }

  /**
   * Check if category is internal (uses prefix)
   * @param {string} categoryName - Category name to check
   * @returns {boolean} Is internal category
   */
  isInternalCategory(categoryName) {
    return categoryName.startsWith(this.options.internalCategoryPrefix);
  }

  /**
   * Check if category is protected (established)
   * @param {string} categoryName - Category name to check
   * @returns {boolean} Is protected category
   */
  isProtectedCategory(categoryName) {
    return this.establishedCategories.hasOwnProperty(categoryName);
  }

  /**
   * Validate protected categories are not modified
   * @param {Array} customerCategories - Customer-visible categories
   * @returns {Object} Validation results
   */
  validateProtectedCategories(customerCategories) {
    const validation = {
      protectedCategories: [],
      violations: [],
      warnings: []
    };

    customerCategories.forEach(category => {
      if (this.isProtectedCategory(category)) {
        validation.protectedCategories.push(category);
        this.stats.categoriesProtected++;
      } else {
        // Check for potential misspellings or modifications of protected categories
        const similarProtected = this.findSimilarProtectedCategory(category);
        if (similarProtected) {
          validation.warnings.push(
            `Category "${category}" is similar to protected category "${similarProtected}". Consider using the established category.`
          );
        }
      }
    });

    return validation;
  }

  /**
   * Find similar protected category (fuzzy matching)
   * @param {string} categoryName - Category to check
   * @returns {string|null} Similar protected category or null
   */
  findSimilarProtectedCategory(categoryName) {
    const lowercaseName = categoryName.toLowerCase();
    
    for (const protectedCategory of Object.keys(this.establishedCategories)) {
      const protectedLower = protectedCategory.toLowerCase();
      
      // Check for partial matches
      if (lowercaseName.includes(protectedLower) || protectedLower.includes(lowercaseName)) {
        return protectedCategory;
      }
      
      // Check for word matches
      const nameWords = lowercaseName.split(/\s+/);
      const protectedWords = protectedLower.split(/\s+/);
      
      const commonWords = nameWords.filter(word => protectedWords.includes(word));
      if (commonWords.length >= 1 && nameWords.length <= 3) {
        return protectedCategory;
      }
    }
    
    return null;
  }

  /**
   * Suggest internal categories based on item characteristics
   * @param {Object} item - Catalog item
   * @param {Array} existingCategories - Existing customer categories
   * @returns {Array} Suggested internal categories
   */
  suggestInternalCategories(item, existingCategories) {
    const suggestions = [];
    
    // Workflow suggestions based on item completeness
    if (!item.price || item.price === 0) {
      suggestions.push('INTERNAL_WORKFLOW_Price_Set');
    }
    
    if (!item.description || item.description.length < 50) {
      suggestions.push('INTERNAL_WORKFLOW_Pending_Review');
    }
    
    if (item.images && item.images.length === 0) {
      suggestions.push('INTERNAL_WORKFLOW_Photo_Ready');
    }

    // Performance suggestions based on item age
    const daysSinceCreation = this.calculateDaysSinceCreation(item);
    if (daysSinceCreation <= 7) {
      suggestions.push('INTERNAL_PERFORMANCE_New_Arrival');
    }

    // Condition suggestions based on description
    const itemText = [item.itemName, item.description].filter(Boolean).join(' ').toLowerCase();
    if (itemText.includes('mint') || itemText.includes('perfect')) {
      suggestions.push('INTERNAL_CONDITION_Mint');
    } else if (itemText.includes('excellent')) {
      suggestions.push('INTERNAL_CONDITION_Excellent');
    }

    // Seasonal suggestions based on categories or description
    const seasonalKeywords = {
      'INTERNAL_SEASONAL_Holiday': ['christmas', 'holiday', 'winter holiday', 'festive'],
      'INTERNAL_SEASONAL_Spring': ['spring', 'easter', 'renewal'],
      'INTERNAL_SEASONAL_Summer': ['summer', 'beach', 'vacation'],
      'INTERNAL_SEASONAL_Fall': ['fall', 'autumn', 'harvest'],
      'INTERNAL_SEASONAL_Winter': ['winter', 'snow', 'cozy']
    };

    Object.entries(seasonalKeywords).forEach(([category, keywords]) => {
      if (keywords.some(keyword => itemText.includes(keyword))) {
        suggestions.push(category);
      }
    });

    return [...new Set(suggestions)]; // Remove duplicates
  }

  /**
   * Calculate days since item creation
   * @param {Object} item - Catalog item
   * @returns {number} Days since creation
   */
  calculateDaysSinceCreation(item) {
    if (!item.createdAt && !item.created_at) return 0;
    
    const createdDate = new Date(item.createdAt || item.created_at);
    const now = new Date();
    return Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
  }

  /**
   * Generate processing notes for the item
   * @param {Object} result - Processing result
   * @returns {Array} Processing notes
   */
  generateProcessingNotes(result) {
    const notes = [];

    if (result.categoryValidation.protectedCategories.length > 0) {
      notes.push(`✅ Protected categories maintained: ${result.categoryValidation.protectedCategories.join(', ')}`);
    }

    if (result.internalCategories.length > 0) {
      notes.push(`🔧 Internal categories: ${result.internalCategories.length} assigned for workflow tracking`);
    }

    if (result.suggestedInternalCategories.length > 0) {
      notes.push(`💡 Suggested internal categories: ${result.suggestedInternalCategories.join(', ')}`);
    }

    if (result.categoryValidation.violations.length > 0) {
      notes.push(`⚠️ Category violations detected: ${result.categoryValidation.violations.length}`);
    }

    return notes;
  }

  /**
   * Get all available internal category templates
   * @returns {Object} Internal category templates
   */
  getInternalCategoryTemplates() {
    return { ...this.internalCategoryTemplates };
  }

  /**
   * Create new internal category
   * @param {string} categoryName - Category name (without prefix)
   * @param {string} description - Category description
   * @param {string} group - Category group (workflow, source, performance, etc.)
   * @returns {Object} Created category info
   */
  createInternalCategory(categoryName, description, group = 'custom') {
    if (!categoryName.startsWith(this.options.internalCategoryPrefix)) {
      categoryName = this.options.internalCategoryPrefix + categoryName;
    }

    // Validate category name format
    if (!/^INTERNAL_[A-Z_]+$/.test(categoryName)) {
      throw new Error('Internal category names must be UPPERCASE with underscores only');
    }

    // Add to appropriate group
    if (!this.internalCategoryTemplates[group]) {
      this.internalCategoryTemplates[group] = {};
    }

    this.internalCategoryTemplates[group][categoryName] = description;
    this.stats.internalCategoriesCreated++;

    return {
      categoryName,
      description,
      group,
      isInternal: true,
      created: new Date().toISOString()
    };
  }

  /**
   * Get customer-visible categories only
   * @param {Array} allCategories - All categories
   * @returns {Array} Customer-visible categories only
   */
  getCustomerVisibleCategories(allCategories) {
    return allCategories.filter(category => !this.isInternalCategory(category));
  }

  /**
   * Get internal categories only
   * @param {Array} allCategories - All categories
   * @returns {Array} Internal categories only
   */
  getInternalCategories(allCategories) {
    return allCategories.filter(category => this.isInternalCategory(category));
  }

  /**
   * Get established categories (protected)
   * @returns {Object} Established categories
   */
  getEstablishedCategories() {
    return { ...this.establishedCategories };
  }

  /**
   * Validate category modification is allowed
   * @param {string} categoryName - Category to modify
   * @param {string} operation - Operation type (create, update, delete)
   * @returns {Object} Validation result
   */
  validateCategoryModification(categoryName, operation) {
    const validation = {
      allowed: true,
      reason: null,
      alternative: null
    };

    if (this.options.enableCategoryProtection && this.isProtectedCategory(categoryName)) {
      validation.allowed = false;
      validation.reason = `Cannot ${operation} protected category: ${categoryName}`;
      validation.alternative = 'Consider creating an internal category with INTERNAL_ prefix';
      this.stats.categoryViolations++;
    }

    return validation;
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return { ...this.stats };
  }
}