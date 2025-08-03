import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import OpenAI from 'openai';
import { CatalogObserver } from '../observability/CatalogObserver.js';

/**
 * VisionItemAnalysisAgent - Deep visual analysis for storytelling
 * 
 * Uses OpenAI GPT-4 Vision to analyze product images and extract rich details
 * for individualized storytelling. Each item gets a unique visual narrative.
 * 
 * Capabilities:
 * - Visual style analysis (vintage, modern, ornate, minimalist)
 * - Material identification (metals, fabrics, crystals, wood)
 * - Emotional resonance detection (mystical, elegant, powerful, peaceful)
 * - Historical context recognition (era, cultural significance)
 * - Craftsmanship assessment (handmade, mass-produced, artisanal)
 * - Story seed generation (origin myths, intended purpose, unique features)
 */
export class VisionItemAnalysisAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      maxRetries: options.maxRetries || 3,
      analysisDepth: options.analysisDepth || 'detailed', // 'basic', 'detailed', 'comprehensive'
      includeEmotionalContext: options.includeEmotionalContext || true,
      includeCulturalContext: options.includeCulturalContext || true,
      includeMetaphysicalContext: options.includeMetaphysicalContext || true,
      ...options
    };

    // Initialize OpenAI with vision capabilities
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Specialized analysis frameworks
    this.analysisFrameworks = {
      jewelry: {
        focus: ['metals', 'gemstones', 'craftsmanship', 'style_period', 'symbolic_meaning'],
        emotionalTones: ['elegance', 'power', 'mysticism', 'romance', 'heritage'],
        storySeeds: ['ancient_craft', 'protective_charm', 'celebration_piece', 'heirloom_quality']
      },
      
      spiritual: {
        focus: ['energy_properties', 'ritual_use', 'symbolic_elements', 'cultural_origin', 'metaphysical_purpose'],
        emotionalTones: ['transcendence', 'healing', 'protection', 'wisdom', 'connection'],
        storySeeds: ['sacred_tradition', 'energy_conduit', 'meditation_tool', 'spiritual_ally']
      },
      
      vintage: {
        focus: ['era_identification', 'provenance_clues', 'condition_story', 'historical_context', 'rarity_factors'],
        emotionalTones: ['nostalgia', 'authenticity', 'discovery', 'preservation', 'timelessness'],
        storySeeds: ['time_capsule', 'forgotten_treasure', 'era_witness', 'collector_dream']
      },
      
      art: {
        focus: ['artistic_technique', 'visual_impact', 'symbolic_content', 'cultural_references', 'aesthetic_movement'],
        emotionalTones: ['inspiration', 'contemplation', 'beauty', 'expression', 'transformation'],
        storySeeds: ['artist_vision', 'emotional_journey', 'space_transformer', 'conversation_starter']
      },
      
      functional: {
        focus: ['practical_use', 'design_innovation', 'quality_indicators', 'user_experience', 'durability_signs'],
        emotionalTones: ['reliability', 'efficiency', 'satisfaction', 'pride', 'accomplishment'],
        storySeeds: ['daily_companion', 'problem_solver', 'life_enhancer', 'trusted_tool']
      }
    };

    // Story archetype patterns
    this.storyArchetypes = {
      'discovery': 'Found in the depths of an estate sale, this piece whispered stories of...',
      'craftsmanship': 'Each detail reveals the master artisan\'s dedication to...',
      'legacy': 'Passed down through generations, carrying the wisdom of...',
      'transformation': 'More than an object, this becomes a catalyst for...',
      'sanctuary': 'In your space, this creates a sacred corner where...',
      'adventure': 'Every scratch and patina tells of journeys through...',
      'awakening': 'Holding this piece, one feels the stirring of...',
      'protection': 'Ancient symbols guard and guide, offering...'
    };

    // Cultural context database
    this.culturalContexts = {
      french: {
        keywords: ['français', 'french', 'paris', 'vintage', 'antique'],
        narrative_style: 'romantic, sophisticated, with references to French culture and craftsmanship',
        story_elements: ['Parisian ateliers', 'French countryside', 'artistic heritage', 'savoir-faire']
      },
      spiritual: {
        keywords: ['chakra', 'crystal', 'sage', 'meditation', 'energy'],
        narrative_style: 'mystical, reverent, with focus on spiritual properties and ancient wisdom',
        story_elements: ['sacred traditions', 'energy work', 'spiritual journey', 'inner transformation']
      },
      vintage: {
        keywords: ['vintage', 'retro', 'classic', 'antique', 'collectible'],
        narrative_style: 'nostalgic, historically-aware, with era-specific details and context',
        story_elements: ['bygone eras', 'historical significance', 'collector value', 'time capsule']
      }
    };

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/vision-analysis'
    });

    this.stats = {
      itemsAnalyzed: 0,
      visionCallsMade: 0,
      analysisSuccesses: 0,
      analysisFailures: 0,
      averageAnalysisTime: 0,
      totalAnalysisTime: 0
    };
  }

  /**
   * Analyze item with vision for storytelling context
   * @param {Object} item - Item data with image path or URL
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Rich visual analysis for storytelling
   */
  async analyzeItemForStorytelling(item, options = {}) {
    const traceId = this.observer.startTrace('vision_item_analysis');
    const analysisStart = Date.now();
    
    try {
      this.observer.log('info', `Starting vision analysis for: ${item.name}`);
      
      // Determine analysis framework based on item category
      const framework = this.selectAnalysisFramework(item);
      
      // Prepare image for vision analysis
      const imageData = await this.prepareImageForAnalysis(item);
      
      // Perform comprehensive vision analysis
      const visionAnalysis = await this.performVisionAnalysis(imageData, item, framework);
      
      // Extract cultural and metaphysical context
      const culturalContext = this.extractCulturalContext(item, visionAnalysis);
      
      // Generate story seeds and narrative hooks
      const narrativeElements = await this.generateNarrativeElements(visionAnalysis, framework, culturalContext);
      
      // Compile comprehensive analysis
      const analysis = {
        itemId: item.sku || item.id || `item-${Date.now()}`,
        itemName: item.name,
        timestamp: new Date().toISOString(),
        
        // Visual analysis results
        visualAnalysis: visionAnalysis,
        
        // Framework and context
        analysisFramework: framework,
        culturalContext,
        
        // Storytelling elements
        narrativeElements,
        
        // Story foundation
        storyFoundation: {
          primaryArchetype: narrativeElements.recommendedArchetype,
          emotionalTone: narrativeElements.dominantEmotion,
          keyVisualElements: visionAnalysis.keyFeatures,
          uniquenessFactors: visionAnalysis.uniqueAspects,
          culturalResonance: culturalContext.primaryContext
        },
        
        // Metadata
        metadata: {
          analysisDepth: this.options.analysisDepth,
          processingTime: Date.now() - analysisStart,
          visionModelUsed: 'gpt-4-vision-preview',
          confidenceScore: visionAnalysis.confidence || 0.8
        }
      };
      
      this.stats.itemsAnalyzed++;
      this.stats.analysisSuccesses++;
      this.stats.totalAnalysisTime += (Date.now() - analysisStart);
      this.stats.averageAnalysisTime = this.stats.totalAnalysisTime / this.stats.itemsAnalyzed;
      
      this.observer.log('info', `Vision analysis completed for ${item.name} in ${Date.now() - analysisStart}ms`);
      this.observer.endTrace(traceId, { itemName: item.name, processingTime: Date.now() - analysisStart });
      
      return analysis;

    } catch (error) {
      this.stats.analysisFailures++;
      this.observer.log('error', `Vision analysis failed for ${item.name}: ${error.message}`);
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Select appropriate analysis framework based on item characteristics
   * @param {Object} item - Item data
   * @returns {Object} Analysis framework
   */
  selectAnalysisFramework(item) {
    const itemText = (item.name + ' ' + (item.description || '') + ' ' + (item.categories || '')).toLowerCase();
    
    // Determine primary framework
    if (itemText.includes('jewelry') || itemText.includes('bracelet') || itemText.includes('necklace')) {
      return this.analysisFrameworks.jewelry;
    } else if (itemText.includes('chakra') || itemText.includes('crystal') || itemText.includes('spiritual')) {
      return this.analysisFrameworks.spiritual;
    } else if (itemText.includes('vintage') || itemText.includes('antique') || itemText.includes('retro')) {
      return this.analysisFrameworks.vintage;
    } else if (itemText.includes('art') || itemText.includes('sculpture') || itemText.includes('painting')) {
      return this.analysisFrameworks.art;
    } else {
      return this.analysisFrameworks.functional;
    }
  }

  /**
   * Prepare image data for vision analysis
   * @param {Object} item - Item with image path or URL
   * @returns {Promise<Object>} Image data ready for analysis
   */
  async prepareImageForAnalysis(item) {
    if (item.imagePath && await fs.pathExists(item.imagePath)) {
      // Local image file
      const imageBuffer = await fs.readFile(item.imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(item.imagePath);
      
      return {
        type: 'local',
        data: `data:${mimeType};base64,${base64Image}`,
        path: item.imagePath
      };
    } else if (item.imageUrl) {
      // Remote image URL
      return {
        type: 'url',
        data: item.imageUrl,
        url: item.imageUrl
      };
    } else {
      throw new Error(`No image data available for item: ${item.name}`);
    }
  }

  /**
   * Perform comprehensive vision analysis using GPT-4 Vision
   * @param {Object} imageData - Prepared image data
   * @param {Object} item - Item information
   * @param {Object} framework - Analysis framework
   * @returns {Promise<Object>} Vision analysis results
   */
  async performVisionAnalysis(imageData, item, framework) {
    this.stats.visionCallsMade++;
    
    const prompt = this.buildVisionAnalysisPrompt(item, framework);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: imageData.data,
                  detail: this.options.analysisDepth === 'comprehensive' ? 'high' : 'auto'
                }
              }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: 0.7
      });

      const analysisText = response.choices[0].message.content;
      
      // Parse structured analysis from response
      return this.parseVisionAnalysis(analysisText, framework);

    } catch (error) {
      this.observer.log('error', `Vision API call failed: ${error.message}`);
      throw new Error(`Vision analysis failed: ${error.message}`);
    }
  }

  /**
   * Build specialized vision analysis prompt
   * @param {Object} item - Item data
   * @param {Object} framework - Analysis framework
   * @returns {string} Structured analysis prompt
   */
  buildVisionAnalysisPrompt(item, framework) {
    return `Analyze this ${item.name} image for individualized storytelling purposes. This analysis will be used to craft a unique, compelling narrative for this specific item.

Focus Areas for Analysis:
${framework.focus.map(f => `- ${f.replace('_', ' ')}`).join('\n')}

Provide a detailed analysis covering:

1. VISUAL ESSENCE:
   - Primary visual elements and their emotional impact
   - Color palette and its psychological effects
   - Texture, materials, and craftsmanship quality
   - Overall aesthetic style and period influences

2. STORYTELLING POTENTIAL:
   - Unique features that could anchor a narrative
   - Historical or cultural references visible in the design
   - Emotional resonance and symbolic meanings
   - Potential origin stories or use contexts

3. CHARACTER ATTRIBUTES:
   - If this item were a character, what personality would it have?
   - What life experiences might it have witnessed?
   - What energy or presence does it project?

4. NARRATIVE HOOKS:
   - Intriguing details that could begin a story
   - Mysterious elements that invite curiosity
   - Functional aspects that suggest daily rituals
   - Aesthetic elements that transform spaces

5. AUTHENTICITY MARKERS:
   - Signs of age, wear, or patina that tell stories
   - Quality indicators that suggest provenance
   - Cultural authenticity markers
   - Craftsmanship details that reveal origins

Respond with rich, evocative descriptions that a master storyteller could use to craft an individualized narrative. Focus on what makes THIS specific item unique and story-worthy.`;
  }

  /**
   * Parse vision analysis response into structured data
   * @param {string} analysisText - Raw analysis text
   * @param {Object} framework - Analysis framework
   * @returns {Object} Structured analysis data
   */
  parseVisionAnalysis(analysisText, framework) {
    // Extract key information using pattern matching and AI parsing
    // This is a simplified version - in production, you'd use more sophisticated parsing
    
    return {
      visualEssence: this.extractSection(analysisText, 'VISUAL ESSENCE'),
      storytellingPotential: this.extractSection(analysisText, 'STORYTELLING POTENTIAL'),
      characterAttributes: this.extractSection(analysisText, 'CHARACTER ATTRIBUTES'),
      narrativeHooks: this.extractSection(analysisText, 'NARRATIVE HOOKS'),
      authenticityMarkers: this.extractSection(analysisText, 'AUTHENTICITY MARKERS'),
      
      // Derived insights
      keyFeatures: this.extractKeyFeatures(analysisText),
      uniqueAspects: this.extractUniqueAspects(analysisText),
      emotionalResonance: this.extractEmotionalTones(analysisText, framework),
      
      // Confidence and metadata
      confidence: 0.85, // In production, this would be calculated based on response quality
      rawAnalysis: analysisText
    };
  }

  /**
   * Extract cultural context from item and analysis
   * @param {Object} item - Item data
   * @param {Object} visionAnalysis - Vision analysis results
   * @returns {Object} Cultural context
   */
  extractCulturalContext(item, visionAnalysis) {
    const itemText = (item.name + ' ' + (item.description || '')).toLowerCase();
    const analysisText = visionAnalysis.rawAnalysis.toLowerCase();
    
    const contexts = [];
    
    // Check for cultural markers
    for (const [contextKey, contextData] of Object.entries(this.culturalContexts)) {
      const matchCount = contextData.keywords.filter(keyword => 
        itemText.includes(keyword) || analysisText.includes(keyword)
      ).length;
      
      if (matchCount > 0) {
        contexts.push({
          type: contextKey,
          strength: matchCount / contextData.keywords.length,
          narrativeStyle: contextData.narrative_style,
          storyElements: contextData.story_elements
        });
      }
    }
    
    // Sort by strength and select primary
    contexts.sort((a, b) => b.strength - a.strength);
    
    return {
      primaryContext: contexts[0] || null,
      allContexts: contexts,
      culturalBlend: contexts.length > 1
    };
  }

  /**
   * Generate narrative elements and story seeds
   * @param {Object} visionAnalysis - Vision analysis
   * @param {Object} framework - Analysis framework
   * @param {Object} culturalContext - Cultural context
   * @returns {Promise<Object>} Narrative elements
   */
  async generateNarrativeElements(visionAnalysis, framework, culturalContext) {
    // Select appropriate story archetype
    const recommendedArchetype = this.selectStoryArchetype(visionAnalysis, framework);
    
    // Determine dominant emotional tone
    const dominantEmotion = this.selectDominantEmotion(visionAnalysis, framework);
    
    // Generate story seeds
    const storySeeds = this.generateStorySeeds(visionAnalysis, framework, culturalContext);
    
    return {
      recommendedArchetype,
      dominantEmotion,
      storySeeds,
      narrativeHooks: visionAnalysis.narrativeHooks,
      uniquenessFactors: this.identifyUniquenessFactors(visionAnalysis),
      emotionalJourney: this.mapEmotionalJourney(visionAnalysis, dominantEmotion)
    };
  }

  // Helper methods for parsing and analysis
  extractSection(text, sectionName) {
    const regex = new RegExp(`${sectionName}[:\\s]*([\\s\\S]*?)(?=\\d+\\.|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }

  extractKeyFeatures(text) {
    // Extract key visual features mentioned in the analysis
    const features = [];
    const featurePatterns = [
      /beautiful\s+([^,.]+)/gi,
      /stunning\s+([^,.]+)/gi,
      /intricate\s+([^,.]+)/gi,
      /unique\s+([^,.]+)/gi,
      /remarkable\s+([^,.]+)/gi
    ];
    
    featurePatterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => features.push(match[1].trim()));
    });
    
    return [...new Set(features)].slice(0, 5);
  }

  extractUniqueAspects(text) {
    // Extract unique aspects that make this item special
    const aspects = [];
    const uniquePatterns = [
      /what makes this unique[^.]+\.([^.]+)\./gi,
      /distinctive[^.]+\.([^.]+)\./gi,
      /unlike other[^.]+\.([^.]+)\./gi,
      /stands out[^.]+\.([^.]+)\./gi
    ];
    
    uniquePatterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => aspects.push(match[1].trim()));
    });
    
    return aspects.slice(0, 3);
  }

  extractEmotionalTones(text, framework) {
    const tones = [];
    framework.emotionalTones.forEach(tone => {
      if (text.toLowerCase().includes(tone)) {
        tones.push(tone);
      }
    });
    return tones;
  }

  selectStoryArchetype(visionAnalysis, framework) {
    // Logic to select most appropriate archetype based on analysis
    const archetypeKeys = Object.keys(this.storyArchetypes);
    return archetypeKeys[Math.floor(Math.random() * archetypeKeys.length)]; // Simplified selection
  }

  selectDominantEmotion(visionAnalysis, framework) {
    const emotions = this.extractEmotionalTones(visionAnalysis.rawAnalysis, framework);
    return emotions[0] || framework.emotionalTones[0];
  }

  generateStorySeeds(visionAnalysis, framework, culturalContext) {
    return framework.storySeeds.map(seed => ({
      type: seed,
      narrative: `Based on ${seed.replace('_', ' ')}, this piece ${this.storyArchetypes.discovery}`,
      culturalTwist: culturalContext.primaryContext ? 
        `With ${culturalContext.primaryContext.type} influences...` : null
    }));
  }

  identifyUniquenessFactors(visionAnalysis) {
    return visionAnalysis.uniqueAspects || ['distinctive design', 'quality craftsmanship', 'timeless appeal'];
  }

  mapEmotionalJourney(visionAnalysis, dominantEmotion) {
    return {
      discovery: 'Initial intrigue and curiosity',
      connection: `Growing appreciation for ${dominantEmotion}`,
      ownership: 'Personal transformation and daily joy',
      legacy: 'Passing on beauty and meaning'
    };
  }

  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return { ...this.stats };
  }
}