import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import { CatalogObserver } from '../observability/CatalogObserver.js';

/**
 * CorrectCategorizationAgent - Fixed categorization using correct column mapping
 * 
 * Based on fresh analysis of actual Square catalog export:
 * - Column 6 contains the real categories (comma-separated)
 * - NOT parsing item names as categories
 * - 16 real categories identified in the catalog
 * - Handles multi-category assignments properly
 */
export class CorrectCategorizationAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      preserveExisting: options.preserveExisting || true,
      maxCategories: options.maxCategories || 3,
      enableCategoryMapping: options.enableCategoryMapping || true,
      ...options
    };

    // Correct column mapping from actual Square export
    this.columnMap = {
      itemName: 2,
      variationName: 3,
      sku: 4,
      categories: 6,
      description: 7,
      permalink: 8
    };

    // The 16 real categories found in the catalog
    this.realCategories = new Set([
      'Energy & Elements',
      'Mind & Clarity', 
      'Space & Atmosphere',
      'TBDL Picks',
      'TBDLabz Exclusive',
      'The Apothecary Cabinet',
      'The New Finds',
      'The New Things',
      'The Real Rarities',
      'Updates',
      'jewelry',
      'miscellaneous',
      '🇫🇷 Classic Beauty',
      '🇫🇷 Expressly TVM',
      '🇫🇷 Timeless Treasures',
      '🇫🇷 Whimsical Gifts'
    ]);

    // Category hierarchy for better organization
    this.categoryHierarchy = {
      // Main brand categories
      'brand': [
        '🇫🇷 Expressly TVM',
        '🇫🇷 Classic Beauty', 
        '🇫🇷 Timeless Treasures',
        '🇫🇷 Whimsical Gifts'
      ],
      
      // Product type categories
      'product': [
        'jewelry',
        'miscellaneous'
      ],
      
      // Collection categories
      'collection': [
        'The Apothecary Cabinet',
        'The Real Rarities',
        'TBDLabz Exclusive',
        'The New Finds',
        'The New Things'
      ],
      
      // Conceptual categories
      'concept': [
        'Energy & Elements',
        'Mind & Clarity',
        'Space & Atmosphere'
      ],
      
      // Status categories
      'status': [
        'TBDL Picks',
        'Updates'
      ]
    };

    // Category suggestions based on item analysis
    this.categoryMapping = {
      // Jewelry patterns
      'bracelet': ['jewelry'],
      'necklace': ['jewelry'],
      'earrings': ['jewelry'], 
      'ring': ['jewelry'],
      'jewelry': ['jewelry'],
      
      // French collections
      'vintage': ['🇫🇷 Classic Beauty'],
      'antique': ['🇫🇷 Timeless Treasures'],
      'whimsical': ['🇫🇷 Whimsical Gifts'],
      
      // Specialty collections
      'rare': ['The Real Rarities'],
      'exclusive': ['TBDLabz Exclusive'],
      'apothecary': ['The Apothecary Cabinet'],
      
      // Conceptual
      'energy': ['Energy & Elements'],
      'crystal': ['Energy & Elements', 'Mind & Clarity'],
      'meditation': ['Mind & Clarity'],
      'spiritual': ['Space & Atmosphere']
    };

    // State tracking
    this.stats = {
      totalRows: 0,
      itemsProcessed: 0,
      categoriesFixed: 0,
      categoriesAdded: 0,
      categoriesPreserved: 0,
      uniqueProducts: 0,
      errors: [],
      categoryDistribution: new Map()
    };

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/correct-categorization'
    });
  }

  /**
   * Process categorization for entire catalog
   * @param {Array} catalogData - Raw catalog rows
   * @returns {Promise<Object>} Processing results
   */
  async processCorrectCategorization(catalogData) {
    const traceId = this.observer.startTrace('process_correct_categorization');
    
    try {
      this.observer.log('info', `Starting correct categorization for ${catalogData.length} rows`);
      
      // Step 1: Analyze existing category structure
      const categoryAnalysis = await this.analyzeCategoryStructure(catalogData);
      
      // Step 2: Process each row for categorization
      const results = await this.processCategorizationRows(catalogData);
      
      // Step 3: Generate category report
      const report = await this.generateCategorizationReport(results, categoryAnalysis);
      
      this.observer.log('info', `Categorization completed: ${this.stats.categoriesFixed} fixed, ${this.stats.categoriesAdded} added`);
      this.observer.endTrace(traceId, this.stats);
      
      return {
        success: true,
        catalogData: results,
        categoryAnalysis,
        stats: this.stats,
        report
      };

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Analyze current category structure in catalog
   * @param {Array} catalogData - Catalog rows
   * @returns {Promise<Object>} Category analysis
   */
  async analyzeCategoryStructure(catalogData) {
    const traceId = this.observer.startTrace('analyze_category_structure');
    
    try {
      const categoryStats = new Map();
      const items = catalogData.slice(1); // Skip header
      const uniqueProducts = new Set();
      
      items.forEach((row, index) => {
        const itemName = row[this.columnMap.itemName];
        const categories = row[this.columnMap.categories];
        
        if (!itemName) return;
        
        uniqueProducts.add(itemName);
        
        if (categories && categories.trim()) {
          const categoryList = this.parseCategoriesFromString(categories);
          
          categoryList.forEach(category => {
            const count = categoryStats.get(category) || 0;
            categoryStats.set(category, count + 1);
            
            // Track for final stats
            const statCount = this.stats.categoryDistribution.get(category) || 0;
            this.stats.categoryDistribution.set(category, statCount + 1);
          });
        }
      });
      
      this.stats.totalRows = items.length;
      this.stats.uniqueProducts = uniqueProducts.size;
      
      const analysis = {
        totalCategories: categoryStats.size,
        categoryBreakdown: Object.fromEntries(categoryStats),
        realCategories: Array.from(this.realCategories),
        missingCategories: this.findMissingCategories(categoryStats),
        categoryHierarchy: this.categoryHierarchy
      };
      
      this.observer.log('info', `Found ${categoryStats.size} categories across ${items.length} rows`);
      this.observer.endTrace(traceId, analysis);
      
      return analysis;

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Process categorization for all rows
   * @param {Array} catalogData - Original catalog
   * @returns {Promise<Array>} Updated catalog
   */
  async processCategorizationRows(catalogData) {
    const results = [...catalogData]; // Copy entire catalog
    const items = catalogData.slice(1);
    
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const resultRowIndex = i + 1; // Account for header
      const itemName = row[this.columnMap.itemName];
      const currentCategories = row[this.columnMap.categories];
      
      if (!itemName) continue;
      
      try {
        // Process categories for this item
        const newCategories = await this.processItemCategories(
          itemName,
          currentCategories,
          row
        );
        
        // Update if categories changed
        if (newCategories !== currentCategories) {
          results[resultRowIndex][this.columnMap.categories] = newCategories;
          
          if (!currentCategories || !currentCategories.trim()) {
            this.stats.categoriesAdded++;
          } else {
            this.stats.categoriesFixed++;
          }
          
          this.observer.log('debug', `Updated categories for ${itemName}: ${newCategories}`);
        } else {
          this.stats.categoriesPreserved++;
        }
        
        this.stats.itemsProcessed++;

      } catch (error) {
        this.observer.log('error', `Failed to process categories for ${itemName}: ${error.message}`);
        this.stats.errors.push({
          rowIndex: resultRowIndex,
          itemName,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Process categories for individual item
   * @param {string} itemName - Item name
   * @param {string} currentCategories - Current category string
   * @param {Array} row - Full row data
   * @returns {Promise<string>} Updated category string
   */
  async processItemCategories(itemName, currentCategories, row) {
    // Parse existing categories
    const existingCategories = this.parseCategoriesFromString(currentCategories);
    
    // Filter out invalid categories (this was the main bug)
    const validCategories = existingCategories.filter(cat => 
      this.realCategories.has(cat)
    );
    
    // If we have valid categories and preserve existing is enabled
    if (validCategories.length > 0 && this.options.preserveExisting) {
      return this.formatCategoriesString(validCategories);
    }
    
    // Generate suggested categories if needed
    if (validCategories.length === 0 || !this.options.preserveExisting) {
      const suggestedCategories = await this.suggestCategories(itemName, row);
      
      // Combine valid existing with suggestions
      const combinedCategories = [...new Set([...validCategories, ...suggestedCategories])];
      
      // Limit to max categories
      const finalCategories = combinedCategories.slice(0, this.options.maxCategories);
      
      return this.formatCategoriesString(finalCategories);
    }
    
    return this.formatCategoriesString(validCategories);
  }

  /**
   * Suggest categories based on item analysis
   * @param {string} itemName - Item name
   * @param {Array} row - Row data
   * @returns {Promise<Array>} Suggested categories
   */
  async suggestCategories(itemName, row) {
    const suggestions = [];
    const description = row[this.columnMap.description] || '';
    const analysisText = (itemName + ' ' + description).toLowerCase();
    
    // Check category mapping patterns
    for (const [pattern, categories] of Object.entries(this.categoryMapping)) {
      if (analysisText.includes(pattern.toLowerCase())) {
        suggestions.push(...categories);
      }
    }
    
    // Default fallback category
    if (suggestions.length === 0) {
      // Analyze item name for clues
      if (analysisText.includes('vintage') || analysisText.includes('antique')) {
        suggestions.push('🇫🇷 Classic Beauty');
      } else if (analysisText.includes('new') || analysisText.includes('latest')) {
        suggestions.push('The New Things');
      } else {
        suggestions.push('miscellaneous');
      }
    }
    
    // Remove duplicates and limit
    return [...new Set(suggestions)].slice(0, this.options.maxCategories);
  }

  /**
   * Parse categories from string, handling Square's format
   * @param {string} categoryString - Category string
   * @returns {Array} Category array
   */
  parseCategoriesFromString(categoryString) {
    if (!categoryString || !categoryString.trim()) {
      return [];
    }
    
    // Split by comma and clean up
    return categoryString
      .split(',')
      .map(cat => cat.trim())
      .filter(cat => cat.length > 0)
      .filter(cat => cat !== 'Default Category'); // Filter out Square defaults
  }

  /**
   * Format categories back to string
   * @param {Array} categories - Category array
   * @returns {string} Formatted string
   */
  formatCategoriesString(categories) {
    if (!categories || categories.length === 0) {
      return '';
    }
    
    return categories.join(', ');
  }

  /**
   * Find categories that are missing from catalog
   * @param {Map} existingCategories - Current category stats
   * @returns {Array} Missing categories
   */
  findMissingCategories(existingCategories) {
    const missing = [];
    
    for (const realCategory of this.realCategories) {
      if (!existingCategories.has(realCategory)) {
        missing.push(realCategory);
      }
    }
    
    return missing;
  }

  /**
   * Generate comprehensive categorization report
   * @param {Array} results - Updated catalog
   * @param {Object} categoryAnalysis - Category analysis
   * @returns {Promise<Object>} Report
   */
  async generateCategorizationReport(results, categoryAnalysis) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalRows: this.stats.totalRows,
        uniqueProducts: this.stats.uniqueProducts,
        itemsProcessed: this.stats.itemsProcessed,
        categoriesFixed: this.stats.categoriesFixed,
        categoriesAdded: this.stats.categoriesAdded,
        categoriesPreserved: this.stats.categoriesPreserved,
        errors: this.stats.errors.length
      },
      categoryAnalysis,
      categoryDistribution: Object.fromEntries(this.stats.categoryDistribution),
      recommendations: this.generateCategorizationRecommendations()
    };
    
    // Save report
    const reportPath = path.join(process.cwd(), 'reports', `categorization-report-${Date.now()}.json`);
    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    this.observer.log('info', `Categorization report saved: ${reportPath}`);
    
    return report;
  }

  /**
   * Generate categorization recommendations
   * @returns {Array} Recommendations
   */
  generateCategorizationRecommendations() {
    const recommendations = [];
    
    if (this.stats.errors.length > 0) {
      recommendations.push(`${this.stats.errors.length} categorization errors - manual review needed`);
    }
    
    const addedRate = (this.stats.categoriesAdded / this.stats.totalRows) * 100;
    if (addedRate > 20) {
      recommendations.push(`${addedRate.toFixed(1)}% of items needed new categories - consider automated categorization for new products`);
    }
    
    const preservedRate = (this.stats.categoriesPreserved / this.stats.totalRows) * 100;
    if (preservedRate > 70) {
      recommendations.push(`${preservedRate.toFixed(1)}% of categories were preserved - good existing category structure`);
    }
    
    if (this.stats.categoryDistribution.size < 10) {
      recommendations.push('Limited category diversity - consider expanding category structure');
    }
    
    return recommendations;
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return {
      ...this.stats,
      categoryDistribution: Object.fromEntries(this.stats.categoryDistribution)
    };
  }
}