import { OpenAI } from 'openai';
import fs from 'fs-extra';
import path from 'path';

/**
 * SEO Agent - Specialized agent for optimizing Square catalog item SEO
 * 
 * This agent focuses on:
 * - Generating compelling product descriptions
 * - Creating SEO-optimized titles and meta descriptions
 * - Generating appropriate keywords and tags
 * - Ensuring consistency across all five online stores
 */

export class SEOAgent {
  constructor(options = {}) {
    // Initialize OpenAI client if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      this.aiEnabled = true;
    } else {
      console.warn('⚠️  OpenAI API key not found. SEO Agent will use template-based generation.');
      this.aiEnabled = false;
    }
    
    this.config = {
      maxDescriptionLength: 500,
      maxSeoTitleLength: 60,
      maxMetaDescriptionLength: 160,
      targetKeywordCount: 5,
      brandName: options.brandName || 'Your Store',
      storePersonality: options.storePersonality || 'premium, friendly, professional',
      ...options
    };
    
    // Load SEO templates and guidelines
    this.templates = this.loadSEOTemplates();
    this.guidelines = this.loadSEOGuidelines();
  }

  /**
   * Generate comprehensive SEO content for a Square catalog item
   */
  async optimizeItemSEO(item, options = {}) {
    const itemData = item.itemData;
    if (!itemData) {
      throw new Error('Item has no itemData');
    }

    console.log(`🎯 Optimizing SEO for: ${itemData.name}`);

    // Extract item context
    const context = this.extractItemContext(item);
    
    // Generate SEO content using AI or templates
    const seoContent = this.aiEnabled 
      ? await this.generateAIOptimizedSEO(context, options)
      : this.generateTemplateBasedSEO(context, options);

    // Validate and refine SEO content
    const validatedContent = this.validateSEOContent(seoContent, context);

    // Generate additional SEO metadata
    const metadata = this.generateSEOMetadata(validatedContent, context);

    return {
      ...validatedContent,
      ...metadata,
      context,
      generatedAt: new Date().toISOString(),
      method: this.aiEnabled ? 'ai' : 'template'
    };
  }

  /**
   * Extract comprehensive context from Square catalog item
   */
  extractItemContext(item) {
    const itemData = item.itemData;
    
    // Determine product type and category
    const productType = this.determineProductType(itemData);
    const category = this.extractCategory(itemData);
    
    // Extract pricing information
    const pricing = this.extractPricing(itemData);
    
    // Analyze existing content
    const currentContent = {
      name: itemData.name,
      description: itemData.description || '',
      descriptionHtml: itemData.descriptionHtml || '',
      existingSEO: itemData.ecomSeoData || {}
    };

    // Extract image context
    const imageContext = {
      hasImages: itemData.imageIds?.length > 0,
      imageCount: itemData.imageIds?.length || 0,
      primaryImageId: itemData.imageIds?.[0]
    };

    // Determine target audience and use cases
    const audience = this.determineTargetAudience(productType, category, itemData.name);
    
    return {
      id: item.id,
      name: itemData.name,
      productType,
      category,
      pricing,
      currentContent,
      imageContext,
      audience,
      visibility: itemData.ecom_visibility,
      isService: itemData.productType === 'APPOINTMENTS_SERVICE',
      variations: itemData.variations?.length || 0,
      brand: this.config.brandName
    };
  }

  /**
   * Generate AI-optimized SEO content using OpenAI
   */
  async generateAIOptimizedSEO(context, options = {}) {
    const prompt = this.buildSEOPrompt(context, options);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: this.getSEOSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      const aiResponse = response.choices[0].message.content;
      return this.parseSEOResponse(aiResponse, context);
      
    } catch (error) {
      console.warn(`⚠️  AI SEO generation failed: ${error.message}. Falling back to templates.`);
      return this.generateTemplateBasedSEO(context, options);
    }
  }

  /**
   * Build comprehensive SEO prompt for AI
   */
  buildSEOPrompt(context, options) {
    return `Please optimize SEO content for this ${context.brand} product:

PRODUCT DETAILS:
- Name: ${context.name}
- Category: ${context.category}
- Type: ${context.productType}
- Current Description: ${context.currentContent.description || 'None'}
- Price Range: ${context.pricing.display}
- Target Audience: ${context.audience.primary.join(', ')}
- Is Service: ${context.isService}
- Image Count: ${context.imageContext.imageCount}

REQUIREMENTS:
- Create compelling, SEO-optimized description (max ${this.config.maxDescriptionLength} chars)
- Generate SEO title (max ${this.config.maxSeoTitleLength} chars)
- Create meta description (max ${this.config.maxMetaDescriptionLength} chars)
- Suggest ${this.config.targetKeywordCount} relevant keywords
- Match brand personality: ${this.config.storePersonality}
- Ensure consistency across five online stores
- Focus on benefits and unique selling points
- Include call-to-action appropriate for ${context.isService ? 'service' : 'product'}

Please format your response as JSON:
{
  "description": "...",
  "seoTitle": "...",
  "metaDescription": "...",
  "keywords": ["keyword1", "keyword2", ...],
  "tags": ["tag1", "tag2", ...],
  "callToAction": "...",
  "uniqueSellingPoints": ["point1", "point2", ...]
}`;
  }

  /**
   * Get system prompt for SEO optimization
   */
  getSEOSystemPrompt() {
    return `You are an expert SEO copywriter specializing in e-commerce product descriptions. 

Your expertise includes:
- Creating compelling, conversion-focused product descriptions
- Optimizing for search engines while maintaining readability
- Understanding user intent and search behavior
- Crafting unique selling propositions
- Ensuring brand consistency across multiple platforms

Guidelines:
- Write in a ${this.config.storePersonality} tone
- Focus on benefits over features
- Use natural keyword integration
- Create urgency and desire
- Ensure mobile-friendly readability
- Consider voice search optimization
- Always include relevant call-to-action`;
  }

  /**
   * Parse AI response into structured SEO content
   */
  parseSEOResponse(aiResponse, context) {
    try {
      const parsed = JSON.parse(aiResponse);
      
      return {
        description: parsed.description,
        seoTitle: parsed.seoTitle,
        metaDescription: parsed.metaDescription,
        keywords: parsed.keywords || [],
        tags: parsed.tags || [],
        callToAction: parsed.callToAction,
        uniqueSellingPoints: parsed.uniqueSellingPoints || [],
        generationMethod: 'ai'
      };
    } catch (error) {
      console.warn('⚠️  Failed to parse AI response. Using fallback parsing.');
      return this.extractSEOFromText(aiResponse, context);
    }
  }

  /**
   * Generate SEO content using templates (fallback method)
   */
  generateTemplateBasedSEO(context, options = {}) {
    const template = this.selectTemplate(context);
    
    const description = this.generateTemplateDescription(context, template);
    const seoTitle = this.generateTemplateSEOTitle(context);
    const metaDescription = this.generateTemplateMetaDescription(context, description);
    const keywords = this.generateTemplateKeywords(context);
    const tags = this.generateTemplateTags(context);

    return {
      description,
      seoTitle,
      metaDescription,
      keywords,
      tags,
      callToAction: template.callToAction,
      uniqueSellingPoints: this.extractSellingPoints(context),
      generationMethod: 'template'
    };
  }

  /**
   * Validate and refine SEO content
   */
  validateSEOContent(content, context) {
    const validated = { ...content };

    // Validate description length
    if (validated.description.length > this.config.maxDescriptionLength) {
      validated.description = this.truncateText(validated.description, this.config.maxDescriptionLength);
    }

    // Validate SEO title length
    if (validated.seoTitle.length > this.config.maxSeoTitleLength) {
      validated.seoTitle = this.truncateText(validated.seoTitle, this.config.maxSeoTitleLength);
    }

    // Validate meta description length
    if (validated.metaDescription.length > this.config.maxMetaDescriptionLength) {
      validated.metaDescription = this.truncateText(validated.metaDescription, this.config.maxMetaDescriptionLength);
    }

    // Ensure minimum keyword count
    if (validated.keywords.length < this.config.targetKeywordCount) {
      validated.keywords = this.expandKeywords(validated.keywords, context);
    }

    // Add quality scores
    validated.qualityScore = this.calculateQualityScore(validated, context);

    return validated;
  }

  /**
   * Generate additional SEO metadata
   */
  generateSEOMetadata(content, context) {
    return {
      permalink: this.generatePermalink(context.name),
      breadcrumbs: this.generateBreadcrumbs(context),
      structuredData: this.generateStructuredData(content, context),
      socialMediaTags: this.generateSocialMediaTags(content, context),
      internalLinkingSuggestions: this.generateInternalLinkingSuggestions(context)
    };
  }

  // Utility methods for template-based generation
  selectTemplate(context) {
    const templates = this.templates[context.productType] || this.templates.default;
    
    // Select template based on context
    if (context.isService) {
      return templates.service || templates.default;
    }
    
    if (context.pricing.tier === 'premium') {
      return templates.premium || templates.default;
    }
    
    return templates.default;
  }

  generateTemplateDescription(context, template) {
    let description;
    
    // Use existing description if available, otherwise generate from template
    if (context.currentContent.description && context.currentContent.description.trim()) {
      // Enhance existing description with SEO elements
      description = context.currentContent.description;
      
      // Add template enhancements if not already present
      if (context.imageContext.hasImages && !description.includes('photo')) {
        description += ' ' + template.withImages;
      }
      
      if (context.isService && !description.includes('service')) {
        description += ' ' + template.serviceAddition;
      }
    } else {
      // Generate new description from template
      description = template.description
        .replace(/\{name\}/g, context.name.toLowerCase())
        .replace(/\{Name\}/g, context.name)
        .replace(/\{category\}/g, context.category.toLowerCase())
        .replace(/\{Category\}/g, context.category)
        .replace(/\{brand\}/g, context.brand);
      
      // Add contextual enhancements
      if (context.imageContext.hasImages) {
        description += ' ' + template.withImages;
      }
      
      if (context.isService) {
        description += ' ' + template.serviceAddition;
      }
    }

    return description.trim();
  }

  generateTemplateSEOTitle(context) {
    const formats = [
      `${context.name} | ${context.category} | ${context.brand}`,
      `${context.name} - Premium ${context.category}`,
      `Buy ${context.name} | ${context.brand} ${context.category}`,
      `${context.name} | Quality ${context.category} | ${context.brand}`
    ];
    
    // Select shortest format that fits
    return formats.find(format => format.length <= this.config.maxSeoTitleLength) || formats[0];
  }

  generateTemplateMetaDescription(context, description) {
    const metaDesc = description.substring(0, this.config.maxMetaDescriptionLength - 20) + 
                    ` Shop ${context.brand} today!`;
    
    return metaDesc.length <= this.config.maxMetaDescriptionLength 
      ? metaDesc 
      : description.substring(0, this.config.maxMetaDescriptionLength - 3) + '...';
  }

  generateTemplateKeywords(context) {
    const keywords = new Set();
    
    // Add name-based keywords
    context.name.toLowerCase().split(/\s+/).forEach(word => {
      if (word.length > 2) keywords.add(word);
    });
    
    // Add category keywords
    keywords.add(context.category.toLowerCase());
    
    // Add product type keywords
    keywords.add(context.productType.toLowerCase());
    
    // Add brand keyword
    keywords.add(context.brand.toLowerCase());
    
    // Add audience keywords
    context.audience.primary.forEach(aud => keywords.add(aud.toLowerCase()));
    
    return Array.from(keywords).slice(0, this.config.targetKeywordCount);
  }

  generateTemplateTags(context) {
    return [
      context.category,
      context.productType,
      ...context.audience.primary,
      context.pricing.tier
    ].filter(Boolean);
  }

  // Helper methods
  determineProductType(itemData) {
    if (itemData.productType === 'APPOINTMENTS_SERVICE') return 'service';
    if (itemData.name.toLowerCase().includes('subscription')) return 'subscription';
    if (itemData.variations?.some(v => v.itemVariationData?.pricingType === 'VARIABLE_PRICING')) return 'custom';
    return 'product';
  }

  extractCategory(itemData) {
    if (itemData.categories?.length > 0) {
      return itemData.categories[0].name || 'Uncategorized';
    }
    
    // Infer category from name
    const name = itemData.name.toLowerCase();
    const categoryKeywords = {
      'jewelry': ['bracelet', 'necklace', 'ring', 'earring'],
      'cosmetics': ['lipstick', 'mascara', 'foundation', 'lip gloss', 'moisturizer'],
      'apparel': ['shirt', 'pants', 'jacket', 'dress', 'hat'],
      'services': ['consultation', 'appointment', 'session', 'tour'],
      'digital': ['download', 'digital', 'pdf', 'ebook']
    };
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => name.includes(keyword))) {
        return category;
      }
    }
    
    return 'Uncategorized';
  }

  extractPricing(itemData) {
    const variations = itemData.variations || [];
    const prices = variations.map(v => v.itemVariationData?.priceMoney?.amount)
                            .filter(Boolean)
                            .map(amount => parseInt(amount));
    
    if (prices.length === 0) {
      return { min: 0, max: 0, display: 'Contact for pricing', tier: 'custom' };
    }
    
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    
    return {
      min,
      max,
      display: min === max ? `$${(min / 100).toFixed(2)}` : `$${(min / 100).toFixed(2)} - $${(max / 100).toFixed(2)}`,
      tier: min >= 10000 ? 'premium' : min >= 5000 ? 'mid' : 'basic'
    };
  }

  determineTargetAudience(productType, category, name) {
    const audienceMap = {
      'jewelry': { primary: ['jewelry lovers', 'gift buyers', 'fashion enthusiasts'], secondary: ['collectors'] },
      'cosmetics': { primary: ['beauty enthusiasts', 'makeup lovers', 'skincare focused'], secondary: ['professionals'] },
      'services': { primary: ['service seekers', 'clients', 'customers'], secondary: ['businesses'] },
      'apparel': { primary: ['fashion conscious', 'style seekers', 'clothing shoppers'], secondary: ['trendsetters'] }
    };
    
    return audienceMap[category] || { primary: ['customers', 'shoppers', 'buyers'], secondary: ['enthusiasts'] };
  }

  generatePermalink(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    
    // Find last complete word within limit
    const truncated = text.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return (lastSpace > maxLength * 0.8 ? truncated.substring(0, lastSpace) : truncated) + '...';
  }

  calculateQualityScore(content, context) {
    let score = 0;
    
    // Description quality (40 points)
    if (content.description.length >= 100) score += 10;
    if (content.description.length <= this.config.maxDescriptionLength) score += 10;
    if (content.description.includes(context.name)) score += 10;
    if (content.description.match(/[.!?]$/)) score += 10;
    
    // SEO title quality (30 points)
    if (content.seoTitle.length <= this.config.maxSeoTitleLength) score += 15;
    if (content.seoTitle.includes(context.name)) score += 15;
    
    // Keywords quality (20 points)
    if (content.keywords.length >= this.config.targetKeywordCount) score += 20;
    
    // Meta description quality (10 points)
    if (content.metaDescription.length <= this.config.maxMetaDescriptionLength) score += 10;
    
    return score;
  }

  // Load configuration templates and guidelines
  loadSEOTemplates() {
    return {
      product: {
        default: {
          description: "Discover our {Name}, a high-quality {category} that combines style, functionality, and value. Perfect for everyday use or special occasions. Experience the difference quality makes.",
          withImages: "See detailed photos showcasing the craftsmanship and attention to detail.",
          serviceAddition: "Book your appointment today for personalized service.",
          callToAction: "Order now and experience premium quality!"
        },
        premium: {
          description: "Indulge in luxury with our {Name}, an exquisite {category} crafted for the discerning customer. This premium piece represents the pinnacle of quality and sophistication.",
          withImages: "Browse our gallery to appreciate the exceptional detail and finish.",
          serviceAddition: "Schedule your exclusive consultation today.",
          callToAction: "Treat yourself to luxury - order today!"
        }
      },
      service: {
        default: {
          description: "Experience our {Name} service, designed to meet your {category} needs with professional expertise and personalized attention. Quality service you can trust.",
          withImages: "View examples of our work and facility.",
          serviceAddition: "Flexible scheduling available to fit your needs.",
          callToAction: "Book your appointment today!"
        }
      },
      default: {
        description: "Discover our {Name}, a carefully selected {category} that delivers exceptional value. Whether for personal use or as a gift, this item exceeds expectations.",
        withImages: "Multiple images show different angles and details.",
        serviceAddition: "Professional service with satisfaction guaranteed.",
        callToAction: "Shop now for the best selection!"
      }
    };
  }

  loadSEOGuidelines() {
    return {
      descriptionBestPractices: [
        "Lead with benefits, not just features",
        "Use emotional triggers and sensory language",
        "Include social proof when available",
        "Address common customer questions",
        "End with a clear call-to-action"
      ],
      keywordStrategy: [
        "Include primary keyword in title and description",
        "Use long-tail keywords naturally",
        "Consider voice search queries",
        "Include location-based keywords when relevant"
      ],
      technicalSEO: [
        "Optimize for mobile-first indexing",
        "Ensure fast loading times",
        "Use structured data markup",
        "Implement proper heading hierarchy"
      ]
    };
  }

  // Additional helper methods
  extractSellingPoints(context) {
    const points = [];
    
    if (context.imageContext.hasImages) {
      points.push("Visual documentation available");
    }
    
    if (context.pricing.tier === 'premium') {
      points.push("Premium quality materials");
    }
    
    if (context.isService) {
      points.push("Professional service delivery");
    }
    
    if (context.variations > 1) {
      points.push("Multiple options available");
    }
    
    return points;
  }

  expandKeywords(existingKeywords, context) {
    const additionalKeywords = [
      context.brand.toLowerCase(),
      context.category.toLowerCase(),
      'quality',
      'premium',
      'best'
    ];
    
    const expanded = [...existingKeywords];
    
    for (const keyword of additionalKeywords) {
      if (expanded.length >= this.config.targetKeywordCount) break;
      if (!expanded.includes(keyword)) {
        expanded.push(keyword);
      }
    }
    
    return expanded;
  }

  generateBreadcrumbs(context) {
    return [
      { name: 'Home', url: '/' },
      { name: context.category, url: `/category/${this.generatePermalink(context.category)}` },
      { name: context.name, url: `/product/${this.generatePermalink(context.name)}` }
    ];
  }

  generateStructuredData(content, context) {
    return {
      "@context": "https://schema.org/",
      "@type": context.isService ? "Service" : "Product",
      "name": context.name,
      "description": content.description,
      "category": context.category,
      "brand": {
        "@type": "Brand",
        "name": context.brand
      },
      "offers": {
        "@type": "Offer",
        "price": context.pricing.min / 100,
        "priceCurrency": "USD"
      }
    };
  }

  generateSocialMediaTags(content, context) {
    return {
      openGraph: {
        title: content.seoTitle,
        description: content.metaDescription,
        type: context.isService ? 'website' : 'product'
      },
      twitter: {
        card: 'summary_large_image',
        title: content.seoTitle,
        description: content.metaDescription
      }
    };
  }

  generateInternalLinkingSuggestions(context) {
    return [
      `Related ${context.category} products`,
      `Other ${context.brand} items`,
      `Similar price range products`,
      `Customer favorites in ${context.category}`
    ];
  }
}

export default SEOAgent;
