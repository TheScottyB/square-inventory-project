#!/usr/bin/env node

import { EventEmitter } from 'events';
import OpenAI from 'openai';
import { CatalogObserver } from '../observability/CatalogObserver.js';

/**
 * SEOContentAgent - Specialized SEO metadata generation
 * 
 * Generates comprehensive SEO packages including:
 * - Optimized titles (50-60 chars)
 * - Meta descriptions (150-160 chars)  
 * - Primary/secondary/long-tail keywords
 * - Search intent analysis
 * - Competition analysis
 */
export class SEOContentAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      maxTitleLength: options.maxTitleLength || 60,
      maxMetaLength: options.maxMetaLength || 160,
      keywordDensityTarget: options.keywordDensityTarget || 0.02,
      model: options.model || 'gpt-4o-mini',
      ...options
    };

    // Initialize OpenAI
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/seo-content'
    });

    this.stats = {
      seoPackagesGenerated: 0,
      titlesOptimized: 0,
      metaDescriptionsCreated: 0,
      keywordSetsGenerated: 0,
      avgProcessingTime: 0
    };
  }

  /**
   * Generate comprehensive SEO content package
   * @param {Object} item - Product item data
   * @param {Object} existingContent - Existing content for context
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} SEO content package
   */
  async generateSEOPackage(item, existingContent = null, options = {}) {
    const traceId = this.observer.startTrace('generate_seo_package');
    const startTime = Date.now();
    
    try {
      this.observer.log('info', `Generating SEO package for ${item.itemName || item.sku}`);
      
      // Create comprehensive prompt for SEO generation
      const seoPrompt = this.buildSEOPrompt(item, existingContent, options);
      
      const completion = await this.openai.chat.completions.create({
        model: this.options.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert SEO strategist specializing in e-commerce product optimization. 
            
Your expertise includes:
- Search intent analysis and keyword research
- Title optimization for maximum CTR
- Meta description crafting for conversion
- Long-tail keyword identification
- Competition analysis and positioning
- Technical SEO best practices

Generate comprehensive SEO packages that balance search optimization with authentic storytelling.
Always return valid JSON with all requested fields.`
          },
          {
            role: 'user',
            content: seoPrompt
          }
        ],
        temperature: 0.3, // Lower temperature for more consistent SEO output
        max_tokens: 2000
      });

      const seoContent = JSON.parse(completion.choices[0].message.content);
      
      // Validate and enhance SEO content
      const enhancedSEOContent = await this.enhanceSEOContent(seoContent, item, existingContent);
      
      // Calculate quality metrics
      const qualityMetrics = this.calculateSEOMetrics(enhancedSEOContent, item);
      
      const finalPackage = {
        ...enhancedSEOContent,
        qualityMetrics,
        generatedAt: new Date().toISOString(),
        processingTime: Date.now() - startTime
      };
      
      this.stats.seoPackagesGenerated++;
      this.stats.titlesOptimized++;
      this.stats.metaDescriptionsCreated++;
      this.stats.keywordSetsGenerated++;
      this.stats.avgProcessingTime = (this.stats.avgProcessingTime + (Date.now() - startTime)) / this.stats.seoPackagesGenerated;
      
      this.observer.log('info', `SEO package generated successfully for ${item.itemName || item.sku}`);
      this.observer.endTrace(traceId, { 
        sku: item.sku, 
        titleLength: enhancedSEOContent.seoTitle?.length,
        metaLength: enhancedSEOContent.metaDescription?.length,
        keywordCount: enhancedSEOContent.primaryKeywords?.length
      });
      
      return finalPackage;

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw new Error(`SEO package generation failed: ${error.message}`);
    }
  }

  /**
   * Build comprehensive SEO generation prompt
   * @param {Object} item - Product item
   * @param {Object} existingContent - Existing content
   * @param {Object} options - Options
   * @returns {string} SEO prompt
   */
  buildSEOPrompt(item, existingContent, options) {
    return `Generate a comprehensive SEO package for this product:

PRODUCT INFORMATION:
- Name: ${item.itemName}
- SKU: ${item.sku}
- Categories: ${item.categories}
- Current Description: ${item.description || 'None'}

${existingContent ? `
EXISTING CONTENT CONTEXT:
- Primary Description: ${existingContent.primaryNarrative || 'None'}
- Cultural Context: ${existingContent.culturalContext || 'None'}
- Narrative Framework: ${existingContent.narrativeFramework || 'None'}
` : ''}

REQUIREMENTS:
- SEO Title: 50-60 characters, compelling and keyword-rich
- Meta Description: 150-160 characters, conversion-focused
- Primary Keywords: 3-5 high-value search terms
- Secondary Keywords: 5-8 supporting terms
- Long-tail Keywords: 8-12 specific phrases
- Search Intent: Primary user search motivation
- Market Positioning: Unique value proposition for SEO

Generate JSON with this exact structure:
{
  "seoTitle": "Optimized title 50-60 chars",
  "metaDescription": "Compelling meta description 150-160 chars",
  "primaryKeywords": ["keyword1", "keyword2", "keyword3"],
  "secondaryKeywords": ["term1", "term2", "term3", "term4", "term5"],
  "longTailKeywords": ["specific phrase 1", "specific phrase 2", "..."],
  "searchIntent": "informational|commercial|navigational|transactional",
  "primaryFocus": "Main SEO focus area",
  "marketPositioning": "Unique positioning for search",
  "competitorAnalysis": "Brief analysis of search landscape",
  "expectedCTR": "Estimated click-through rate percentage"
}

Focus on authentic SEO that matches the product's unique characteristics and cultural context.`;
  }

  /**
   * Enhance and validate SEO content
   * @param {Object} seoContent - Raw SEO content
   * @param {Object} item - Product item
   * @param {Object} existingContent - Existing content
   * @returns {Promise<Object>} Enhanced SEO content
   */
  async enhanceSEOContent(seoContent, item, existingContent) {
    // Validate title length
    if (seoContent.seoTitle && seoContent.seoTitle.length > this.options.maxTitleLength) {
      seoContent.seoTitle = seoContent.seoTitle.substring(0, this.options.maxTitleLength - 3) + '...';
    }

    // Validate meta description length
    if (seoContent.metaDescription && seoContent.metaDescription.length > this.options.maxMetaLength) {
      seoContent.metaDescription = seoContent.metaDescription.substring(0, this.options.maxMetaLength - 3) + '...';
    }

    // Ensure required fields
    seoContent.itemName = item.itemName;
    seoContent.sku = item.sku;
    seoContent.categories = item.categories;

    // Add technical SEO enhancements
    seoContent.technicalSEO = {
      titleLength: seoContent.seoTitle?.length || 0,
      metaLength: seoContent.metaDescription?.length || 0,
      keywordCount: (seoContent.primaryKeywords?.length || 0) + (seoContent.secondaryKeywords?.length || 0),
      titleOptimal: seoContent.seoTitle?.length >= 50 && seoContent.seoTitle?.length <= 60,
      metaOptimal: seoContent.metaDescription?.length >= 150 && seoContent.metaDescription?.length <= 160
    };

    return seoContent;
  }

  /**
   * Calculate SEO quality metrics
   * @param {Object} seoContent - SEO content
   * @param {Object} item - Product item
   * @returns {Object} Quality metrics
   */
  calculateSEOMetrics(seoContent, item) {
    const metrics = {
      titleScore: 0,
      metaScore: 0,
      keywordScore: 0,
      overallSEOScore: 0
    };

    // Title scoring
    if (seoContent.seoTitle) {
      const titleLen = seoContent.seoTitle.length;
      if (titleLen >= 50 && titleLen <= 60) metrics.titleScore += 40;
      else if (titleLen >= 40 && titleLen <= 70) metrics.titleScore += 25;
      else metrics.titleScore += 10;

      // Check for primary keyword in title
      const hasKeyword = seoContent.primaryKeywords?.some(keyword => 
        seoContent.seoTitle.toLowerCase().includes(keyword.toLowerCase())
      );
      if (hasKeyword) metrics.titleScore += 30;

      // Check for brand/uniqueness
      if (seoContent.seoTitle.toLowerCase().includes(item.itemName?.toLowerCase().split(' ')[0])) {
        metrics.titleScore += 30;
      }
    }

    // Meta description scoring
    if (seoContent.metaDescription) {
      const metaLen = seoContent.metaDescription.length;
      if (metaLen >= 150 && metaLen <= 160) metrics.metaScore += 40;
      else if (metaLen >= 120 && metaLen <= 180) metrics.metaScore += 25;
      else metrics.metaScore += 10;

      // Check for call-to-action
      const hasCallToAction = /buy|shop|discover|explore|find|get/i.test(seoContent.metaDescription);
      if (hasCallToAction) metrics.metaScore += 30;

      // Check for keyword integration
      const hasKeywords = seoContent.primaryKeywords?.some(keyword => 
        seoContent.metaDescription.toLowerCase().includes(keyword.toLowerCase())
      );
      if (hasKeywords) metrics.metaScore += 30;
    }

    // Keyword scoring
    const primaryCount = seoContent.primaryKeywords?.length || 0;
    const secondaryCount = seoContent.secondaryKeywords?.length || 0;
    const longTailCount = seoContent.longTailKeywords?.length || 0;

    if (primaryCount >= 3 && primaryCount <= 5) metrics.keywordScore += 30;
    if (secondaryCount >= 5 && secondaryCount <= 8) metrics.keywordScore += 25;
    if (longTailCount >= 8) metrics.keywordScore += 25;

    // Diversity bonus
    const allKeywords = [
      ...(seoContent.primaryKeywords || []),
      ...(seoContent.secondaryKeywords || []),
      ...(seoContent.longTailKeywords || [])
    ];
    const uniqueWords = new Set(allKeywords.join(' ').toLowerCase().split(' '));
    if (uniqueWords.size > 20) metrics.keywordScore += 20;

    // Calculate overall score
    metrics.overallSEOScore = Math.round(
      (metrics.titleScore + metrics.metaScore + metrics.keywordScore) / 3
    );

    return metrics;
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return { ...this.stats };
  }
}