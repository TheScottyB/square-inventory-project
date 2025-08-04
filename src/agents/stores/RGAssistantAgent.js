import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import OpenAI from 'openai';
import { CatalogObserver } from '../../observability/CatalogObserver.js';

/**
 * RGAssistantAgent - Versatile content curator for Richmond General store
 * 
 * Specializes in general merchandise with adaptable content strategies.
 * Creates compelling product listings that can adapt to any category while maintaining
 * consistent quality and appeal across diverse product types.
 * 
 * Store Identity: Richmond General (RG)
 * - Catch-all store for diverse merchandise
 * - Adaptable content strategies for any product type
 * - Quality-focused with broad appeal
 * - Versatile tone that works across categories
 * - Customer-centric approach
 * 
 * Brand Voice: Adaptable, reliable, approachable, quality-focused, versatile
 */
export class RGAssistantAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      targetWordCount: options.targetWordCount || 150,
      adaptabilityLevel: options.adaptabilityLevel || 'high', // 'moderate', 'high', 'maximum'
      includeFeatures: options.includeFeatures || true,
      includeBenefits: options.includeBenefits || true,
      customerFocus: options.customerFocus || 'broad', // 'broad', 'targeted', 'niche'
      ...options
    };

    // Initialize OpenAI
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // RG-specific content frameworks for different product types
    this.contentFrameworks = {
      lifestyle_products: {
        openings: [
          "Enhance your daily routine with this thoughtfully designed essential...",
          "Quality meets functionality in this versatile addition to your lifestyle...",
          "Discover the perfect balance of style and practicality in this carefully selected item...",
          "Elevate your everyday experiences with this reliable and attractive solution..."
        ],
        
        focus_areas: [
          'daily_utility', 'style_enhancement', 'quality_construction',
          'user_experience', 'versatile_application', 'value_proposition',
          'practical_benefits', 'aesthetic_appeal'
        ],
        
        customer_benefits: [
          'improved daily routine', 'enhanced organization', 'stylish functionality',
          'lasting durability', 'convenient use', 'space efficiency'
        ],
        
        emotional_tones: ['practical', 'reliable', 'appealing', 'accessible', 'satisfying']
      },

      home_garden: {
        openings: [
          "Transform your living space with this beautiful and functional home enhancement...",
          "Create the perfect atmosphere in your home with this carefully chosen piece...",
          "Bring comfort and style together with this excellent addition to your home...",
          "Enjoy the perfect blend of beauty and utility in this home essential..."
        ],
        
        focus_areas: [
          'home_enhancement', 'aesthetic_improvement', 'functional_design',
          'comfort_creation', 'space_optimization', 'quality_materials',
          'easy_maintenance', 'lasting_value'
        ],
        
        customer_benefits: [
          'improved home aesthetics', 'enhanced comfort', 'better organization',
          'increased functionality', 'personal satisfaction', 'long-term value'
        ],
        
        emotional_tones: ['comfortable', 'welcoming', 'attractive', 'practical', 'satisfying']
      },

      fashion_accessories: {
        openings: [
          "Express your personal style with this versatile and attractive accessory...",
          "Complete your look with this thoughtfully designed fashion essential...",
          "Add the perfect finishing touch to any outfit with this stylish piece...",
          "Discover your new favorite accessory in this beautifully crafted item..."
        ],
        
        focus_areas: [
          'style_expression', 'versatile_styling', 'quality_construction',
          'fashion_versatility', 'personal_appeal', 'trend_relevance',
          'comfort_fit', 'lasting_style'
        ],
        
        customer_benefits: [
          'enhanced personal style', 'wardrobe versatility', 'confident appearance',
          'comfortable wear', 'fashion flexibility', 'lasting appeal'
        ],
        
        emotional_tones: ['stylish', 'confident', 'versatile', 'attractive', 'expressive']
      },

      general_merchandise: {
        openings: [
          "Discover exceptional value and quality in this carefully selected item...",
          "Meet your needs with this reliable and well-made product...",
          "Experience the satisfaction of a smart purchase with this quality offering...",
          "Find exactly what you're looking for in this dependable and attractive option..."
        ],
        
        focus_areas: [
          'quality_assurance', 'value_proposition', 'reliability',
          'customer_satisfaction', 'practical_application', 'smart_choice',
          'dependable_performance', 'broad_appeal'
        ],
        
        customer_benefits: [
          'reliable performance', 'excellent value', 'quality assurance',
          'customer satisfaction', 'practical utility', 'smart investment'
        ],
        
        emotional_tones: ['reliable', 'valuable', 'practical', 'trustworthy', 'satisfying']
      }
    };

    // RG brand voice characteristics - adaptable but consistent
    this.brandVoice = {
      core_vocabulary: [
        'quality', 'reliable', 'versatile', 'practical', 'valuable',
        'thoughtfully designed', 'carefully selected', 'well-made',
        'customer-focused', 'dependable', 'attractive', 'functional'
      ],
      
      adaptable_modifiers: [
        { casual: ['great', 'awesome', 'perfect', 'amazing'] },
        { professional: ['excellent', 'superior', 'premium', 'exceptional'] },
        { friendly: ['wonderful', 'delightful', 'lovely', 'charming'] }
      ],
      
      value_language: [
        'excellent value', 'smart choice', 'great investment', 'worthwhile purchase',
        'quality at a fair price', 'outstanding value proposition'
      ],
      
      tone_guidelines: [
        'Adaptable to product category while maintaining consistency',
        'Customer-focused and benefit-oriented',
        'Reliable and trustworthy communication',
        'Accessible language that broad audiences understand',
        'Quality-focused without being pretentious'
      ]
    };

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/rg-assistant'
    });

    this.stats = {
      listingsCreated: 0,
      averageWordCount: 0,
      totalWordCount: 0,
      categoryBreakdown: new Map(),
      toneAdaptations: new Map()
    };
  }

  /**
   * Create specialized product listing for Richmond General store
   * @param {Object} item - Product item data
   * @param {Object} analysis - Optional vision/content analysis
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Complete RG listing package
   */
  async createProductListing(item, analysis = null, options = {}) {
    const traceId = this.observer.startTrace('create_rg_listing');
    const startTime = Date.now();
    
    try {
      this.observer.log('info', `Creating RG listing for: ${item.name}`);
      
      // Step 1: Determine product category and framework
      const framework = this.selectContentFramework(item, analysis);
      
      // Step 2: Extract product attributes and benefits
      const productAttributes = this.extractProductAttributes(item, analysis);
      
      // Step 3: Adapt tone based on product type and audience
      const toneAdaptation = this.adaptToneForProduct(item, framework, analysis);
      
      // Step 4: Generate core content
      const coreContent = await this.generateCoreContent(item, framework, productAttributes, toneAdaptation);
      
      // Step 5: Create variations and enhancements
      const enhancements = await this.createContentEnhancements(coreContent, framework, productAttributes);
      
      // Step 6: Compile complete listing package
      const listingPackage = {
        itemId: item.sku || item.id || `rg-${Date.now()}`,
        itemName: item.name,
        storeId: 'RG',
        storeName: 'Richmond General',
        timestamp: new Date().toISOString(),
        
        // Core content
        title: enhancements.optimizedTitle,
        description: coreContent.primaryDescription,
        shortDescription: enhancements.shortDescription,
        
        // RG-specific content
        keyFeatures: productAttributes.keyFeatures,
        customerBenefits: productAttributes.customerBenefits,
        valueProposition: productAttributes.valueProposition,
        toneAdaptation: toneAdaptation.selectedTone,
        
        // Variations
        variations: {
          casual: enhancements.casualVariation,
          professional: enhancements.professionalVariation,
          enthusiast: enhancements.enthusiastVariation
        },
        
        // SEO elements
        seoTitle: enhancements.seoTitle,
        metaDescription: enhancements.metaDescription,
        tags: enhancements.generalTags,
        
        // Analytics
        contentAnalysis: {
          framework: framework.type,
          toneAdaptation: toneAdaptation.selectedTone,
          wordCount: this.countWords(coreContent.primaryDescription),
          adaptabilityLevel: this.options.adaptabilityLevel,
          brandAlignment: this.assessBrandAlignment(coreContent.primaryDescription)
        },
        
        // Metadata
        metadata: {
          processingTime: Date.now() - startTime,
          agentVersion: 'RG-Assistant-1.0',
          qualityScore: this.calculateQualityScore(coreContent, enhancements)
        }
      };
      
      // Update statistics
      this.updateStats(listingPackage);
      
      this.observer.log('info', `RG listing created for ${item.name} (${listingPackage.contentAnalysis.wordCount} words)`);
      this.observer.endTrace(traceId, { 
        wordCount: listingPackage.contentAnalysis.wordCount,
        framework: framework.type,
        tone: toneAdaptation.selectedTone
      });
      
      this.emit('listing-created', listingPackage);
      
      return listingPackage;

    } catch (error) {
      this.observer.log('error', `RG listing creation failed for ${item.name}: ${error.message}`);
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Select appropriate content framework based on product type
   */
  selectContentFramework(item, analysis) {
    const itemText = (item.name + ' ' + (item.description || '') + ' ' + (item.categories || '')).toLowerCase();
    
    // Category detection
    const categories = {
      lifestyle: itemText.includes('daily') || itemText.includes('routine') || itemText.includes('personal') || 
                itemText.includes('lifestyle') || itemText.includes('organizer') || itemText.includes('planner'),
      home: itemText.includes('home') || itemText.includes('kitchen') || itemText.includes('bath') || 
           itemText.includes('garden') || itemText.includes('decor') || itemText.includes('furniture'),
      fashion: itemText.includes('fashion') || itemText.includes('accessory') || itemText.includes('jewelry') || 
              itemText.includes('bag') || itemText.includes('watch') || itemText.includes('style'),
      general: true // Always available as fallback
    };
    
    // Select primary framework
    let frameworkType;
    if (categories.lifestyle && !categories.home && !categories.fashion) {
      frameworkType = 'lifestyle_products';
    } else if (categories.home) {
      frameworkType = 'home_garden';
    } else if (categories.fashion) {
      frameworkType = 'fashion_accessories';
    } else {
      frameworkType = 'general_merchandise';
    }
    
    const framework = this.contentFrameworks[frameworkType];
    
    return {
      type: frameworkType,
      ...framework,
      selectedOpening: this.selectRandomElement(framework.openings),
      selectedFocusAreas: this.selectRelevantElements(framework.focus_areas, 4),
      selectedBenefits: this.selectRelevantElements(framework.customer_benefits, 3),
      selectedTone: this.selectRandomElement(framework.emotional_tones),
      categories
    };
  }

  /**
   * Extract product attributes and benefits
   */
  extractProductAttributes(item, analysis) {
    const itemText = (item.name + ' ' + (item.description || '')).toLowerCase();
    
    // Extract key features
    const keyFeatures = [];
    if (itemText.includes('durable') || itemText.includes('sturdy')) keyFeatures.push('durable construction');
    if (itemText.includes('portable') || itemText.includes('lightweight')) keyFeatures.push('portable design');
    if (itemText.includes('easy') || itemText.includes('simple')) keyFeatures.push('easy to use');
    if (itemText.includes('versatile') || itemText.includes('multi')) keyFeatures.push('versatile functionality');
    if (itemText.includes('quality') || itemText.includes('premium')) keyFeatures.push('quality materials');
    
    // Extract customer benefits
    const customerBenefits = [];
    if (itemText.includes('save') || itemText.includes('efficient')) customerBenefits.push('time and effort savings');
    if (itemText.includes('organize') || itemText.includes('tidy')) customerBenefits.push('better organization');
    if (itemText.includes('comfort') || itemText.includes('soft')) customerBenefits.push('enhanced comfort');
    if (itemText.includes('style') || itemText.includes('attractive')) customerBenefits.push('improved aesthetics');
    
    // Determine value proposition
    const valueProposition = this.determineValueProposition(itemText, keyFeatures, customerBenefits);
    
    return {
      keyFeatures: keyFeatures.length > 0 ? keyFeatures : ['quality construction', 'reliable performance'],
      customerBenefits: customerBenefits.length > 0 ? customerBenefits : ['practical utility', 'customer satisfaction'],
      valueProposition
    };
  }

  /**
   * Adapt tone based on product type and target audience
   */
  adaptToneForProduct(item, framework, analysis) {
    const itemText = (item.name + ' ' + (item.description || '')).toLowerCase();
    
    // Determine appropriate tone based on product characteristics
    let selectedTone;
    
    if (framework.type === 'fashion_accessories') {
      selectedTone = 'stylish_confident';
    } else if (framework.type === 'home_garden') {
      selectedTone = 'comfortable_welcoming';
    } else if (itemText.includes('professional') || itemText.includes('business')) {
      selectedTone = 'professional_reliable';
    } else if (itemText.includes('fun') || itemText.includes('creative')) {
      selectedTone = 'friendly_enthusiastic';
    } else {
      selectedTone = 'practical_trustworthy';
    }
    
    return {
      selectedTone,
      adaptationReason: `Tone adapted for ${framework.type} category`,
      vocabularySet: this.selectVocabularyForTone(selectedTone)
    };
  }

  /**
   * Generate core content using AI
   */
  async generateCoreContent(item, framework, attributes, toneAdaptation) {
    const prompt = this.buildRGPrompt(item, framework, attributes, toneAdaptation);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        max_tokens: Math.ceil(this.options.targetWordCount * 1.5),
        temperature: 0.65, // Balanced creativity and consistency
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const description = response.choices[0].message.content.trim();
      
      return {
        primaryDescription: description,
        framework: framework.type,
        toneAdaptation: toneAdaptation.selectedTone,
        generationMetadata: {
          promptLength: prompt.length,
          responseLength: description.length,
          model: "gpt-4"
        }
      };

    } catch (error) {
      this.observer.log('error', `RG content generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build RG-specific prompt for content generation
   */
  buildRGPrompt(item, framework, attributes, toneAdaptation) {
    return `You are the content assistant for Richmond General, a versatile store that adapts to serve customers across all product categories. Create a compelling product description that demonstrates quality, reliability, and customer value while adapting appropriately to the specific product type.

PRODUCT TO DESCRIBE:
Name: "${item.name}"
${item.description ? `Current Description: "${item.description}"` : ''}
Category Framework: ${framework.type}

RICHMOND GENERAL IDENTITY:
- Versatile general merchandise store
- Quality-focused across all categories
- Customer-centric approach
- Reliable and trustworthy service
- Adaptable content for broad appeal

PRODUCT ATTRIBUTES:
Key Features: ${attributes.keyFeatures.join(', ')}
Customer Benefits: ${attributes.customerBenefits.join(', ')}
Value Proposition: ${attributes.valueProposition}

CONTENT FRAMEWORK:
Opening Style: ${framework.selectedOpening}
Focus Areas: ${framework.selectedFocusAreas.join(', ')}
Customer Benefits: ${framework.selectedBenefits.join(', ')}
Emotional Tone: ${framework.selectedTone}

TONE ADAPTATION:
Selected Tone: ${toneAdaptation.selectedTone}
Vocabulary Focus: ${toneAdaptation.vocabularySet.join(', ')}

WRITING REQUIREMENTS:
1. Write approximately ${this.options.targetWordCount} words
2. Adapt tone appropriately for the product category
3. Focus on customer benefits and practical value
4. Use accessible language that broad audiences understand
5. Emphasize quality and reliability
6. Include specific features that matter to customers
7. Create broad appeal while being category-appropriate

TONE GUIDELINES:
- Adaptable but consistently reliable and trustworthy
- Customer-focused with clear benefit communication
- Quality-oriented without being pretentious
- Accessible and approachable language
- Professional service approach

Create a description that makes customers feel confident they're making a smart purchase from a reliable store that understands their needs.`;
  }

  // Helper methods
  selectRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  selectRelevantElements(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  determineValueProposition(itemText, features, benefits) {
    if (features.includes('quality materials') && features.includes('durable construction')) {
      return 'Exceptional quality and lasting value for the discerning customer';
    } else if (benefits.includes('time and effort savings')) {
      return 'Practical efficiency that simplifies your daily routine';
    } else if (benefits.includes('improved aesthetics')) {
      return 'Perfect blend of function and style for your lifestyle';
    } else {
      return 'Reliable quality and practical value you can count on';
    }
  }

  selectVocabularyForTone(tone) {
    const vocabularySets = {
      'stylish_confident': ['stylish', 'confident', 'attractive', 'fashionable', 'expressive'],
      'comfortable_welcoming': ['comfortable', 'welcoming', 'cozy', 'pleasant', 'inviting'],
      'professional_reliable': ['professional', 'reliable', 'dependable', 'efficient', 'trustworthy'],
      'friendly_enthusiastic': ['wonderful', 'delightful', 'exciting', 'enjoyable', 'fantastic'],
      'practical_trustworthy': ['practical', 'trustworthy', 'valuable', 'sensible', 'dependable']
    };
    
    return vocabularySets[tone] || this.brandVoice.core_vocabulary.slice(0, 5);
  }

  async createContentEnhancements(coreContent, framework, attributes) {
    // Create variations and SEO enhancements (simplified for brevity)
    return {
      optimizedTitle: this.optimizeTitle(coreContent.primaryDescription),
      shortDescription: this.extractShortDescription(coreContent.primaryDescription),
      seoTitle: this.generateSEOTitle(coreContent.primaryDescription),
      metaDescription: this.generateMetaDescription(coreContent.primaryDescription),
      generalTags: this.generateGeneralTags(attributes),
      casualVariation: coreContent.primaryDescription,
      professionalVariation: coreContent.primaryDescription,
      enthusiastVariation: coreContent.primaryDescription
    };
  }

  optimizeTitle(description) {
    const firstSentence = description.split('.')[0];
    return firstSentence.length > 60 ? firstSentence.substring(0, 57) + '...' : firstSentence;
  }

  extractShortDescription(description) {
    const sentences = description.split('.');
    return sentences.slice(0, 2).join('.') + '.';
  }

  generateSEOTitle(description) {
    return this.optimizeTitle(description);
  }

  generateMetaDescription(description) {
    return this.extractShortDescription(description);
  }

  generateGeneralTags(attributes) {
    return [...attributes.keyFeatures, ...attributes.customerBenefits, 'quality', 'reliable'];
  }

  countWords(text) {
    return text.split(/\s+/).length;
  }

  assessBrandAlignment(description) {
    const alignmentScore = this.brandVoice.core_vocabulary.reduce((score, word) => {
      return description.toLowerCase().includes(word) ? score + 1 : score;
    }, 0);
    return Math.min(alignmentScore / this.brandVoice.core_vocabulary.length, 1.0);
  }

  calculateQualityScore(coreContent, enhancements) {
    const wordCount = this.countWords(coreContent.primaryDescription);
    const wordCountScore = Math.min(wordCount / this.options.targetWordCount, 1.0);
    const brandScore = this.assessBrandAlignment(coreContent.primaryDescription);
    return (wordCountScore + brandScore) / 2;
  }

  updateStats(listingPackage) {
    this.stats.listingsCreated++;
    this.stats.totalWordCount += listingPackage.contentAnalysis.wordCount;
    this.stats.averageWordCount = this.stats.totalWordCount / this.stats.listingsCreated;
    
    const framework = listingPackage.contentAnalysis.framework;
    const count = this.stats.categoryBreakdown.get(framework) || 0;
    this.stats.categoryBreakdown.set(framework, count + 1);
    
    const tone = listingPackage.contentAnalysis.toneAdaptation;
    const toneCount = this.stats.toneAdaptations.get(tone) || 0;
    this.stats.toneAdaptations.set(tone, toneCount + 1);
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return {
      ...this.stats,
      categoryBreakdown: Object.fromEntries(this.stats.categoryBreakdown),
      toneAdaptations: Object.fromEntries(this.stats.toneAdaptations)
    };
  }
}