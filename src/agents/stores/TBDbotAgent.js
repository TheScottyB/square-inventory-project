import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import OpenAI from 'openai';
import { CatalogObserver } from '../../observability/CatalogObserver.js';

/**
 * TBDbotAgent - Specialized content curator for TBDLabz store
 * 
 * Specializes in tech/maker products and digital/audio production equipment.
 * Creates compelling product listings that blend technical expertise with creative inspiration,
 * focusing on innovation, functionality, and creative potential.
 * 
 * Store Identity: TBDLabz (related to TBDStudio)
 * - Tech/maker products (electronics, components, tools)
 * - Digital/audio production equipment (interfaces, microphones, software)
 * - Creative tools and innovation-focused products
 * - Technical accuracy with creative inspiration
 * - Professional yet accessible tone
 * 
 * Brand Voice: Innovative, technical, creative, precise, inspiring, forward-thinking
 */
export class TBDbotAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      targetWordCount: options.targetWordCount || 160,
      technicalDepth: options.technicalDepth || 'balanced', // 'basic', 'balanced', 'advanced'
      includeSpecs: options.includeSpecs || true,
      includeUseCase: options.includeUseCase || true,
      creativeFocus: options.creativeFocus || true,
      ...options
    };

    // Initialize OpenAI
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // TBDbot-specific content frameworks
    this.contentFrameworks = {
      audio_production: {
        openings: [
          "Professional-grade audio production meets innovative design in this essential studio tool...",
          "Precision engineering and creative workflow unite in this advanced audio solution...",
          "From bedroom producers to professional studios, this equipment delivers exceptional sonic results...",
          "Cutting-edge audio technology crafted for the discerning creative professional..."
        ],
        
        focus_areas: [
          'audio_quality', 'professional_features', 'workflow_integration', 
          'build_quality', 'versatility', 'creative_potential',
          'technical_specifications', 'studio_compatibility'
        ],
        
        use_cases: [
          'home studio recording', 'professional audio production', 'podcast creation',
          'music composition', 'sound design', 'live performance',
          'audio post-production', 'streaming setup'
        ],
        
        emotional_tones: ['precision', 'innovation', 'creativity', 'professional', 'inspiring']
      },

      maker_electronics: {
        openings: [
          "Innovation meets functionality in this essential maker toolkit component...",
          "Designed for creators who demand precision and reliability in their electronic projects...",
          "From prototype to production, this component delivers consistent performance...",
          "Engineering excellence meets creative potential in this versatile electronic solution..."
        ],
        
        focus_areas: [
          'build_quality', 'technical_specifications', 'compatibility',
          'reliability', 'versatility', 'innovation',
          'ease_of_use', 'project_potential'
        ],
        
        use_cases: [
          'prototyping projects', 'maker installations', 'educational projects',
          'IoT development', 'automation systems', 'creative electronics',
          'research applications', 'hobby projects'
        ],
        
        emotional_tones: ['innovative', 'reliable', 'versatile', 'technical', 'creative']
      },

      digital_tools: {
        openings: [
          "Streamline your digital workflow with this powerful creative tool...",
          "Professional-grade software meets intuitive design for maximum productivity...",
          "Transform your creative process with this innovative digital solution...",
          "Precision meets creativity in this essential digital production tool..."
        ],
        
        focus_areas: [
          'user_experience', 'feature_set', 'performance',
          'compatibility', 'workflow_efficiency', 'creative_features',
          'professional_capabilities', 'learning_curve'
        ],
        
        use_cases: [
          'content creation', 'digital production', 'workflow automation',
          'creative projects', 'professional development', 'collaboration',
          'project management', 'media production'
        ],
        
        emotional_tones: ['efficient', 'powerful', 'intuitive', 'professional', 'innovative']
      },

      hardware_tools: {
        openings: [
          "Precision engineering meets practical functionality in this essential maker tool...",
          "Built for creators who demand accuracy and reliability in every project...",
          "Professional-grade construction meets everyday usability in this versatile tool...",
          "From concept to completion, this tool delivers consistent, reliable performance..."
        ],
        
        focus_areas: [
          'build_quality', 'precision', 'durability',
          'ergonomics', 'versatility', 'accuracy',
          'professional_features', 'value_proposition'
        ],
        
        use_cases: [
          'precision manufacturing', 'prototyping work', 'repair projects',
          'creative fabrication', 'educational use', 'professional projects',
          'maker space applications', 'DIY projects'
        ],
        
        emotional_tones: ['precise', 'reliable', 'durable', 'professional', 'practical']
      }
    };

    // TBDbot brand voice characteristics
    this.brandVoice = {
      vocabulary: [
        'innovative', 'precision', 'professional-grade', 'cutting-edge', 'versatile',
        'reliable', 'advanced', 'intuitive', 'powerful', 'efficient', 'creative',
        'technical', 'engineered', 'optimized', 'streamlined', 'integrated'
      ],
      
      technical_language: [
        'specifications', 'compatibility', 'performance', 'workflow', 'interface',
        'integration', 'functionality', 'capabilities', 'architecture', 'protocol'
      ],
      
      avoid_words: [
        'cheap', 'basic', 'simple', 'amateur', 'toy-like',
        'limited', 'outdated', 'primitive'
      ],
      
      tone_guidelines: [
        'Technical accuracy without overwhelming jargon',
        'Professional yet accessible to makers',
        'Inspiring creativity while maintaining precision',
        'Forward-thinking and innovation-focused',
        'Practical benefits clearly communicated'
      ]
    };

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/tbdbot-agent'
    });

    this.stats = {
      listingsCreated: 0,
      averageWordCount: 0,
      totalWordCount: 0,
      categoryBreakdown: new Map(),
      technicalDepthDistribution: new Map()
    };
  }

  /**
   * Create specialized product listing for TBDLabz store
   * @param {Object} item - Product item data
   * @param {Object} analysis - Optional vision/content analysis
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Complete TBDLabz listing package
   */
  async createProductListing(item, analysis = null, options = {}) {
    const traceId = this.observer.startTrace('create_tbdbot_listing');
    const startTime = Date.now();
    
    try {
      this.observer.log('info', `Creating TBDbot listing for: ${item.name}`);
      
      // Step 1: Determine product category and framework
      const framework = this.selectContentFramework(item, analysis);
      
      // Step 2: Extract technical specifications and features
      const technicalAttributes = this.extractTechnicalAttributes(item, analysis);
      
      // Step 3: Generate core content
      const coreContent = await this.generateCoreContent(item, framework, technicalAttributes);
      
      // Step 4: Create variations and enhancements
      const enhancements = await this.createContentEnhancements(coreContent, framework, technicalAttributes);
      
      // Step 5: Compile complete listing package
      const listingPackage = {
        itemId: item.sku || item.id || `tbdbot-${Date.now()}`,
        itemName: item.name,
        storeId: 'TBDLabz',
        storeName: 'TBDLabz - Tech & Maker Solutions',
        timestamp: new Date().toISOString(),
        
        // Core content
        title: enhancements.optimizedTitle,
        description: coreContent.primaryDescription,
        shortDescription: enhancements.shortDescription,
        
        // TBDbot-specific content
        technicalSpecs: technicalAttributes.specifications,
        useCases: technicalAttributes.useCases,
        compatibilityInfo: technicalAttributes.compatibility,
        
        // Variations
        variations: {
          technical: enhancements.technicalVariation,
          creative: enhancements.creativeVariation,
          beginner: enhancements.beginnerVariation
        },
        
        // SEO elements
        seoTitle: enhancements.seoTitle,
        metaDescription: enhancements.metaDescription,
        tags: enhancements.technicalTags,
        
        // Analytics
        contentAnalysis: {
          framework: framework.type,
          wordCount: this.countWords(coreContent.primaryDescription),
          technicalDepth: this.options.technicalDepth,
          brandAlignment: this.assessBrandAlignment(coreContent.primaryDescription)
        },
        
        // Metadata
        metadata: {
          processingTime: Date.now() - startTime,
          agentVersion: 'TBDbot-1.0',
          qualityScore: this.calculateQualityScore(coreContent, enhancements)
        }
      };
      
      // Update statistics
      this.updateStats(listingPackage);
      
      this.observer.log('info', `TBDbot listing created for ${item.name} (${listingPackage.contentAnalysis.wordCount} words)`);
      this.observer.endTrace(traceId, { 
        wordCount: listingPackage.contentAnalysis.wordCount,
        framework: framework.type 
      });
      
      this.emit('listing-created', listingPackage);
      
      return listingPackage;

    } catch (error) {
      this.observer.log('error', `TBDbot listing creation failed for ${item.name}: ${error.message}`);
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
      audio: itemText.includes('audio') || itemText.includes('microphone') || itemText.includes('speaker') || 
             itemText.includes('interface') || itemText.includes('headphone') || itemText.includes('monitor'),
      electronics: itemText.includes('circuit') || itemText.includes('sensor') || itemText.includes('arduino') || 
                  itemText.includes('raspberry') || itemText.includes('component') || itemText.includes('module'),
      software: itemText.includes('software') || itemText.includes('app') || itemText.includes('plugin') || 
               itemText.includes('digital') || itemText.includes('license') || itemText.includes('subscription'),
      tools: itemText.includes('tool') || itemText.includes('meter') || itemText.includes('tester') || 
            itemText.includes('multimeter') || itemText.includes('oscilloscope') || itemText.includes('analyzer')
    };
    
    // Select primary framework
    let frameworkType;
    if (categories.audio) {
      frameworkType = 'audio_production';
    } else if (categories.electronics) {
      frameworkType = 'maker_electronics';
    } else if (categories.software) {
      frameworkType = 'digital_tools';
    } else {
      frameworkType = 'hardware_tools';
    }
    
    const framework = this.contentFrameworks[frameworkType];
    
    return {
      type: frameworkType,
      ...framework,
      selectedOpening: this.selectRandomElement(framework.openings),
      selectedFocusAreas: this.selectRelevantElements(framework.focus_areas, 4),
      selectedUseCases: this.selectRelevantElements(framework.use_cases, 3),
      selectedTone: this.selectRandomElement(framework.emotional_tones),
      categories
    };
  }

  /**
   * Extract technical specifications and attributes
   */
  extractTechnicalAttributes(item, analysis) {
    const itemText = (item.name + ' ' + (item.description || '')).toLowerCase();
    
    // Extract specifications
    const specifications = [];
    
    // Common tech specs patterns
    const specPatterns = [
      /(\d+)\s*hz/gi,
      /(\d+)\s*khz/gi,
      /(\d+)\s*bit/gi,
      /(\d+)\s*v\b/gi,
      /(\d+)\s*ma/gi,
      /(\d+)\s*ohm/gi,
      /usb\s*\d\.\d/gi,
      /bluetooth/gi,
      /wifi/gi,
      /(\d+)\s*gb/gi
    ];
    
    specPatterns.forEach(pattern => {
      const matches = itemText.match(pattern);
      if (matches) specifications.push(...matches);
    });
    
    // Extract compatibility information
    const compatibility = [];
    if (itemText.includes('windows')) compatibility.push('Windows');
    if (itemText.includes('mac') || itemText.includes('macos')) compatibility.push('macOS');
    if (itemText.includes('linux')) compatibility.push('Linux');
    if (itemText.includes('ios')) compatibility.push('iOS');
    if (itemText.includes('android')) compatibility.push('Android');
    
    return {
      specifications: specifications.length > 0 ? specifications : ['Professional-grade specifications'],
      compatibility: compatibility.length > 0 ? compatibility : ['Universal compatibility'],
      useCases: this.generateUseCases(item, analysis)
    };
  }

  /**
   * Generate core content using AI
   */
  async generateCoreContent(item, framework, attributes) {
    const prompt = this.buildTBDbotPrompt(item, framework, attributes);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        max_tokens: Math.ceil(this.options.targetWordCount * 1.5),
        temperature: 0.6, // Slightly lower for technical accuracy
        presence_penalty: 0.2,
        frequency_penalty: 0.1
      });

      const description = response.choices[0].message.content.trim();
      
      return {
        primaryDescription: description,
        framework: framework.type,
        generationMetadata: {
          promptLength: prompt.length,
          responseLength: description.length,
          model: "gpt-4"
        }
      };

    } catch (error) {
      this.observer.log('error', `TBDbot content generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build TBDbot-specific prompt for content generation
   */
  buildTBDbotPrompt(item, framework, attributes) {
    return `You are the technical content specialist for TBDLabz, a cutting-edge tech and maker store. Create a compelling product description that balances technical accuracy with creative inspiration, appealing to both professional creators and passionate makers.

PRODUCT TO DESCRIBE:
Name: "${item.name}"
${item.description ? `Current Description: "${item.description}"` : ''}
Category Framework: ${framework.type}

TBDLABZ BRAND IDENTITY:
- Cutting-edge tech and maker solutions
- Professional-grade quality with maker accessibility
- Innovation-focused and forward-thinking
- Technical precision with creative inspiration
- Supporting creators from hobbyists to professionals

TECHNICAL ATTRIBUTES:
Specifications: ${attributes.specifications.join(', ')}
Compatibility: ${attributes.compatibility.join(', ')}
Use Cases: ${attributes.useCases}

CONTENT FRAMEWORK:
Opening Style: ${framework.selectedOpening}
Focus Areas: ${framework.selectedFocusAreas.join(', ')}
Use Cases: ${framework.selectedUseCases.join(', ')}
Emotional Tone: ${framework.selectedTone}

WRITING REQUIREMENTS:
1. Write approximately ${this.options.targetWordCount} words
2. Balance technical accuracy with accessibility
3. Include specific technical benefits and features
4. Highlight creative potential and innovation
5. Appeal to both professionals and makers
6. Use precise but not overwhelming technical language
7. Focus on practical applications and workflow benefits

TONE GUIDELINES:
- Technical accuracy without intimidating jargon
- Professional yet accessible to makers of all levels
- Innovation-focused and forward-thinking
- Practical benefits clearly communicated
- Inspiring creativity and technical excellence

Create a description that makes both professional creators and passionate makers feel confident this product will enhance their projects and workflow.`;
  }

  // Helper methods
  selectRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  selectRelevantElements(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  generateUseCases(item, analysis) {
    const itemText = (item.name + ' ' + (item.description || '')).toLowerCase();
    
    if (itemText.includes('audio') || itemText.includes('microphone')) {
      return 'recording, production, streaming, podcasting';
    } else if (itemText.includes('electronic') || itemText.includes('component')) {
      return 'prototyping, maker projects, IoT development, automation';
    } else if (itemText.includes('software') || itemText.includes('digital')) {
      return 'content creation, workflow optimization, digital production';
    } else {
      return 'professional projects, maker applications, creative development';
    }
  }

  async createContentEnhancements(coreContent, framework, attributes) {
    // Create variations and SEO enhancements (simplified for brevity)
    return {
      optimizedTitle: this.optimizeTitle(coreContent.primaryDescription),
      shortDescription: this.extractShortDescription(coreContent.primaryDescription),
      seoTitle: this.generateSEOTitle(coreContent.primaryDescription),
      metaDescription: this.generateMetaDescription(coreContent.primaryDescription),
      technicalTags: this.generateTechnicalTags(attributes),
      technicalVariation: coreContent.primaryDescription,
      creativeVariation: coreContent.primaryDescription,
      beginnerVariation: coreContent.primaryDescription
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

  generateTechnicalTags(attributes) {
    return [...attributes.specifications, ...attributes.compatibility];
  }

  countWords(text) {
    return text.split(/\s+/).length;
  }

  assessBrandAlignment(description) {
    const alignmentScore = this.brandVoice.vocabulary.reduce((score, word) => {
      return description.toLowerCase().includes(word) ? score + 1 : score;
    }, 0);
    return Math.min(alignmentScore / this.brandVoice.vocabulary.length, 1.0);
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
    
    const depthCount = this.stats.technicalDepthDistribution.get(this.options.technicalDepth) || 0;
    this.stats.technicalDepthDistribution.set(this.options.technicalDepth, depthCount + 1);
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return {
      ...this.stats,
      categoryBreakdown: Object.fromEntries(this.stats.categoryBreakdown),
      technicalDepthDistribution: Object.fromEntries(this.stats.technicalDepthDistribution)
    };
  }
}