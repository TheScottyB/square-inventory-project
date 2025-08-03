import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import OpenAI from 'openai';
import { CatalogObserver } from '../observability/CatalogObserver.js';

/**
 * NarrativeSpecialistAgent - Master storyteller for individualized item narratives
 * 
 * This agent creates unique, compelling stories for each item based on:
 * - Vision analysis from VisionItemAnalysisAgent
 * - Research data from SEOResearchAgent  
 * - Cultural context and historical significance
 * - Target audience and emotional resonance
 * 
 * Specializes in multiple narrative styles:
 * - Heritage & Legacy stories (vintage, antique, cultural pieces)
 * - Mystical & Spiritual narratives (crystals, chakra items, ritual objects)
 * - Artisan & Craft stories (handmade, unique, artistic pieces)
 * - Discovery & Adventure tales (rare finds, unique origins)
 * - Transformation & Personal Journey narratives (life-changing items)
 * - Romance & Beauty stories (jewelry, elegant pieces)
 * 
 * Each story is:
 * - Completely unique to that specific item
 * - SEO-optimized with natural keyword integration
 * - Emotionally resonant with target audiences
 * - Authentic to the item's cultural/historical context
 * - Compelling enough to drive purchase decisions
 */
export class NarrativeSpecialistAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      narrativeStyle: options.narrativeStyle || 'adaptive', // 'adaptive', 'romantic', 'mystical', 'historical', 'modern'
      targetWordCount: options.targetWordCount || 150,
      includeKeywords: options.includeKeywords || true,
      keywordDensity: options.keywordDensity || 0.02, // 2%
      emotionalIntensity: options.emotionalIntensity || 'moderate', // 'subtle', 'moderate', 'intense'
      culturalSensitivity: options.culturalSensitivity || 'high',
      ...options
    };

    // Initialize OpenAI
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Narrative frameworks by category and style
    this.narrativeFrameworks = {
      heritage_legacy: {
        openings: [
          "In the quiet corners of an estate sale, whispers of history beckoned...",
          "Generations of careful hands have shaped this piece, each leaving their mark...",
          "From the ateliers of master craftsmen comes a story of dedication...",
          "Time has been kind to this piece, preserving its essence through decades..."
        ],
        
        themes: [
          'generational_wisdom', 'master_craftsmanship', 'cultural_preservation', 
          'timeless_elegance', 'historical_significance', 'family_heirloom'
        ],
        
        emotional_tones: ['reverence', 'nostalgia', 'pride', 'connection', 'authenticity'],
        
        closing_styles: [
          'legacy_continuation', 'stewardship_invitation', 'heritage_celebration',
          'timeless_appreciation', 'cultural_honoring'
        ]
      },

      mystical_spiritual: {
        openings: [
          "Ancient wisdom flows through crystalline structures, carrying messages from Earth's heart...",
          "In sacred traditions passed down through millennia, this piece holds power...",
          "The universe conspires to bring certain energies into your path...",
          "Chakras align and energy flows when intention meets sacred geometry..."
        ],
        
        themes: [
          'energy_alignment', 'spiritual_awakening', 'chakra_healing', 'manifestation',
          'protection_blessing', 'meditation_enhancement', 'sacred_connection'
        ],
        
        emotional_tones: ['transcendence', 'peace', 'empowerment', 'healing', 'connection'],
        
        closing_styles: [
          'energy_invitation', 'spiritual_journey', 'transformation_promise',
          'sacred_partnership', 'divine_alignment'
        ]
      },

      artisan_craft: {
        openings: [
          "In the hands of a master artisan, raw materials transform into poetry...",
          "Each tool mark tells a story of passion meeting precision...",
          "Hours of patient work culminate in moments of perfect beauty...",
          "Traditional techniques meet modern vision in this handcrafted treasure..."
        ],
        
        themes: [
          'handcrafted_excellence', 'artistic_vision', 'skill_mastery', 'creative_passion',
          'unique_expression', 'artisan_tradition', 'functional_beauty'
        ],
        
        emotional_tones: ['appreciation', 'admiration', 'inspiration', 'quality', 'uniqueness'],
        
        closing_styles: [
          'artisan_celebration', 'craft_appreciation', 'uniqueness_emphasis',
          'quality_assurance', 'artistic_partnership'
        ]
      },

      discovery_adventure: {
        openings: [
          "Hidden treasures reveal themselves to those who know where to look...",
          "Every collector dreams of that moment when rarity meets opportunity...",
          "In dusty corners of forgotten places, extraordinary things wait patiently...",
          "The thrill of discovery never fades for those who seek the exceptional..."
        ],
        
        themes: [
          'rare_discovery', 'collector_excitement', 'hidden_treasure', 'unique_find',
          'adventure_story', 'serendipitous_encounter', 'exceptional_rarity'
        ],
        
        emotional_tones: ['excitement', 'curiosity', 'satisfaction', 'pride', 'adventure'],
        
        closing_styles: [
          'collector_invitation', 'rarity_emphasis', 'discovery_celebration',
          'treasure_acquisition', 'adventure_sharing'
        ]
      },

      transformation_journey: {
        openings: [
          "Some objects enter our lives not as possessions, but as catalysts...",
          "Personal transformation often begins with a single, meaningful choice...",
          "In the space between desire and fulfillment, magic happens...",
          "Life's most beautiful chapters often start with unexpected encounters..."
        ],
        
        themes: [
          'personal_transformation', 'life_enhancement', 'daily_ritual', 'mindful_living',
          'self_expression', 'confidence_building', 'lifestyle_elevation'
        ],
        
        emotional_tones: ['empowerment', 'transformation', 'confidence', 'joy', 'fulfillment'],
        
        closing_styles: [
          'transformation_invitation', 'lifestyle_enhancement', 'personal_growth',
          'daily_joy', 'life_enrichment'
        ]
      },

      romance_beauty: {
        openings: [
          "Beauty has a language all its own, speaking directly to the heart...",
          "In the dance between light and form, elegance finds its voice...",
          "Romance lives in the details that make hearts skip a beat...",
          "Some pieces are destined for moments that take your breath away..."
        ],
        
        themes: [
          'timeless_beauty', 'romantic_elegance', 'feminine_grace', 'special_occasions',
          'love_celebration', 'beauty_enhancement', 'elegant_sophistication'
        ],
        
        emotional_tones: ['romance', 'beauty', 'elegance', 'love', 'sophistication'],
        
        closing_styles: [
          'romantic_promise', 'beauty_celebration', 'elegance_enhancement',
          'special_moment', 'love_expression'
        ]
      }
    };

    // Cultural context adaptations
    this.culturalAdaptations = {
      french: {
        vocabulary: ['atelier', 'artisan', 'savoir-faire', 'élégance', 'raffinement'],
        references: ['Parisian chic', 'French countryside', 'artistic heritage', 'cultural sophistication'],
        narrative_style: 'sophisticated, romantic, with emphasis on craftsmanship and cultural heritage'
      },
      
      spiritual: {
        vocabulary: ['chakra', 'energy', 'alignment', 'manifestation', 'sacred'],
        references: ['ancient wisdom', 'spiritual journey', 'energy work', 'mindful practice'],
        narrative_style: 'reverent, mystical, with focus on spiritual properties and transformative power'
      },
      
      vintage: {
        vocabulary: ['authentic', 'era', 'collector', 'timeless', 'heritage'],
        references: ['bygone era', 'nostalgic charm', 'vintage appeal', 'historical significance'],
        narrative_style: 'nostalgic, historically aware, with emphasis on authenticity and rarity'
      }
    };

    // SEO integration patterns
    this.seoIntegrationPatterns = {
      natural_keyword_placement: [
        'opening_sentence', 'middle_description', 'closing_statement'
      ],
      
      semantic_variations: [
        'synonyms', 'related_terms', 'contextual_alternatives'
      ],
      
      long_tail_integration: [
        'specific_descriptors', 'use_case_scenarios', 'target_audience_language'
      ]
    };

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/narrative-specialist'
    });

    this.stats = {
      narrativesCreated: 0,
      averageWordCount: 0,
      totalWordCount: 0,
      keywordIntegrations: 0,
      culturalAdaptations: 0,
      narrativeStyles: new Map()
    };
  }

  /**
   * Create individualized narrative for an item
   * @param {Object} item - Item data
   * @param {Object} visionAnalysis - Vision analysis results
   * @param {Object} seoResearch - SEO research results
   * @param {Object} options - Narrative options
   * @returns {Promise<Object>} Complete narrative package
   */
  async createIndividualizedNarrative(item, visionAnalysis = null, seoResearch = null, options = {}) {
    const traceId = this.observer.startTrace('create_individualized_narrative');
    const narrativeStart = Date.now();
    
    try {
      this.observer.log('info', `Creating narrative for: ${item.name}`);
      
      // Step 1: Analyze item context and select narrative framework
      const narrativeFramework = this.selectNarrativeFramework(item, visionAnalysis, seoResearch);
      
      // Step 2: Determine cultural context and adaptations
      const culturalContext = this.determineCulturalContext(item, visionAnalysis, seoResearch);
      
      // Step 3: Extract SEO elements for natural integration
      const seoElements = this.extractSEOElements(seoResearch, narrativeFramework);
      
      // Step 4: Generate the core narrative
      const coreNarrative = await this.generateCoreNarrative(
        item, 
        narrativeFramework, 
        culturalContext, 
        visionAnalysis, 
        seoElements
      );
      
      // Step 5: Optimize for SEO while maintaining authenticity
      const optimizedNarrative = await this.optimizeNarrativeForSEO(
        coreNarrative, 
        seoElements, 
        narrativeFramework
      );
      
      // Step 6: Create variations for different contexts
      const narrativeVariations = await this.createNarrativeVariations(
        optimizedNarrative, 
        narrativeFramework,
        seoElements
      );
      
      // Step 7: Compile complete narrative package
      const narrativePackage = {
        itemId: item.sku || item.id || `item-${Date.now()}`,
        itemName: item.name,
        timestamp: new Date().toISOString(),
        
        // Core narrative content
        primaryNarrative: optimizedNarrative.primary,
        variations: narrativeVariations,
        
        // SEO-optimized versions
        seoTitle: optimizedNarrative.seoTitle,
        metaDescription: optimizedNarrative.metaDescription,
        shortDescription: optimizedNarrative.shortDescription,
        longDescription: optimizedNarrative.longDescription,
        
        // Narrative analysis
        narrativeAnalysis: {
          framework: narrativeFramework.type,
          culturalContext: culturalContext.primary,
          emotionalTone: narrativeFramework.selectedTone,
          wordCount: this.countWords(optimizedNarrative.primary),
          keywordDensity: this.calculateKeywordDensity(optimizedNarrative.primary, seoElements),
          readabilityScore: this.assessReadability(optimizedNarrative.primary)
        },
        
        // SEO integration
        seoIntegration: {
          primaryKeywords: seoElements.primaryKeywords,
          secondaryKeywords: seoElements.secondaryKeywords,
          longTailPhrases: seoElements.longTailPhrases,
          naturalIntegration: optimizedNarrative.keywordIntegration,
          semanticEnrichment: optimizedNarrative.semanticElements
        },
        
        // Metadata
        metadata: {
          narrativeStyle: this.options.narrativeStyle,
          processingTime: Date.now() - narrativeStart,
          confidenceScore: this.calculateNarrativeConfidence(coreNarrative, seoElements),
          culturalSensitivity: this.assessCulturalSensitivity(optimizedNarrative.primary, culturalContext)
        }
      };
      
      // Update statistics
      this.updateNarrativeStats(narrativePackage);
      
      this.observer.log('info', `Narrative created for ${item.name} (${narrativePackage.narrativeAnalysis.wordCount} words)`);
      this.observer.endTrace(traceId, { 
        wordCount: narrativePackage.narrativeAnalysis.wordCount,
        framework: narrativeFramework.type 
      });
      
      this.emit('narrative-created', narrativePackage);
      
      return narrativePackage;

    } catch (error) {
      this.observer.log('error', `Narrative creation failed for ${item.name}: ${error.message}`);
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Select appropriate narrative framework
   * @param {Object} item - Item data
   * @param {Object} visionAnalysis - Vision analysis
   * @param {Object} seoResearch - SEO research
   * @returns {Object} Selected narrative framework
   */
  selectNarrativeFramework(item, visionAnalysis, seoResearch) {
    const itemText = (item.name + ' ' + (item.description || '') + ' ' + (item.categories || '')).toLowerCase();
    
    // Analyze context clues
    const contextClues = {
      vintage: itemText.includes('vintage') || itemText.includes('antique') || itemText.includes('retro'),
      spiritual: itemText.includes('chakra') || itemText.includes('crystal') || itemText.includes('spiritual'),
      french: itemText.includes('french') || itemText.includes('français') || itemText.includes('paris'),
      handmade: itemText.includes('handmade') || itemText.includes('artisan') || itemText.includes('crafted'),
      luxury: itemText.includes('luxury') || itemText.includes('premium') || itemText.includes('exclusive'),
      jewelry: itemText.includes('jewelry') || itemText.includes('bracelet') || itemText.includes('necklace')
    };
    
    // Select primary framework
    let primaryFramework;
    if (contextClues.vintage) {
      primaryFramework = 'heritage_legacy';
    } else if (contextClues.spiritual) {
      primaryFramework = 'mystical_spiritual';
    } else if (contextClues.handmade) {
      primaryFramework = 'artisan_craft';
    } else if (contextClues.luxury || contextClues.jewelry) {
      primaryFramework = 'romance_beauty';
    } else if (visionAnalysis?.narrativeElements?.recommendedArchetype === 'discovery') {
      primaryFramework = 'discovery_adventure';
    } else {
      primaryFramework = 'transformation_journey';
    }
    
    const framework = this.narrativeFrameworks[primaryFramework];
    
    return {
      type: primaryFramework,
      ...framework,
      selectedOpening: this.selectRandomElement(framework.openings),
      selectedThemes: this.selectRelevantThemes(framework.themes, visionAnalysis, 3),
      selectedTone: this.selectEmotionalTone(framework.emotional_tones, visionAnalysis),
      selectedClosing: this.selectRandomElement(framework.closing_styles),
      contextClues
    };
  }

  /**
   * Generate core narrative using advanced AI
   * @param {Object} item - Item data
   * @param {Object} framework - Narrative framework
   * @param {Object} culturalContext - Cultural context
   * @param {Object} visionAnalysis - Vision analysis
   * @param {Object} seoElements - SEO elements
   * @returns {Promise<Object>} Core narrative
   */
  async generateCoreNarrative(item, framework, culturalContext, visionAnalysis, seoElements) {
    const prompt = this.buildNarrativePrompt(item, framework, culturalContext, visionAnalysis, seoElements);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        max_tokens: Math.ceil(this.options.targetWordCount * 1.5),
        temperature: 0.8, // Higher creativity for storytelling
        presence_penalty: 0.3, // Encourage unique content
        frequency_penalty: 0.2 // Reduce repetition
      });

      const narrative = response.choices[0].message.content.trim();
      
      return {
        rawNarrative: narrative,
        framework: framework.type,
        culturalContext: culturalContext.primary,
        generationMetadata: {
          promptLength: prompt.length,
          responseLength: narrative.length,
          model: "gpt-4"
        }
      };

    } catch (error) {
      this.observer.log('error', `Core narrative generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build comprehensive narrative prompt
   * @param {Object} item - Item data
   * @param {Object} framework - Narrative framework
   * @param {Object} culturalContext - Cultural context
   * @param {Object} visionAnalysis - Vision analysis
   * @param {Object} seoElements - SEO elements
   * @returns {string} Complete prompt
   */
  buildNarrativePrompt(item, framework, culturalContext, visionAnalysis, seoElements) {
    return `You are a master storyteller specializing in luxury product narratives. Create a completely unique, individualized story for this specific item that will compel potential buyers and honor the item's authentic character.

ITEM TO DESCRIBE:
Name: "${item.name}"
${item.description ? `Current Description: "${item.description}"` : ''}
${item.categories ? `Categories: "${item.categories}"` : ''}

NARRATIVE FRAMEWORK: ${framework.type}
Opening Style: ${framework.selectedOpening}
Themes to Weave In: ${framework.selectedThemes.join(', ')}
Emotional Tone: ${framework.selectedTone}
Closing Style: ${framework.selectedClosing}

${visionAnalysis ? `VISUAL ANALYSIS:
Key Visual Elements: ${visionAnalysis.keyFeatures?.join(', ') || 'Not available'}
Unique Aspects: ${visionAnalysis.uniqueAspects?.join(', ') || 'Not available'}
Character Attributes: ${visionAnalysis.characterAttributes || 'Not available'}
` : ''}

${culturalContext.primary ? `CULTURAL CONTEXT: ${culturalContext.primary.type}
Narrative Style: ${culturalContext.primary.narrativeStyle}
Key References: ${culturalContext.primary.storyElements.join(', ')}
` : ''}

SEO KEYWORDS TO INTEGRATE NATURALLY:
Primary: ${seoElements.primaryKeywords.slice(0, 3).join(', ')}
Secondary: ${seoElements.secondaryKeywords.slice(0, 5).join(', ')}

STORYTELLING REQUIREMENTS:
1. Create a completely unique narrative that could ONLY apply to this specific item
2. Write approximately ${this.options.targetWordCount} words
3. Integrate keywords naturally - they should enhance, not detract from the story
4. Use the ${framework.selectedTone} emotional tone throughout
5. Include specific details that make this item feel special and desirable
6. End with a compelling call to emotional connection (not explicit sales language)
7. Honor any cultural context with authenticity and respect
8. Make every sentence contribute to the overall narrative arc

AVOID:
- Generic descriptions that could apply to any similar item
- Obvious sales language or marketing speak
- Forced keyword insertion that breaks narrative flow
- Cultural stereotypes or inauthentic references
- Repetitive or formulaic language

Create a story that makes the reader feel they've discovered something truly special and unique.`;
  }

  /**
   * Optimize narrative for SEO while maintaining authenticity
   * @param {Object} coreNarrative - Core narrative
   * @param {Object} seoElements - SEO elements
   * @param {Object} framework - Narrative framework
   * @returns {Promise<Object>} Optimized narrative
   */
  async optimizeNarrativeForSEO(coreNarrative, seoElements, framework) {
    // This would include sophisticated SEO optimization while preserving narrative quality
    return {
      primary: coreNarrative.rawNarrative,
      seoTitle: this.generateSEOTitle(coreNarrative.rawNarrative, seoElements),
      metaDescription: this.generateMetaDescription(coreNarrative.rawNarrative, seoElements),
      shortDescription: this.extractShortDescription(coreNarrative.rawNarrative),
      longDescription: coreNarrative.rawNarrative,
      keywordIntegration: this.analyzeKeywordIntegration(coreNarrative.rawNarrative, seoElements),
      semanticElements: this.extractSemanticElements(coreNarrative.rawNarrative)
    };
  }

  // Helper methods
  selectRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  selectRelevantThemes(themes, visionAnalysis, count) {
    // In production, this would be more sophisticated
    return themes.slice(0, count);
  }

  selectEmotionalTone(tones, visionAnalysis) {
    return visionAnalysis?.narrativeElements?.dominantEmotion || tones[0];
  }

  determineCulturalContext(item, visionAnalysis, seoResearch) {
    // Determine cultural context from item data and research
    const itemText = (item.name + ' ' + (item.description || '')).toLowerCase();
    
    for (const [contextKey, contextData] of Object.entries(this.culturalAdaptations)) {
      if (contextData.vocabulary.some(word => itemText.includes(word))) {
        return {
          primary: { type: contextKey, ...contextData },
          secondary: []
        };
      }
    }
    
    return { primary: null, secondary: [] };
  }

  extractSEOElements(seoResearch, framework) {
    if (!seoResearch?.seoRecommendations) {
      return {
        primaryKeywords: ['handcrafted', 'unique', 'quality'],
        secondaryKeywords: ['artisan', 'special', 'beautiful'],
        longTailPhrases: ['handcrafted with care', 'unique design']
      };
    }
    
    return {
      primaryKeywords: seoResearch.seoRecommendations.primaryKeywords || [],
      secondaryKeywords: seoResearch.seoRecommendations.secondaryKeywords || [],
      longTailPhrases: seoResearch.longTailOpportunities?.phrases || []
    };
  }

  updateNarrativeStats(narrativePackage) {
    this.stats.narrativesCreated++;
    this.stats.totalWordCount += narrativePackage.narrativeAnalysis.wordCount;
    this.stats.averageWordCount = this.stats.totalWordCount / this.stats.narrativesCreated;
    
    const styleCount = this.stats.narrativeStyles.get(narrativePackage.narrativeAnalysis.framework) || 0;
    this.stats.narrativeStyles.set(narrativePackage.narrativeAnalysis.framework, styleCount + 1);
  }

  countWords(text) {
    return text.split(/\s+/).length;
  }

  calculateKeywordDensity(text, seoElements) {
    const totalWords = this.countWords(text);
    const keywordCount = seoElements.primaryKeywords.reduce((count, keyword) => {
      const regex = new RegExp(keyword.toLowerCase(), 'gi');
      return count + (text.toLowerCase().match(regex) || []).length;
    }, 0);
    
    return keywordCount / totalWords;
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return {
      ...this.stats,
      narrativeStyles: Object.fromEntries(this.stats.narrativeStyles)
    };
  }
}