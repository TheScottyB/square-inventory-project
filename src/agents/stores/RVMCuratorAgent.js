import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import OpenAI from 'openai';
import { CatalogObserver } from '../../observability/CatalogObserver.js';

/**
 * RVMCuratorAgent - Specialized content curator for Richmond Vintage Market
 * 
 * Specializes in vintage items with authentic historical context and nostalgic appeal.
 * Creates compelling product listings that honor the heritage and stories behind vintage pieces,
 * focusing on authenticity, historical significance, and timeless style.
 * 
 * Store Identity: Richmond Vintage Market (RVM)
 * - Authentic vintage items from various eras
 * - Historical context and provenance focus
 * - Nostalgic appeal with collector value
 * - Quality vintage pieces with character
 * - Sophisticated vintage aesthetic
 * 
 * Brand Voice: Knowledgeable, nostalgic, authentic, sophisticated, storytelling-focused
 */
export class RVMCuratorAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      targetWordCount: options.targetWordCount || 170,
      historicalDepth: options.historicalDepth || 'moderate', // 'light', 'moderate', 'deep'
      includeEra: options.includeEra || true,
      includeCondition: options.includeCondition || true,
      nostalgicTone: options.nostalgicTone || 'warm',
      ...options
    };

    // Initialize OpenAI
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // RVM-specific content frameworks organized by era
    this.contentFrameworks = {
      mid_century_modern: {
        era: '1940s-1960s',
        openings: [
          "From the golden age of mid-century design comes this exceptional piece...",
          "Post-war optimism and innovative design converge in this authentic mid-century treasure...",
          "Clean lines and functional beauty define this remarkable mid-century modern piece...",
          "The atomic age aesthetic lives on in this carefully preserved vintage classic..."
        ],
        
        focus_areas: [
          'design_innovation', 'atomic_age_aesthetic', 'functional_beauty', 
          'period_authenticity', 'cultural_significance', 'collector_value',
          'design_legacy', 'material_quality'
        ],
        
        historical_context: [
          'post-war design movement', 'atomic age influence', 'Scandinavian modernism',
          'American optimism', 'space age aesthetics', 'design democracy'
        ],
        
        emotional_tones: ['optimistic', 'sophisticated', 'innovative', 'timeless', 'iconic']
      },

      art_deco_era: {
        era: '1920s-1930s',
        openings: [
          "The Jazz Age comes alive in this spectacular Art Deco masterpiece...",
          "Geometric elegance and luxurious craftsmanship define this authentic 1920s treasure...",
          "From the era of speakeasies and glamour emerges this stunning period piece...",
          "Machine age precision meets artistic flair in this remarkable Art Deco original..."
        ],
        
        focus_areas: [
          'geometric_design', 'luxury_materials', 'craftsmanship_quality',
          'period_glamour', 'cultural_significance', 'artistic_movement',
          'jazz_age_spirit', 'modernist_influence'
        ],
        
        historical_context: [
          'roaring twenties', 'jazz age culture', 'machine age aesthetics',
          'luxury and glamour', 'modernist movement', 'geometric abstraction'
        ],
        
        emotional_tones: ['glamorous', 'sophisticated', 'bold', 'luxurious', 'dramatic']
      },

      victorian_era: {
        era: '1837-1901',
        openings: [
          "Victorian elegance and craftsmanship shine through in this exquisite period piece...",
          "From an era of refinement and attention to detail comes this beautiful vintage treasure...",
          "Ornate beauty and meticulous craftsmanship define this authentic Victorian original...",
          "The grandeur of the Victorian age is captured perfectly in this remarkable piece..."
        ],
        
        focus_areas: [
          'ornate_detailing', 'craftsmanship_tradition', 'period_authenticity',
          'cultural_refinement', 'material_luxury', 'decorative_arts',
          'social_history', 'artistic_heritage'
        ],
        
        historical_context: [
          'victorian refinement', 'industrial revolution', 'decorative arts movement',
          'social elegance', 'craftsmanship traditions', 'cultural sophistication'
        ],
        
        emotional_tones: ['elegant', 'refined', 'romantic', 'nostalgic', 'stately']
      },

      retro_vintage: {
        era: '1970s-1980s',
        openings: [
          "Retro cool meets vintage charm in this authentic piece from the groovy era...",
          "The bold aesthetics of the 70s and 80s come alive in this perfectly preserved piece...",
          "From disco to new wave, this vintage treasure captures the spirit of its time...",
          "Authentic retro style with unmistakable period character defines this unique find..."
        ],
        
        focus_areas: [
          'period_style', 'cultural_nostalgia', 'authentic_design',
          'retro_aesthetics', 'generational_appeal', 'style_revival',
          'pop_culture_influence', 'distinctive_character'
        ],
        
        historical_context: [
          'counter-culture movement', 'disco era', 'new wave aesthetics',
          'pop culture influence', 'bold design choices', 'generational style'
        ],
        
        emotional_tones: ['funky', 'nostalgic', 'bold', 'playful', 'distinctive']
      }
    };

    // RVM brand voice characteristics
    this.brandVoice = {
      vocabulary: [
        'authentic', 'vintage', 'original', 'period', 'heritage', 'timeless',
        'carefully preserved', 'historically significant', 'collector-worthy',
        'nostalgic', 'classic', 'era-defining', 'beautifully aged', 'genuine'
      ],
      
      historical_language: [
        'provenance', 'period correct', 'historically accurate', 'era-appropriate',
        'authentic to the time', 'culturally significant', 'design heritage'
      ],
      
      condition_language: [
        'beautifully preserved', 'showing character', 'age-appropriate wear',
        'vintage patina', 'collector condition', 'carefully maintained'
      ],
      
      tone_guidelines: [
        'Knowledgeable about historical context',
        'Respectful of vintage heritage',
        'Nostalgic without being overly sentimental',
        'Sophisticated appreciation for design history',
        'Authentic storytelling approach'
      ]
    };

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/rvm-curator'
    });

    this.stats = {
      listingsCreated: 0,
      averageWordCount: 0,
      totalWordCount: 0,
      eraBreakdown: new Map(),
      conditionCategories: new Map()
    };
  }

  /**
   * Create specialized product listing for Richmond Vintage Market
   * @param {Object} item - Product item data
   * @param {Object} analysis - Optional vision/content analysis
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Complete RVM listing package
   */
  async createProductListing(item, analysis = null, options = {}) {
    const traceId = this.observer.startTrace('create_rvm_listing');
    const startTime = Date.now();
    
    try {
      this.observer.log('info', `Creating RVM listing for: ${item.name}`);
      
      // Step 1: Determine era and framework
      const framework = this.selectContentFramework(item, analysis);
      
      // Step 2: Extract vintage attributes and historical context
      const vintageAttributes = this.extractVintageAttributes(item, analysis);
      
      // Step 3: Generate core content
      const coreContent = await this.generateCoreContent(item, framework, vintageAttributes);
      
      // Step 4: Create variations and enhancements
      const enhancements = await this.createContentEnhancements(coreContent, framework, vintageAttributes);
      
      // Step 5: Compile complete listing package
      const listingPackage = {
        itemId: item.sku || item.id || `rvm-${Date.now()}`,
        itemName: item.name,
        storeId: 'RVM',
        storeName: 'Richmond Vintage Market',
        timestamp: new Date().toISOString(),
        
        // Core content
        title: enhancements.optimizedTitle,
        description: coreContent.primaryDescription,
        shortDescription: enhancements.shortDescription,
        
        // RVM-specific content
        era: vintageAttributes.era,
        historicalContext: vintageAttributes.historicalContext,
        conditionNotes: vintageAttributes.conditionNotes,
        collectibility: vintageAttributes.collectibility,
        
        // Variations
        variations: {
          collector: enhancements.collectorVariation,
          nostalgic: enhancements.nostalgicVariation,
          contemporary: enhancements.contemporaryVariation
        },
        
        // SEO elements
        seoTitle: enhancements.seoTitle,
        metaDescription: enhancements.metaDescription,
        tags: enhancements.vintageTags,
        
        // Analytics
        contentAnalysis: {
          framework: framework.type,
          era: framework.era,
          wordCount: this.countWords(coreContent.primaryDescription),
          historicalDepth: this.options.historicalDepth,
          brandAlignment: this.assessBrandAlignment(coreContent.primaryDescription)
        },
        
        // Metadata
        metadata: {
          processingTime: Date.now() - startTime,
          agentVersion: 'RVM-Curator-1.0',
          qualityScore: this.calculateQualityScore(coreContent, enhancements)
        }
      };
      
      // Update statistics
      this.updateStats(listingPackage);
      
      this.observer.log('info', `RVM listing created for ${item.name} (${listingPackage.contentAnalysis.wordCount} words)`);
      this.observer.endTrace(traceId, { 
        wordCount: listingPackage.contentAnalysis.wordCount,
        era: framework.era,
        framework: framework.type 
      });
      
      this.emit('listing-created', listingPackage);
      
      return listingPackage;

    } catch (error) {
      this.observer.log('error', `RVM listing creation failed for ${item.name}: ${error.message}`);
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Select appropriate content framework based on era and style
   */
  selectContentFramework(item, analysis) {
    const itemText = (item.name + ' ' + (item.description || '') + ' ' + (item.categories || '')).toLowerCase();
    
    // Era detection
    const eraClues = {
      midCentury: itemText.includes('mid century') || itemText.includes('1950') || itemText.includes('1960') || 
                 itemText.includes('atomic') || itemText.includes('boomerang') || itemText.includes('eames'),
      artDeco: itemText.includes('art deco') || itemText.includes('1920') || itemText.includes('1930') || 
              itemText.includes('geometric') || itemText.includes('chrome') || itemText.includes('streamline'),
      victorian: itemText.includes('victorian') || itemText.includes('1800') || itemText.includes('ornate') || 
                itemText.includes('carved') || itemText.includes('mahogany') || itemText.includes('crystal'),
      retro: itemText.includes('70s') || itemText.includes('80s') || itemText.includes('retro') || 
            itemText.includes('disco') || itemText.includes('neon') || itemText.includes('plastic')
    };
    
    // Select primary framework
    let frameworkType;
    if (eraClues.midCentury) {
      frameworkType = 'mid_century_modern';
    } else if (eraClues.artDeco) {
      frameworkType = 'art_deco_era';
    } else if (eraClues.victorian) {
      frameworkType = 'victorian_era';
    } else if (eraClues.retro) {
      frameworkType = 'retro_vintage';
    } else {
      // Default to mid-century for general vintage items
      frameworkType = 'mid_century_modern';
    }
    
    const framework = this.contentFrameworks[frameworkType];
    
    return {
      type: frameworkType,
      ...framework,
      selectedOpening: this.selectRandomElement(framework.openings),
      selectedFocusAreas: this.selectRelevantElements(framework.focus_areas, 4),
      selectedContext: this.selectRelevantElements(framework.historical_context, 2),
      selectedTone: this.selectRandomElement(framework.emotional_tones),
      eraClues
    };
  }

  /**
   * Extract vintage-specific attributes and historical context
   */
  extractVintageAttributes(item, analysis) {
    const itemText = (item.name + ' ' + (item.description || '')).toLowerCase();
    
    // Extract era information
    const era = this.determineEra(itemText);
    
    // Extract condition information
    const conditionNotes = this.assessCondition(itemText);
    
    // Extract collectibility factors
    const collectibility = this.assessCollectibility(itemText);
    
    // Extract historical context
    const historicalContext = this.extractHistoricalContext(itemText, era);
    
    return {
      era,
      conditionNotes,
      collectibility,
      historicalContext
    };
  }

  /**
   * Generate core content using AI
   */
  async generateCoreContent(item, framework, attributes) {
    const prompt = this.buildRVMPrompt(item, framework, attributes);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        max_tokens: Math.ceil(this.options.targetWordCount * 1.5),
        temperature: 0.75, // Higher creativity for storytelling
        presence_penalty: 0.3,
        frequency_penalty: 0.2
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
      this.observer.log('error', `RVM content generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build RVM-specific prompt for content generation
   */
  buildRVMPrompt(item, framework, attributes) {
    return `You are the head curator for Richmond Vintage Market, a prestigious vintage store known for authentic, historically significant pieces. Create a compelling product description that honors the heritage and story of this vintage item while appealing to collectors and vintage enthusiasts.

ITEM TO DESCRIBE:
Name: "${item.name}"
${item.description ? `Current Description: "${item.description}"` : ''}
Era Framework: ${framework.type} (${framework.era})

RICHMOND VINTAGE MARKET IDENTITY:
- Prestigious vintage marketplace
- Focus on authentic, historically significant pieces
- Knowledgeable curation and historical context
- Appeal to serious collectors and vintage enthusiasts
- Sophisticated appreciation for design heritage

VINTAGE ATTRIBUTES:
Era: ${attributes.era}
Historical Context: ${attributes.historicalContext}
Condition: ${attributes.conditionNotes}
Collectibility: ${attributes.collectibility}

CONTENT FRAMEWORK:
Opening Style: ${framework.selectedOpening}
Focus Areas: ${framework.selectedFocusAreas.join(', ')}
Historical Context: ${framework.selectedContext.join(', ')}
Emotional Tone: ${framework.selectedTone}

WRITING REQUIREMENTS:
1. Write approximately ${this.options.targetWordCount} words
2. Include authentic historical context and era-specific details
3. Honor the heritage and story behind the piece
4. Appeal to both collectors and vintage enthusiasts
5. Use sophisticated, knowledgeable vintage terminology
6. Include condition and authenticity notes naturally
7. Create nostalgic appeal without being overly sentimental

TONE GUIDELINES:
- Knowledgeable curator sharing expertise
- Sophisticated appreciation for vintage design
- Authentic storytelling with historical accuracy
- Nostalgic warmth without excessive sentimentality
- Professional vintage marketplace standards

Create a description that makes collectors and vintage lovers feel they've discovered a truly special piece with authentic heritage and character.`;
  }

  // Helper methods
  selectRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  selectRelevantElements(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  determineEra(itemText) {
    if (itemText.includes('1920') || itemText.includes('1930') || itemText.includes('art deco')) {
      return '1920s-1930s Art Deco Era';
    } else if (itemText.includes('1940') || itemText.includes('1950') || itemText.includes('1960') || itemText.includes('mid century')) {
      return '1940s-1960s Mid-Century Modern';
    } else if (itemText.includes('1970') || itemText.includes('1980') || itemText.includes('70s') || itemText.includes('80s')) {
      return '1970s-1980s Retro Era';
    } else if (itemText.includes('victorian') || itemText.includes('1800')) {
      return 'Victorian Era (1837-1901)';
    } else {
      return 'Mid-20th Century Vintage';
    }
  }

  assessCondition(itemText) {
    if (itemText.includes('excellent') || itemText.includes('mint')) {
      return 'Excellent vintage condition with minimal signs of age';
    } else if (itemText.includes('good') || itemText.includes('fine')) {
      return 'Good vintage condition with appropriate age-related character';
    } else if (itemText.includes('fair') || itemText.includes('wear')) {
      return 'Shows honest vintage wear consistent with age and use';
    } else {
      return 'Authentic vintage condition with beautiful patina';
    }
  }

  assessCollectibility(itemText) {
    if (itemText.includes('rare') || itemText.includes('scarce')) {
      return 'Highly collectible and increasingly rare';
    } else if (itemText.includes('signed') || itemText.includes('designer')) {
      return 'Designer piece with enhanced collector value';
    } else if (itemText.includes('original') || itemText.includes('authentic')) {
      return 'Authentic period piece with collector appeal';
    } else {
      return 'Solid vintage collectible with enduring appeal';
    }
  }

  extractHistoricalContext(itemText, era) {
    // This would be more sophisticated in production
    return `Represents the design aesthetics and cultural values of the ${era}`;
  }

  async createContentEnhancements(coreContent, framework, attributes) {
    // Create variations and SEO enhancements (simplified for brevity)
    return {
      optimizedTitle: this.optimizeTitle(coreContent.primaryDescription),
      shortDescription: this.extractShortDescription(coreContent.primaryDescription),
      seoTitle: this.generateSEOTitle(coreContent.primaryDescription, attributes.era),
      metaDescription: this.generateMetaDescription(coreContent.primaryDescription),
      vintageTags: this.generateVintageTags(attributes),
      collectorVariation: coreContent.primaryDescription,
      nostalgicVariation: coreContent.primaryDescription,
      contemporaryVariation: coreContent.primaryDescription
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

  generateSEOTitle(description, era) {
    return `${this.optimizeTitle(description)} - ${era}`;
  }

  generateMetaDescription(description) {
    return this.extractShortDescription(description);
  }

  generateVintageTags(attributes) {
    return [attributes.era, attributes.collectibility, 'vintage', 'collectible', 'authentic'];
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
    
    const era = listingPackage.contentAnalysis.era;
    const eraCount = this.stats.eraBreakdown.get(era) || 0;
    this.stats.eraBreakdown.set(era, eraCount + 1);
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return {
      ...this.stats,
      eraBreakdown: Object.fromEntries(this.stats.eraBreakdown),
      conditionCategories: Object.fromEntries(this.stats.conditionCategories)
    };
  }
}