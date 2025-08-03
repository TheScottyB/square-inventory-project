#!/usr/bin/env node

import { EventEmitter } from 'events';
import OpenAI from 'openai';
import { CatalogObserver } from '../../observability/CatalogObserver.js';

/**
 * MultiCategoryAgent - Handle multi-category names in single field
 * 
 * Manages Square's category system that can contain multiple categories
 * in a single comma-separated field, including:
 * - Category parsing and validation
 * - Hierarchy management (primary/secondary categories)
 * - Category normalization and deduplication
 * - AI-powered category suggestions
 * - Category performance analysis
 */
export class MultiCategoryAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      maxCategoriesPerItem: options.maxCategoriesPerItem || 5,
      categoryHierarchyDepth: options.categoryHierarchyDepth || 3,
      enableAISuggestions: options.enableAISuggestions || true,
      model: options.model || 'gpt-4o-mini',
      ...options
    };

    // Initialize OpenAI if AI suggestions are enabled
    if (this.options.enableAISuggestions) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });

      if (!process.env.OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY not found - AI category suggestions disabled');
        this.options.enableAISuggestions = false;
      }
    }

    // Known category mappings and hierarchies
    this.categoryHierarchy = {
      'Energy & Elements': {
        aliases: ['Energy', 'Elements', 'Energy and Elements'],
        subcategories: ['Crystals', 'Stones', 'Natural Elements'],
        primary: true,
        description: 'Items focused on natural energy and elemental properties'
      },
      'Mind & Clarity': {
        aliases: ['Mind', 'Clarity', 'Mental Clarity'],
        subcategories: ['Meditation', 'Focus', 'Concentration'],
        primary: true,
        description: 'Items that promote mental focus and clarity'
      },
      'Space & Atmosphere': {
        aliases: ['Space', 'Atmosphere', 'Ambiance'],
        subcategories: ['Home Decor', 'Lighting', 'Aromatherapy'],
        primary: true,
        description: 'Items that enhance physical spaces and atmosphere'
      },
      'The Real Rarities': {
        aliases: ['Rarities', 'Rare Items', 'Unique Pieces'],
        subcategories: ['Collectibles', 'One-of-a-Kind', 'Limited Edition'],
        primary: true,
        description: 'Exceptionally rare and unique items'
      },
      'French Collections': {
        aliases: ['French', 'French Items', 'French Antiques'],
        subcategories: ['Vintage French', 'French Decor', 'French Art'],
        primary: true,
        description: 'Items of French origin or style'
      },
      'Spiritual Items': {
        aliases: ['Spiritual', 'Religious', 'Sacred'],
        subcategories: ['Ritual Items', 'Sacred Objects', 'Prayer Items'],
        primary: true,
        description: 'Items with spiritual or religious significance'
      },
      'Vintage & Antique': {
        aliases: ['Vintage', 'Antique', 'Historical'],
        subcategories: ['Pre-1950', '1950s-1980s', 'Century Items'],
        primary: true,
        description: 'Historical items from previous eras'
      },
      'Handmade & Artisan': {
        aliases: ['Handmade', 'Artisan', 'Crafted'],
        subcategories: ['Hand Carved', 'Pottery', 'Metalwork'],
        primary: true,
        description: 'Items created by skilled artisans'
      }
    };

    // Category combinations that work well together
    this.categoryAffinities = {
      'Energy & Elements': ['Spiritual Items', 'Handmade & Artisan'],
      'Mind & Clarity': ['Energy & Elements', 'Spiritual Items'],
      'Vintage & Antique': ['French Collections', 'The Real Rarities'],
      'Handmade & Artisan': ['Energy & Elements', 'Space & Atmosphere']
    };

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/multi-category'
    });

    this.stats = {
      itemsProcessed: 0,
      categoriesNormalized: 0,
      duplicatesRemoved: 0,
      suggestionsGenerated: 0,
      hierarchiesCreated: 0,
      validationErrors: 0
    };
  }

  /**
   * Process and normalize multi-category data for catalog items
   * @param {Array} catalogData - Catalog items to process
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Multi-category processing results
   */
  async processMultiCategories(catalogData, options = {}) {
    const traceId = this.observer.startTrace('process_multi_categories');
    
    try {
      this.observer.log('info', `Processing multi-categories for ${catalogData.length} items`);
      
      const results = {
        totalItems: catalogData.length,
        processedItems: [],
        categoryAnalysis: {
          uniqueCategories: new Set(),
          categoryFrequency: new Map(),
          multiCategoryItems: 0,
          averageCategoriesPerItem: 0
        },
        recommendations: [],
        validationIssues: [],
        normalizationChanges: []
      };

      // Process each item
      for (const item of catalogData) {
        const itemResult = await this.processItemCategories(item, options);
        results.processedItems.push(itemResult);

        // Update analysis
        if (itemResult.categories.length > 1) {
          results.categoryAnalysis.multiCategoryItems++;
        }

        itemResult.categories.forEach(category => {
          results.categoryAnalysis.uniqueCategories.add(category);
          const current = results.categoryAnalysis.categoryFrequency.get(category) || 0;
          results.categoryAnalysis.categoryFrequency.set(category, current + 1);
        });

        // Collect recommendations and issues
        if (itemResult.recommendations.length > 0) {
          results.recommendations.push(...itemResult.recommendations);
        }

        if (itemResult.validationIssues.length > 0) {
          results.validationIssues.push(...itemResult.validationIssues);
        }

        if (itemResult.normalizationChanges.length > 0) {
          results.normalizationChanges.push(...itemResult.normalizationChanges);
        }

        this.stats.itemsProcessed++;
      }

      // Calculate final analysis
      results.categoryAnalysis.averageCategoriesPerItem = 
        results.processedItems.reduce((sum, item) => sum + item.categories.length, 0) / 
        results.processedItems.length;

      // Generate insights
      results.insights = this.generateCategoryInsights(results);

      this.observer.log('info', `Multi-category processing completed: ${results.categoryAnalysis.uniqueCategories.size} unique categories`);
      this.observer.endTrace(traceId, {
        totalItems: results.totalItems,
        uniqueCategories: results.categoryAnalysis.uniqueCategories.size,
        multiCategoryItems: results.categoryAnalysis.multiCategoryItems
      });

      return results;

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw new Error(`Multi-category processing failed: ${error.message}`);
    }
  }

  /**
   * Process categories for individual item
   * @param {Object} item - Catalog item
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Item category processing result
   */
  async processItemCategories(item, options = {}) {
    const result = {
      sku: item.sku || item.itemName,
      itemName: item.itemName,
      originalCategories: item.categories || '',
      categories: [],
      primaryCategory: null,
      secondaryCategories: [],
      categoryHierarchy: [],
      recommendations: [],
      validationIssues: [],
      normalizationChanges: [],
      confidence: 1.0
    };

    try {
      // Step 1: Parse categories from string
      const parsedCategories = this.parseCategories(result.originalCategories);
      
      // Step 2: Normalize and validate categories
      const normalizedCategories = this.normalizeCategories(parsedCategories);
      
      // Step 3: Remove duplicates and invalid categories
      const validCategories = this.validateAndDeduplicateCategories(normalizedCategories);
      
      // Step 4: Establish hierarchy (primary/secondary)
      const categoryHierarchy = this.establishCategoryHierarchy(validCategories);
      
      // Step 5: Generate AI suggestions if enabled
      if (this.options.enableAISuggestions && validCategories.length === 0) {
        const suggestedCategories = await this.generateCategorySuggestions(item);
        if (suggestedCategories.length > 0) {
          result.recommendations.push({
            type: 'ai_suggestion',
            categories: suggestedCategories,
            reason: 'No valid categories found, AI suggested alternatives'
          });
        }
      }

      // Update result
      result.categories = validCategories;
      result.primaryCategory = categoryHierarchy.primary;
      result.secondaryCategories = categoryHierarchy.secondary;
      result.categoryHierarchy = categoryHierarchy.hierarchy;

      // Track changes
      if (parsedCategories.join(',') !== normalizedCategories.join(',')) {
        result.normalizationChanges.push({
          from: parsedCategories,
          to: normalizedCategories,
          reason: 'Category normalization'
        });
        this.stats.categoriesNormalized++;
      }

      // Validate category count
      if (result.categories.length > this.options.maxCategoriesPerItem) {
        result.validationIssues.push({
          type: 'too_many_categories',
          count: result.categories.length,
          limit: this.options.maxCategoriesPerItem
        });
        this.stats.validationErrors++;
      }

      // Check for category affinity recommendations
      const affinityRecommendations = this.checkCategoryAffinities(result.categories);
      if (affinityRecommendations.length > 0) {
        result.recommendations.push({
          type: 'affinity_suggestion',
          categories: affinityRecommendations,
          reason: 'Categories that work well together'
        });
      }

    } catch (error) {
      result.validationIssues.push({
        type: 'processing_error',
        error: error.message
      });
      this.stats.validationErrors++;
    }

    return result;
  }

  /**
   * Parse categories from comma-separated string
   * @param {string} categoryString - Category string to parse
   * @returns {Array} Parsed categories
   */
  parseCategories(categoryString) {
    if (!categoryString || typeof categoryString !== 'string') {
      return [];
    }

    return categoryString
      .split(',')
      .map(cat => cat.trim())
      .filter(cat => cat.length > 0)
      .filter(cat => cat !== 'Default Title' && cat !== 'Uncategorized');
  }

  /**
   * Normalize category names using known mappings
   * @param {Array} categories - Categories to normalize
   * @returns {Array} Normalized categories
   */
  normalizeCategories(categories) {
    const normalized = [];

    categories.forEach(category => {
      let normalizedCategory = category;

      // Check for exact matches or aliases
      for (const [standardName, config] of Object.entries(this.categoryHierarchy)) {
        if (standardName === category || config.aliases.includes(category)) {
          normalizedCategory = standardName;
          break;
        }
      }

      // Check for partial matches (fuzzy matching)
      if (normalizedCategory === category) {
        for (const [standardName, config] of Object.entries(this.categoryHierarchy)) {
          if (this.fuzzyMatchCategory(category, standardName) || 
              config.aliases.some(alias => this.fuzzyMatchCategory(category, alias))) {
            normalizedCategory = standardName;
            break;
          }
        }
      }

      normalized.push(normalizedCategory);
    });

    return normalized;
  }

  /**
   * Fuzzy match category names
   * @param {string} input - Input category
   * @param {string} target - Target category
   * @returns {boolean} Is fuzzy match
   */
  fuzzyMatchCategory(input, target) {
    const inputLower = input.toLowerCase();
    const targetLower = target.toLowerCase();
    
    // Simple fuzzy matching - contains key words
    const inputWords = inputLower.split(/\s+/);
    const targetWords = targetLower.split(/\s+/);
    
    return inputWords.some(word => 
      targetWords.some(targetWord => 
        word.includes(targetWord) || targetWord.includes(word)
      )
    );
  }

  /**
   * Validate and remove duplicate categories
   * @param {Array} categories - Categories to validate
   * @returns {Array} Valid, deduplicated categories
   */
  validateAndDeduplicateCategories(categories) {
    const seen = new Set();
    const valid = [];

    categories.forEach(category => {
      // Remove duplicates
      if (seen.has(category)) {
        this.stats.duplicatesRemoved++;
        return;
      }

      // Validate category exists in hierarchy
      if (this.categoryHierarchy[category]) {
        seen.add(category);
        valid.push(category);
      }
    });

    return valid;
  }

  /**
   * Establish category hierarchy (primary/secondary)
   * @param {Array} categories - Valid categories
   * @returns {Object} Category hierarchy
   */
  establishCategoryHierarchy(categories) {
    const hierarchy = {
      primary: null,
      secondary: [],
      hierarchy: []
    };

    // Sort by importance (primary categories first)
    const sortedCategories = categories.sort((a, b) => {
      const aConfig = this.categoryHierarchy[a];
      const bConfig = this.categoryHierarchy[b];
      
      if (aConfig?.primary && !bConfig?.primary) return -1;
      if (!aConfig?.primary && bConfig?.primary) return 1;
      return 0;
    });

    if (sortedCategories.length > 0) {
      hierarchy.primary = sortedCategories[0];
      hierarchy.secondary = sortedCategories.slice(1);
      hierarchy.hierarchy = sortedCategories;
    }

    if (hierarchy.hierarchy.length > 0) {
      this.stats.hierarchiesCreated++;
    }

    return hierarchy;
  }

  /**
   * Generate AI-powered category suggestions
   * @param {Object} item - Item to suggest categories for
   * @returns {Promise<Array>} Suggested categories
   */
  async generateCategorySuggestions(item) {
    if (!this.options.enableAISuggestions) {
      return [];
    }

    try {
      const availableCategories = Object.keys(this.categoryHierarchy);
      
      const prompt = `Suggest appropriate categories for this product:

PRODUCT:
Name: ${item.itemName}
Description: ${item.description || 'No description'}

AVAILABLE CATEGORIES:
${availableCategories.map(cat => `- ${cat}: ${this.categoryHierarchy[cat].description}`).join('\n')}

Analyze the product and suggest 1-3 most appropriate categories from the available list.
Consider the item's characteristics, purpose, and target audience.

Return only a JSON array of category names:
["Category 1", "Category 2"]`;

      const completion = await this.openai.chat.completions.create({
        model: this.options.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert product categorization specialist. Analyze products and suggest the most appropriate categories from the provided list. Only return valid JSON arrays with category names that exactly match the provided options.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      });

      const suggestions = JSON.parse(completion.choices[0].message.content);
      this.stats.suggestionsGenerated++;
      
      // Validate suggestions are in our hierarchy
      return suggestions.filter(cat => this.categoryHierarchy[cat]);

    } catch (error) {
      this.observer.log('warn', `AI category suggestion failed for ${item.itemName}: ${error.message}`);
      return [];
    }
  }

  /**
   * Check for category affinity recommendations
   * @param {Array} currentCategories - Current item categories
   * @returns {Array} Recommended additional categories
   */
  checkCategoryAffinities(currentCategories) {
    const recommendations = [];
    
    currentCategories.forEach(category => {
      const affinities = this.categoryAffinities[category];
      if (affinities) {
        affinities.forEach(affinity => {
          if (!currentCategories.includes(affinity)) {
            recommendations.push(affinity);
          }
        });
      }
    });

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Generate category insights and recommendations
   * @param {Object} results - Processing results
   * @returns {Object} Category insights
   */
  generateCategoryInsights(results) {
    const insights = {
      summary: [],
      recommendations: [],
      patterns: []
    };

    // Most common categories
    const sortedCategories = Array.from(results.categoryAnalysis.categoryFrequency.entries())
      .sort((a, b) => b[1] - a[1]);

    if (sortedCategories.length > 0) {
      insights.summary.push(`Most common category: ${sortedCategories[0][0]} (${sortedCategories[0][1]} items)`);
    }

    // Multi-category analysis
    const multiCategoryPercentage = (results.categoryAnalysis.multiCategoryItems / results.totalItems) * 100;
    insights.summary.push(`${multiCategoryPercentage.toFixed(1)}% of items have multiple categories`);

    // Average categories per item
    insights.summary.push(`Average ${results.categoryAnalysis.averageCategoriesPerItem.toFixed(1)} categories per item`);

    // Recommendations
    if (results.recommendations.length > 0) {
      insights.recommendations.push(`${results.recommendations.length} category improvement suggestions available`);
    }

    if (results.validationIssues.length > 0) {
      insights.recommendations.push(`${results.validationIssues.length} items need category validation`);
    }

    // Patterns
    if (results.categoryAnalysis.uniqueCategories.size < 10) {
      insights.patterns.push('Limited category diversity - consider expanding category structure');
    }

    if (multiCategoryPercentage > 50) {
      insights.patterns.push('High multi-category usage - good for discoverability');
    }

    return insights;
  }

  /**
   * Get category hierarchy information
   * @returns {Object} Category hierarchy
   */
  getCategoryHierarchy() {
    return { ...this.categoryHierarchy };
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return { ...this.stats };
  }
}