import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import { CatalogObserver } from '../observability/CatalogObserver.js';

/**
 * CorrectSKUAgent - SKU generation based on ACTUAL Square catalog structure
 * 
 * Uses correct column mapping from real Square export:
 * - Column 2: Item Name
 * - Column 3: Variation Name  
 * - Column 4: SKU (target column)
 * - Column 6: Categories
 * - Column 28/29: Option Name 1/Value 1
 * - Column 30/31: Option Name 2/Value 2
 * 
 * Handles:
 * - Variations grouped by Item Name
 * - 68% of products missing SKUs (expected)
 * - Standard Square variation structure
 * - Proper category-based SKU prefixes
 */
export class CorrectSKUAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      brandPrefix: options.brandPrefix || 'RRV',
      sequenceLength: options.sequenceLength || 3,
      enableDryRun: options.enableDryRun || false,
      preserveExisting: options.preserveExisting || true,
      maxSkuLength: options.maxSkuLength || 20,
      variationSeparator: options.variationSeparator || '-',
      ...options
    };

    // Correct column mapping from actual Square export
    this.columnMap = {
      itemName: 2,
      variationName: 3,  
      sku: 4,
      categories: 6,
      optionName1: 28,
      optionValue1: 29,
      optionName2: 30,
      optionValue2: 31
    };

    // Real category mappings from the actual catalog
    this.categoryCodeMap = {
      'Energy & Elements': 'EE',
      'Mind & Clarity': 'MC',
      'Space & Atmosphere': 'SA', 
      'TBDL Picks': 'TB',
      'TBDLabz Exclusive': 'EX',
      'The Apothecary Cabinet': 'AC',
      'The New Finds': 'NF',
      'The New Things': 'NT',
      'The Real Rarities': 'RR',
      'Updates': 'UP',
      'jewelry': 'JW',
      'miscellaneous': 'MS',
      '🇫🇷 Classic Beauty': 'CB',
      '🇫🇷 Expressly TVM': 'TV',
      '🇫🇷 Timeless Treasures': 'TT',
      '🇫🇷 Whimsical Gifts': 'WG',
      'default': 'GN'
    };

    // Variation abbreviations for common values
    this.variationAbbrev = {
      // Common colors
      'black': 'BLK',
      'white': 'WHT', 
      'red': 'RED',
      'blue': 'BLU',
      'green': 'GRN',
      'purple': 'PRP',
      'pink': 'PNK',
      'yellow': 'YLW',
      'orange': 'ORG',
      'gray': 'GRY',
      'grey': 'GRY',
      'brown': 'BRN',
      'silver': 'SLV',
      'gold': 'GLD',
      
      // Common sizes  
      'small': 'S',
      'medium': 'M',
      'large': 'L',
      'extra large': 'XL',
      'standard': 'STD',
      'default title': 'DEF',
      
      // Common materials
      'steel': 'STL',
      'metal': 'MTL',
      'wood': 'WOD',
      'glass': 'GLS'
    };

    // State tracking
    this.productGroups = new Map();
    this.sequenceCounters = new Map();
    this.existingSKUs = new Set();
    
    this.stats = {
      totalRows: 0,
      uniqueProducts: 0,
      skusGenerated: 0,
      skusPreserved: 0,
      variationsProcessed: 0,
      errors: []
    };

    // Initialize observability  
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/correct-sku-generation'
    });
  }

  /**
   * Generate SKUs for entire catalog using correct structure
   * @param {Array} catalogData - Raw catalog rows
   * @returns {Promise<Object>} Generation results
   */
  async generateCorrectSKUs(catalogData) {
    const traceId = this.observer.startTrace('generate_correct_skus');
    
    try {
      this.observer.log('info', `Starting correct SKU generation for ${catalogData.length} rows`);
      
      // Step 1: Group products by Item Name  
      const productGroups = await this.groupProductsByItemName(catalogData);
      
      // Step 2: Initialize existing SKUs and sequences
      await this.initializeExistingData(catalogData);
      
      // Step 3: Generate SKUs for each product group
      const results = await this.generateSKUsForGroups(catalogData, productGroups);
      
      // Step 4: Generate report
      const report = await this.generateSKUReport(results);
      
      this.observer.log('info', `SKU generation completed: ${this.stats.skusGenerated} generated`);
      this.observer.endTrace(traceId, this.stats);
      
      return {
        success: true,
        catalogData: results,
        productGroups,
        stats: this.stats,
        report
      };

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Group products by Item Name to handle variations correctly
   * @param {Array} catalogData - Catalog rows
   * @returns {Promise<Map>} Product groups
   */
  async groupProductsByItemName(catalogData) {
    const traceId = this.observer.startTrace('group_products');
    
    try {
      const productGroups = new Map();
      const items = catalogData.slice(1); // Skip header
      
      items.forEach((row, index) => {
        const itemName = row[this.columnMap.itemName];
        const variationName = row[this.columnMap.variationName];
        const categories = row[this.columnMap.categories];
        const currentSKU = row[this.columnMap.sku];
        
        if (!itemName) return;
        
        if (!productGroups.has(itemName)) {
          productGroups.set(itemName, {
            itemName,
            category: this.extractPrimaryCategory(categories),
            variations: [],
            firstRowIndex: index + 1,
            baseSKU: null
          });
        }
        
        const group = productGroups.get(itemName);
        group.variations.push({
          rowIndex: index + 1,
          variationName: variationName || 'Standard',
          currentSKU,
          optionValue1: row[this.columnMap.optionValue1],
          optionValue2: row[this.columnMap.optionValue2]
        });
      });
      
      this.stats.totalRows = items.length;
      this.stats.uniqueProducts = productGroups.size;
      
      this.observer.log('info', `Grouped ${items.length} rows into ${productGroups.size} unique products`);
      this.observer.endTrace(traceId, { uniqueProducts: productGroups.size });
      
      return productGroups;

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Generate SKUs for all product groups
   * @param {Array} catalogData - Original catalog  
   * @param {Map} productGroups - Grouped products
   * @returns {Promise<Array>} Updated catalog with SKUs
   */
  async generateSKUsForGroups(catalogData, productGroups) {
    const results = [...catalogData]; // Copy entire catalog
    
    // First pass: Generate base SKUs for each product group
    for (const [itemName, group] of productGroups) {
      const baseSKU = await this.generateBaseSKU(group);
      group.baseSKU = baseSKU;
    }
    
    // Second pass: Apply SKUs to all rows
    const items = catalogData.slice(1);
    
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const resultRowIndex = i + 1; // Account for header
      const itemName = row[this.columnMap.itemName];
      const currentSKU = row[this.columnMap.sku];
      
      if (!itemName) continue;
      
      const group = productGroups.get(itemName);
      if (!group) continue;
      
      try {
        // Decision: preserve existing or generate new
        if (currentSKU && this.isValidExistingSKU(currentSKU) && this.options.preserveExisting) {
          // Keep existing SKU
          this.stats.skusPreserved++;
          this.observer.log('debug', `Preserved SKU for ${itemName}: ${currentSKU}`);
        } else {
          // Generate new SKU
          const newSKU = this.generateVariationSKU(
            group.baseSKU,
            row[this.columnMap.optionValue1],
            row[this.columnMap.optionValue2]
          );
          
          results[resultRowIndex][this.columnMap.sku] = newSKU;
          this.stats.skusGenerated++;
          this.existingSKUs.add(newSKU);
          
          this.observer.log('debug', `Generated SKU for ${itemName}: ${newSKU}`);
        }
        
        if (row[this.columnMap.variationName] && row[this.columnMap.variationName] !== 'Standard') {
          this.stats.variationsProcessed++;
        }

      } catch (error) {
        this.observer.log('error', `Failed to process SKU for ${itemName}: ${error.message}`);
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
   * Generate base SKU for product group
   * @param {Object} group - Product group
   * @returns {Promise<string>} Base SKU
   */
  async generateBaseSKU(group) {
    const categoryCode = this.getCategoryCode(group.category);
    const sequence = this.getNextSequence(categoryCode);
    
    return `${this.options.brandPrefix}-${categoryCode}-${sequence.toString().padStart(this.options.sequenceLength, '0')}`;
  }

  /**
   * Generate variation SKU with options
   * @param {string} baseSKU - Base product SKU
   * @param {string} option1 - First option value
   * @param {string} option2 - Second option value  
   * @returns {string} Complete variation SKU
   */
  generateVariationSKU(baseSKU, option1, option2) {
    const parts = [baseSKU];
    
    if (option1 && option1 !== 'Standard' && option1 !== 'Default Title') {
      const abbrev1 = this.abbreviateOption(option1);
      if (abbrev1) parts.push(abbrev1);
    }
    
    if (option2 && option2 !== 'Standard' && option2 !== 'Default Title') {
      const abbrev2 = this.abbreviateOption(option2);
      if (abbrev2) parts.push(abbrev2);
    }
    
    let sku = parts.join(this.options.variationSeparator);
    
    // Ensure length limit
    if (sku.length > this.options.maxSkuLength) {
      sku = this.truncateSKU(baseSKU, option1, option2);
    }
    
    return sku;
  }

  /**
   * Abbreviate option value intelligently
   * @param {string} value - Option value to abbreviate
   * @returns {string} Abbreviated value
   */
  abbreviateOption(value) {
    if (!value) return '';
    
    const normalized = value.toLowerCase().trim();
    
    // Check predefined abbreviations
    if (this.variationAbbrev[normalized]) {
      return this.variationAbbrev[normalized];
    }
    
    // Handle complex variation names with dimensions
    if (value.includes('x') && value.includes('Centimeters')) {
      // Extract dimensions: "30L x 30W x 3Th Centimeters" -> "30X30X3"
      const dimensions = value.match(/\d+/g);
      if (dimensions && dimensions.length >= 2) {
        return dimensions.slice(0, 3).join('X');
      }
    }
    
    // Handle simple numeric values
    if (/^\d+$/.test(value)) {
      return value;
    }
    
    // Create abbreviation from first letters or characters
    if (value.length <= 4) {
      return value.toUpperCase();
    }
    
    // Multi-word: first letter of each word
    const words = normalized.split(/[\s-]+/);
    if (words.length > 1) {
      return words.map(w => w[0]).join('').toUpperCase().substring(0, 4);
    }
    
    // Single word: first 3-4 characters
    return normalized.substring(0, 4).toUpperCase();
  }

  /**
   * Extract primary category from categories string
   * @param {string} categories - Comma-separated categories
   * @returns {string} Primary category
   */
  extractPrimaryCategory(categories) {
    if (!categories || !categories.trim()) {
      return 'default';
    }
    
    const categoryList = categories.split(',').map(cat => cat.trim());
    
    // Priority order based on actual catalog structure
    const priorityCategories = [
      '🇫🇷 Expressly TVM',
      'The Apothecary Cabinet',
      'TBDLabz Exclusive',
      'The Real Rarities',
      '🇫🇷 Whimsical Gifts',
      'Energy & Elements'
    ];
    
    for (const priority of priorityCategories) {
      if (categoryList.includes(priority)) {
        return priority;
      }
    }
    
    return categoryList[0] || 'default';
  }

  /**
   * Get category code for category name
   * @param {string} category - Category name
   * @returns {string} Category code
   */
  getCategoryCode(category) {
    return this.categoryCodeMap[category] || this.categoryCodeMap['default'];
  }

  /**
   * Get next sequence number for category
   * @param {string} categoryCode - Category code
   * @returns {number} Next sequence
   */
  getNextSequence(categoryCode) {
    const current = this.sequenceCounters.get(categoryCode) || 0;
    const next = current + 1;
    this.sequenceCounters.set(categoryCode, next);
    return next;
  }

  /**
   * Initialize existing SKUs and sequence counters
   * @param {Array} catalogData - Catalog data
   */
  async initializeExistingData(catalogData) {
    const items = catalogData.slice(1);
    
    items.forEach(row => {
      const sku = row[this.columnMap.sku];
      if (sku && sku.trim()) {
        this.existingSKUs.add(sku.trim());
        
        // Try to extract sequence from our format
        const match = sku.match(new RegExp(`^${this.options.brandPrefix}-([A-Z]{2,3})-(\\d+)`));
        if (match) {
          const categoryCode = match[1];
          const sequence = parseInt(match[2], 10);
          const current = this.sequenceCounters.get(categoryCode) || 0;
          this.sequenceCounters.set(categoryCode, Math.max(current, sequence));
        }
      }
    });
    
    this.observer.log('info', `Initialized ${this.existingSKUs.size} existing SKUs`);
  }

  /**
   * Check if existing SKU should be preserved
   * @param {string} sku - SKU to check
   * @returns {boolean} Should preserve
   */
  isValidExistingSKU(sku) {
    if (!sku || sku.toLowerCase() === 'default title') {
      return false;
    }
    
    // Our standard format
    if (new RegExp(`^${this.options.brandPrefix}-[A-Z]{2,3}-\\d+`).test(sku)) {
      return true;
    }
    
    // Other valid patterns
    const validPatterns = [
      /^[A-F0-9]+_\d+$/, // Hex underscore
      /^SKU_\d+$/, // SKU prefix
      /^[A-Z0-9]{4,12}$/ // Simple alphanumeric
    ];
    
    return validPatterns.some(pattern => pattern.test(sku)) && sku.length <= this.options.maxSkuLength;
  }

  /**
   * Truncate SKU if too long
   * @param {string} baseSKU - Base SKU
   * @param {string} opt1 - Option 1
   * @param {string} opt2 - Option 2  
   * @returns {string} Truncated SKU
   */
  truncateSKU(baseSKU, opt1, opt2) {
    // Use shorter abbreviations
    const short1 = opt1 ? opt1.substring(0, 2).toUpperCase() : '';
    const short2 = opt2 ? opt2.substring(0, 2).toUpperCase() : '';
    
    const parts = [baseSKU];
    if (short1) parts.push(short1);
    if (short2) parts.push(short2);
    
    return parts.join(this.options.variationSeparator);
  }

  /**
   * Generate comprehensive SKU report
   * @param {Array} results - Updated catalog
   * @returns {Promise<Object>} Report
   */
  async generateSKUReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalRows: this.stats.totalRows,
        uniqueProducts: this.stats.uniqueProducts,
        skusGenerated: this.stats.skusGenerated,
        skusPreserved: this.stats.skusPreserved,
        variationsProcessed: this.stats.variationsProcessed,
        errors: this.stats.errors.length
      },
      categoryBreakdown: this.generateCategoryBreakdown(),
      recommendations: this.generateRecommendations()
    };
    
    // Save report
    const reportPath = path.join(process.cwd(), 'reports', `correct-sku-report-${Date.now()}.json`);
    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    this.observer.log('info', `SKU report saved: ${reportPath}`);
    
    return report;
  }

  /**
   * Generate category breakdown
   * @returns {Object} Category stats
   */
  generateCategoryBreakdown() {
    const breakdown = {};
    
    for (const [categoryCode, count] of this.sequenceCounters.entries()) {
      const categoryName = Object.keys(this.categoryCodeMap).find(
        key => this.categoryCodeMap[key] === categoryCode
      ) || 'Unknown';
      
      breakdown[categoryCode] = {
        categoryName,
        sequenceCount: count,
        nextSequence: count + 1
      };
    }
    
    return breakdown;
  }

  /**
   * Generate recommendations
   * @returns {Array} Recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    
    if (this.stats.errors.length > 0) {
      recommendations.push(`${this.stats.errors.length} SKU generation errors - manual review needed`);
    }
    
    const generationRate = (this.stats.skusGenerated / this.stats.totalRows) * 100;
    if (generationRate > 50) {
      recommendations.push(`${generationRate.toFixed(1)}% of items needed new SKUs - consider automated SKU generation for new products`);
    }
    
    if (this.stats.variationsProcessed > 100) {
      recommendations.push('Large number of variations processed - verify SKU patterns are logical');
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
      sequenceCounters: Object.fromEntries(this.sequenceCounters),
      existingSKUCount: this.existingSKUs.size
    };
  }
}