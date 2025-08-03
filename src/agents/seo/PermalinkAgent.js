#!/usr/bin/env node

import { EventEmitter } from 'events';
import { CatalogObserver } from '../observability/CatalogObserver.js';

/**
 * PermalinkAgent - Intelligent permalink generation
 * 
 * Generates SEO-optimized, user-friendly permalinks including:
 * - Product-focused URLs
 * - Category-based structures  
 * - SEO keyword integration
 * - Multiple permalink variations
 * - URL best practices validation
 */
export class PermalinkAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      maxUrlLength: options.maxUrlLength || 100,
      baseUrl: options.baseUrl || '/products',
      categoryIntegration: options.categoryIntegration || 'optional',
      seoOptimization: options.seoOptimization || true,
      ...options
    };

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/permalinks'
    });

    // URL structure patterns
    this.urlPatterns = {
      product: '/products/{slug}',
      categoryProduct: '/{category}/products/{slug}',
      hierarchical: '/{category}/{subcategory}/{slug}',
      seoOptimized: '/{keywords}/{slug}',
      simple: '/{slug}'
    };

    // Category mappings for URL-friendly names
    this.categoryMappings = {
      'Energy & Elements': 'energy-elements',
      'Mind & Clarity': 'mind-clarity',
      'Space & Atmosphere': 'space-atmosphere',
      'The Real Rarities': 'rare-collectibles',
      'French Collections': 'french-collections',
      'Spiritual Items': 'spiritual-items',
      'Vintage & Antique': 'vintage-antique',
      'Handmade & Artisan': 'handmade-artisan'
    };

    this.stats = {
      permalinksGenerated: 0,
      seoOptimizedUrls: 0,
      categoryBasedUrls: 0,
      avgProcessingTime: 0
    };
  }

  /**
   * Generate comprehensive permalink package
   * @param {Object} item - Product item data
   * @param {Object} seoContent - SEO content for keyword integration
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Permalink package
   */
  async generatePermalinkPackage(item, seoContent = null, options = {}) {
    const traceId = this.observer.startTrace('generate_permalink_package');
    const startTime = Date.now();
    
    try {
      this.observer.log('info', `Generating permalink package for ${item.itemName || item.sku}`);
      
      // Generate base slug from item name
      const baseSlug = this.generateSlug(item.itemName || item.sku);
      
      // Generate multiple permalink variations
      const permalinkVariations = this.generatePermalinkVariations(item, baseSlug, seoContent);
      
      // Select recommended permalink
      const recommendedPermalink = this.selectRecommendedPermalink(permalinkVariations, item, seoContent);
      
      // Validate URLs
      const validation = this.validatePermalinks(permalinkVariations);
      
      // Calculate quality metrics
      const qualityMetrics = this.calculatePermalinkMetrics(recommendedPermalink, item, seoContent);
      
      const permalinkPackage = {
        itemName: item.itemName,
        sku: item.sku,
        categories: item.categories,
        
        // Main permalink recommendation
        recommendedPermalink,
        
        // All variations
        variations: permalinkVariations,
        
        // Quality and validation
        validation,
        qualityMetrics,
        
        // SEO integration
        seoKeywordsInURL: this.extractSEOKeywordsInURL(recommendedPermalink, seoContent),
        keywordDensity: this.calculateURLKeywordDensity(recommendedPermalink, seoContent),
        
        // Technical details
        urlLength: recommendedPermalink.length,
        wordCount: recommendedPermalink.split(/[-_/]/).length,
        usesHyphens: recommendedPermalink.includes('-'),
        isLowercase: recommendedPermalink === recommendedPermalink.toLowerCase(),
        noSpecialChars: !/[^a-z0-9\-_/]/.test(recommendedPermalink),
        
        // Alternative structures for consideration
        alternativeUrls: this.generateAlternativeUrls(item, baseSlug),
        
        // Category integration
        categoryPaths: this.generateCategoryPaths(item.categories),
        
        generatedAt: new Date().toISOString(),
        processingTime: Date.now() - startTime
      };
      
      this.stats.permalinksGenerated++;
      if (permalinkPackage.qualityMetrics.seoScore > 80) this.stats.seoOptimizedUrls++;
      if (permalinkPackage.recommendedPermalink.includes('/products/')) this.stats.categoryBasedUrls++;
      this.stats.avgProcessingTime = (this.stats.avgProcessingTime + (Date.now() - startTime)) / this.stats.permalinksGenerated;
      
      this.observer.log('info', `Permalink package generated: ${recommendedPermalink}`);
      this.observer.endTrace(traceId, { 
        sku: item.sku,
        permalink: recommendedPermalink,
        seoScore: qualityMetrics.seoScore,
        variations: Object.keys(permalinkVariations).length
      });
      
      return permalinkPackage;

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw new Error(`Permalink generation failed: ${error.message}`);
    }
  }

  /**
   * Generate URL-friendly slug from text
   * @param {string} text - Text to convert to slug
   * @returns {string} URL slug
   */
  generateSlug(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Generate multiple permalink variations
   * @param {Object} item - Product item
   * @param {string} baseSlug - Base slug
   * @param {Object} seoContent - SEO content
   * @returns {Object} Permalink variations
   */
  generatePermalinkVariations(item, baseSlug, seoContent) {
    const variations = {};
    
    // Simple product URL
    variations.simple = `/products/${baseSlug}`;
    
    // SKU-based URL
    if (item.sku) {
      variations.skuBased = `/products/${item.sku.toLowerCase()}`;
    }
    
    // Category-based URLs
    if (item.categories) {
      const categories = item.categories.split(',').map(c => c.trim());
      const primaryCategory = categories[0];
      const categorySlug = this.categoryMappings[primaryCategory] || this.generateSlug(primaryCategory);
      
      variations.categoryBased = `/${categorySlug}/${baseSlug}`;
      variations.categoryProduct = `/${categorySlug}/products/${baseSlug}`;
    }
    
    // SEO-optimized URLs with keywords
    if (seoContent && seoContent.primaryKeywords) {
      const primaryKeyword = seoContent.primaryKeywords[0];
      if (primaryKeyword) {
        const keywordSlug = this.generateSlug(primaryKeyword);
        variations.seoOptimized = `/products/${keywordSlug}-${baseSlug}`;
        variations.keywordFocused = `/${keywordSlug}/${baseSlug}`;
      }
    }
    
    // Short version (for social sharing)
    const shortSlug = baseSlug.split('-').slice(0, 3).join('-');
    variations.short = `/p/${shortSlug}`;
    
    // Brand/collection focused
    if (item.categories && item.categories.includes('French Collections')) {
      variations.brandFocused = `/french-collection/${baseSlug}`;
    } else if (item.categories && item.categories.includes('The Real Rarities')) {
      variations.brandFocused = `/rare-items/${baseSlug}`;
    }
    
    return variations;
  }

  /**
   * Select the best permalink from variations
   * @param {Object} variations - Permalink variations
   * @param {Object} item - Product item
   * @param {Object} seoContent - SEO content
   * @returns {string} Recommended permalink
   */
  selectRecommendedPermalink(variations, item, seoContent) {
    // Scoring system for permalink selection
    const scores = {};
    
    Object.entries(variations).forEach(([key, url]) => {
      let score = 0;
      
      // Length scoring (prefer moderate length)
      if (url.length >= 20 && url.length <= 60) score += 30;
      else if (url.length <= 80) score += 20;
      else score += 5;
      
      // SEO keyword integration
      if (seoContent && seoContent.primaryKeywords) {
        const hasKeywords = seoContent.primaryKeywords.some(keyword =>
          url.toLowerCase().includes(keyword.toLowerCase().replace(/\s+/g, '-'))
        );
        if (hasKeywords) score += 25;
      }
      
      // Category integration (good for navigation)
      if (url.includes('/products/')) score += 15;
      if (item.categories && url.includes(this.generateSlug(item.categories.split(',')[0]))) {
        score += 20;
      }
      
      // Readability and user-friendliness
      const wordCount = url.split(/[-_/]/).length;
      if (wordCount >= 3 && wordCount <= 6) score += 15;
      
      // Avoid overly complex URLs
      if (url.split('/').length > 4) score -= 10;
      
      scores[key] = score;
    });
    
    // Select highest scoring variation
    const bestVariation = Object.entries(scores).reduce((a, b) => 
      scores[a[0]] > scores[b[0]] ? a : b
    )[0];
    
    return variations[bestVariation];
  }

  /**
   * Validate permalink quality and best practices
   * @param {Object} variations - Permalink variations
   * @returns {Object} Validation results
   */
  validatePermalinks(variations) {
    const validation = {
      passed: [],
      warnings: [],
      errors: []
    };
    
    Object.entries(variations).forEach(([key, url]) => {
      // Check length
      if (url.length > 100) {
        validation.warnings.push(`${key}: URL too long (${url.length} chars)`);
      } else {
        validation.passed.push(`${key}: Good length`);
      }
      
      // Check for best practices
      if (!url.includes('-')) {
        validation.warnings.push(`${key}: Consider using hyphens for readability`);
      }
      
      if (url !== url.toLowerCase()) {
        validation.errors.push(`${key}: Should be lowercase only`);
      }
      
      if (/[^a-z0-9\-_/]/.test(url)) {
        validation.errors.push(`${key}: Contains special characters`);
      }
      
      if (url.includes('_')) {
        validation.warnings.push(`${key}: Hyphens preferred over underscores`);
      }
    });
    
    return validation;
  }

  /**
   * Calculate permalink quality metrics
   * @param {string} permalink - Permalink to analyze
   * @param {Object} item - Product item
   * @param {Object} seoContent - SEO content
   * @returns {Object} Quality metrics
   */
  calculatePermalinkMetrics(permalink, item, seoContent) {
    let seoScore = 0;
    let userFriendliness = 0;
    let technicalScore = 0;
    
    // SEO scoring
    if (permalink.length >= 20 && permalink.length <= 60) seoScore += 25;
    if (seoContent && seoContent.primaryKeywords) {
      const hasKeywords = seoContent.primaryKeywords.some(keyword =>
        permalink.toLowerCase().includes(keyword.toLowerCase().replace(/\s+/g, '-'))
      );
      if (hasKeywords) seoScore += 35;
    }
    if (permalink.includes('/products/')) seoScore += 20;
    if (item.categories && permalink.includes(this.generateSlug(item.categories.split(',')[0]))) {
      seoScore += 20;
    }
    
    // User friendliness
    const wordCount = permalink.split(/[-_/]/).length;
    if (wordCount >= 2 && wordCount <= 5) userFriendliness += 30;
    if (permalink.includes('-')) userFriendliness += 25;
    if (!/[^a-z0-9\-/]/.test(permalink)) userFriendliness += 25;
    if (permalink.split('/').length <= 4) userFriendliness += 20;
    
    // Technical scoring
    if (permalink === permalink.toLowerCase()) technicalScore += 25;
    if (permalink.length <= 100) technicalScore += 25;
    if (!/-{2,}/.test(permalink)) technicalScore += 25;
    if (!/[^a-z0-9\-_/]/.test(permalink)) technicalScore += 25;
    
    return {
      seoScore: Math.min(seoScore, 100),
      userFriendliness: Math.min(userFriendliness, 100),
      technicalScore: Math.min(technicalScore, 100),
      overallScore: Math.round((seoScore + userFriendliness + technicalScore) / 3)
    };
  }

  /**
   * Extract SEO keywords present in URL
   * @param {string} permalink - Permalink
   * @param {Object} seoContent - SEO content
   * @returns {Array} Keywords found in URL
   */
  extractSEOKeywordsInURL(permalink, seoContent) {
    if (!seoContent || !seoContent.primaryKeywords) return [];
    
    const urlWords = permalink.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/);
    const foundKeywords = [];
    
    [...(seoContent.primaryKeywords || []), ...(seoContent.secondaryKeywords || [])].forEach(keyword => {
      const keywordWords = keyword.toLowerCase().split(/\s+/);
      const hasAllWords = keywordWords.every(word => urlWords.includes(word));
      if (hasAllWords) {
        foundKeywords.push(keyword);
      }
    });
    
    return foundKeywords;
  }

  /**
   * Calculate keyword density in URL
   * @param {string} permalink - Permalink
   * @param {Object} seoContent - SEO content
   * @returns {number} Keyword density
   */
  calculateURLKeywordDensity(permalink, seoContent) {
    if (!seoContent) return 0;
    
    const urlWords = permalink.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
    const keywordWords = [
      ...(seoContent.primaryKeywords || []).join(' ').toLowerCase().split(/\s+/),
      ...(seoContent.secondaryKeywords || []).join(' ').toLowerCase().split(/\s+/)
    ];
    
    const keywordMatches = urlWords.filter(word => keywordWords.includes(word)).length;
    return urlWords.length > 0 ? keywordMatches / urlWords.length : 0;
  }

  /**
   * Generate alternative URL structures
   * @param {Object} item - Product item
   * @param {string} baseSlug - Base slug
   * @returns {Array} Alternative URLs
   */
  generateAlternativeUrls(item, baseSlug) {
    const alternatives = [];
    
    // ID-based alternatives
    if (item.sku) {
      alternatives.push(`/p/${item.sku.toLowerCase()}`);
      alternatives.push(`/item/${item.sku.toLowerCase()}`);
    }
    
    // Short alternatives
    alternatives.push(`/shop/${baseSlug}`);
    alternatives.push(`/buy/${baseSlug}`);
    
    return alternatives;
  }

  /**
   * Generate category-based path variations
   * @param {string} categories - Product categories
   * @returns {Array} Category paths
   */
  generateCategoryPaths(categories) {
    if (!categories) return [];
    
    const categoryList = categories.split(',').map(c => c.trim());
    const paths = [];
    
    categoryList.forEach(category => {
      const slug = this.categoryMappings[category] || this.generateSlug(category);
      paths.push(`/${slug}`);
      paths.push(`/category/${slug}`);
      paths.push(`/shop/${slug}`);
    });
    
    return paths;
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return { ...this.stats };
  }
}