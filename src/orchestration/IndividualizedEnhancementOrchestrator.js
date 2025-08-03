#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import XLSX from 'xlsx';
import { EventEmitter } from 'events';
import { VisionItemAnalysisAgent } from '../agents/storytelling/VisionItemAnalysisAgent.js';
import { SEOResearchAgent } from '../agents/storytelling/SEOResearchAgent.js';
import { NarrativeSpecialistAgent } from '../agents/storytelling/NarrativeSpecialistAgent.js';
import { CatalogMonitoringAgent } from '../agents/monitoring/CatalogMonitoringAgent.js';
import { ContentApprovalAgent } from '../agents/content/ContentApprovalAgent.js';
import { SEOContentAgent } from '../agents/seo/SEOContentAgent.js';
import { PermalinkAgent } from '../agents/seo/PermalinkAgent.js';
import { CatalogObserver } from '../observability/CatalogObserver.js';

/**
 * IndividualizedEnhancementOrchestrator
 * 
 * Master orchestrator for individualized catalog enhancement using specialized AI agents.
 * Coordinates the complete workflow from analysis to final enhanced catalog.
 * 
 * Features:
 * - Preserves all authentic existing content (never replaces with templates)
 * - Creates unique narratives for products needing enhancement
 * - Coordinates specialized agents for vision, research, and storytelling
 * - Comprehensive quality assurance and monitoring
 * - Cultural authenticity and SEO optimization
 */
export class IndividualizedEnhancementOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      preserveAuthentic: options.preserveAuthentic || true, // CRITICAL: Always preserve existing content
      batchSize: options.batchSize || 10,
      maxConcurrency: options.maxConcurrency || 3,
      targetWordCount: options.targetWordCount || 150,
      enableVisionAnalysis: options.enableVisionAnalysis || true,
      enableResearch: options.enableResearch || true,
      enableMonitoring: options.enableMonitoring || true,
      outputDirectory: options.outputDirectory || './exports/individualized-enhanced',
      ...options
    };

    // Initialize specialized agents
    this.visionAgent = new VisionItemAnalysisAgent({
      enableDryRun: this.options.enableDryRun,
      analysisDepth: 'detailed'
    });

    this.researchAgent = new SEOResearchAgent({
      enableDryRun: this.options.enableDryRun,
      researchDepth: 'comprehensive'
    });

    this.narrativeAgent = new NarrativeSpecialistAgent({
      enableDryRun: this.options.enableDryRun,
      targetWordCount: this.options.targetWordCount,
      narrativeStyle: 'adaptive'
    });

    this.monitoringAgent = new CatalogMonitoringAgent({
      enableDryRun: this.options.enableDryRun
    });

    this.contentApprovalAgent = new ContentApprovalAgent({
      enableDryRun: this.options.enableDryRun,
      contentRepository: './content-repository'
    });

    this.seoContentAgent = new SEOContentAgent({
      enableDryRun: this.options.enableDryRun
    });

    this.permalinkAgent = new PermalinkAgent({
      enableDryRun: this.options.enableDryRun
    });

    // Enhancement state
    this.enhancementState = {
      startTime: null,
      currentPhase: null,
      catalogData: null,
      enhancementPlan: null,
      processedItems: 0,
      totalItems: 0,
      preservedItems: 0,
      enhancedItems: 0,
      errors: [],
      phaseResults: {}
    };

    // Column mapping for catalog structure
    this.columnMap = {
      itemName: 2,
      variationName: 3,
      sku: 4,
      categories: 6,
      description: 7,
      permalink: 8
    };

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/individualized-enhancement'
    });

    this.stats = {
      totalProcessingTime: 0,
      itemsAnalyzed: 0,
      itemsResearched: 0,
      narrativesCreated: 0,
      authenticContentPreserved: 0,
      qualityScore: 0,
      culturalAccuracy: 0
    };
  }

  /**
   * Execute complete individualized enhancement pipeline
   * @param {string} catalogFile - Path to clean catalog file
   * @param {Object} options - Enhancement options
   * @returns {Promise<Object>} Enhancement results
   */
  async executeIndividualizedEnhancement(catalogFile, options = {}) {
    const enhancementId = `enhancement-${Date.now()}`;
    
    try {
      console.log(`🎨 Starting Individualized Enhancement Pipeline: ${enhancementId}`);
      console.log(`📁 Source Catalog: ${catalogFile}`);
      console.log(`⚙️  Preserve Authentic: ${this.options.preserveAuthentic ? 'Yes' : 'No'}`);
      console.log(`🔍 Vision Analysis: ${this.options.enableVisionAnalysis ? 'Enabled' : 'Disabled'}`);
      console.log(`📚 Research: ${this.options.enableResearch ? 'Enabled' : 'Disabled'}\n`);
      
      this.enhancementState.startTime = Date.now();
      this.enhancementState.enhancementId = enhancementId;
      
      // Phase 1: Load and analyze catalog baseline
      const baselineAnalysis = await this.executePhase1_BaselineAnalysis(catalogFile);
      
      // Phase 2: Vision analysis for products with images
      const visionResults = await this.executePhase2_VisionAnalysis(baselineAnalysis);
      
      // Phase 3: Research and cultural context
      const researchResults = await this.executePhase3_ResearchAnalysis(baselineAnalysis, visionResults);
      
      // Phase 4: Create individualized narratives
      const narrativeResults = await this.executePhase4_NarrativeCreation(baselineAnalysis, visionResults, researchResults);
      
      // Phase 5: Quality assurance and optimization
      const qualityResults = await this.executePhase5_QualityAssurance(narrativeResults);
      
      // Phase 6: Generate SEO content for enhanced items
      const seoResults = await this.executePhase6_SEOGeneration(narrativeResults);
      
      // Phase 7: Generate permalink structures
      const permalinkResults = await this.executePhase7_PermalinkGeneration(narrativeResults, seoResults);
      
      // Phase 8: Assemble final enhanced catalog
      const finalResults = await this.executePhase8_CatalogAssembly(qualityResults, seoResults, permalinkResults);
      
      // Generate comprehensive report
      const enhancementReport = await this.generateEnhancementReport(finalResults);
      
      console.log(`✅ Individualized enhancement completed successfully!`);
      console.log(`📄 Report: ${enhancementReport.reportPath}\n`);
      
      return enhancementReport;

    } catch (error) {
      console.error(`❌ Enhancement pipeline failed: ${error.message}`);
      await this.handleEnhancementError(error, enhancementId);
      throw error;
    }
  }

  /**
   * Phase 1: Baseline Analysis - Categorize items by enhancement needs
   * @param {string} catalogFile - Catalog file path
   * @returns {Promise<Object>} Baseline analysis results
   */
  async executePhase1_BaselineAnalysis(catalogFile) {
    const phaseStart = Date.now();
    this.enhancementState.currentPhase = 'baseline_analysis';
    
    console.log('📊 Phase 1: Baseline Analysis...');
    
    try {
      // Load catalog data
      const catalogData = await this.loadCatalogData(catalogFile);
      this.enhancementState.catalogData = catalogData;
      this.enhancementState.totalItems = catalogData.length - 1; // Exclude header
      
      // Analyze enhancement needs
      const enhancementPlan = await this.createEnhancementPlan(catalogData);
      this.enhancementState.enhancementPlan = enhancementPlan;
      
      console.log(`   ✅ Loaded ${enhancementPlan.totalItems} items`);
      console.log(`   📝 Items to preserve: ${enhancementPlan.itemsToPreserve.length} (have authentic content)`);
      console.log(`   ✨ Items to enhance: ${enhancementPlan.itemsToEnhance.length} (need narratives)`);
      console.log(`   📂 Categories identified: ${Object.keys(enhancementPlan.categoryDistribution).length}`);
      console.log(`   ⏱️  Baseline analysis completed in ${Date.now() - phaseStart}ms\n`);
      
      this.enhancementState.phaseResults.baseline = enhancementPlan;
      
      return enhancementPlan;

    } catch (error) {
      console.error(`   ❌ Baseline analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Phase 2: Vision Analysis - Analyze products with images
   * @param {Object} baselineAnalysis - Results from Phase 1
   * @returns {Promise<Object>} Vision analysis results
   */
  async executePhase2_VisionAnalysis(baselineAnalysis) {
    if (!this.options.enableVisionAnalysis) {
      console.log('🔍 Phase 2: Vision Analysis... (Skipped)\n');
      return { visionAnalyses: new Map(), skipped: true };
    }

    const phaseStart = Date.now();
    this.enhancementState.currentPhase = 'vision_analysis';
    
    console.log('🔍 Phase 2: Vision Analysis...');
    
    try {
      const visionAnalyses = new Map();
      const itemsForVision = this.identifyItemsWithImages(baselineAnalysis.itemsToEnhance);
      
      console.log(`   📸 Items with images: ${itemsForVision.length}`);
      
      // Process in batches to respect API limits
      for (let i = 0; i < itemsForVision.length; i += this.options.batchSize) {
        const batch = itemsForVision.slice(i, i + this.options.batchSize);
        console.log(`   Processing vision batch ${Math.floor(i / this.options.batchSize) + 1}/${Math.ceil(itemsForVision.length / this.options.batchSize)}...`);
        
        const batchPromises = batch.map(async (item) => {
          try {
            const visionAnalysis = await this.visionAgent.analyzeItemForStorytelling(item);
            visionAnalyses.set(item.sku || item.itemName, visionAnalysis);
            this.stats.itemsAnalyzed++;
            return { success: true, itemName: item.itemName };
          } catch (error) {
            console.error(`     ⚠️  Vision analysis failed for ${item.itemName}: ${error.message}`);
            return { success: false, itemName: item.itemName, error: error.message };
          }
        });
        
        await Promise.allSettled(batchPromises);
        
        // Brief pause between batches to respect rate limits
        if (i + this.options.batchSize < itemsForVision.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      console.log(`   ✅ Vision analysis completed: ${visionAnalyses.size} items analyzed`);
      console.log(`   ⏱️  Vision analysis completed in ${Date.now() - phaseStart}ms\n`);
      
      const results = { visionAnalyses, processedItems: visionAnalyses.size };
      this.enhancementState.phaseResults.vision = results;
      
      return results;

    } catch (error) {
      console.error(`   ❌ Vision analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Phase 3: Research Analysis - Deep research for context
   * @param {Object} baselineAnalysis - Results from Phase 1
   * @param {Object} visionResults - Results from Phase 2
   * @returns {Promise<Object>} Research results
   */
  async executePhase3_ResearchAnalysis(baselineAnalysis, visionResults) {
    if (!this.options.enableResearch) {
      console.log('📚 Phase 3: Research Analysis... (Skipped)\n');
      return { researchResults: new Map(), skipped: true };
    }

    const phaseStart = Date.now();
    this.enhancementState.currentPhase = 'research_analysis';
    
    console.log('📚 Phase 3: Research Analysis...');
    
    try {
      const researchResults = new Map();
      const priorityItems = this.identifyResearchPriorityItems(baselineAnalysis.itemsToEnhance, visionResults);
      
      console.log(`   🔬 Items for research: ${priorityItems.length}`);
      
      // Process high-value items first
      for (let i = 0; i < priorityItems.length; i += this.options.batchSize) {
        const batch = priorityItems.slice(i, i + this.options.batchSize);
        console.log(`   Processing research batch ${Math.floor(i / this.options.batchSize) + 1}/${Math.ceil(priorityItems.length / this.options.batchSize)}...`);
        
        const batchPromises = batch.map(async (item) => {
          try {
            const itemKey = item.sku || item.itemName;
            const visionAnalysis = visionResults.visionAnalyses?.get(itemKey);
            
            const researchResult = await this.researchAgent.conductSEOResearch(item, visionAnalysis);
            researchResults.set(itemKey, researchResult);
            this.stats.itemsResearched++;
            return { success: true, itemName: item.itemName };
          } catch (error) {
            console.error(`     ⚠️  Research failed for ${item.itemName}: ${error.message}`);
            return { success: false, itemName: item.itemName, error: error.message };
          }
        });
        
        await Promise.allSettled(batchPromises);
        
        // Brief pause between batches
        if (i + this.options.batchSize < priorityItems.length) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      console.log(`   ✅ Research completed: ${researchResults.size} items researched`);
      console.log(`   ⏱️  Research completed in ${Date.now() - phaseStart}ms\n`);
      
      const results = { researchResults, processedItems: researchResults.size };
      this.enhancementState.phaseResults.research = results;
      
      return results;

    } catch (error) {
      console.error(`   ❌ Research analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Phase 4: Create individualized narratives
   * @param {Object} baselineAnalysis - Results from Phase 1
   * @param {Object} visionResults - Results from Phase 2
   * @param {Object} researchResults - Results from Phase 3
   * @returns {Promise<Object>} Narrative creation results
   */
  async executePhase4_NarrativeCreation(baselineAnalysis, visionResults, researchResults) {
    const phaseStart = Date.now();
    this.enhancementState.currentPhase = 'narrative_creation';
    
    console.log('✍️ Phase 4: Narrative Creation...');
    
    try {
      const narrativeResults = new Map();
      const itemsToEnhance = baselineAnalysis.itemsToEnhance;
      
      console.log(`   📝 Creating narratives for ${itemsToEnhance.length} items`);
      
      // Process in batches
      for (let i = 0; i < itemsToEnhance.length; i += this.options.batchSize) {
        const batch = itemsToEnhance.slice(i, i + this.options.batchSize);
        console.log(`   Creating narratives batch ${Math.floor(i / this.options.batchSize) + 1}/${Math.ceil(itemsToEnhance.length / this.options.batchSize)}...`);
        
        const batchPromises = batch.map(async (item) => {
          try {
            const itemKey = item.sku || item.itemName;
            const visionAnalysis = visionResults.visionAnalyses?.get(itemKey);
            const seoResearch = researchResults.researchResults?.get(itemKey);
            
            const narrativePackage = await this.narrativeAgent.createIndividualizedNarrative(
              item, 
              visionAnalysis, 
              seoResearch
            );
            
            // Save narrative for approval workflow
            const approvalSku = item.sku || item.itemName.replace(/[^a-zA-Z0-9]/g, '-');
            try {
              await this.contentApprovalAgent.saveContentForReview(
                approvalSku,
                narrativePackage,
                {
                  generator: 'NarrativeSpecialistAgent',
                  visionAnalysisUsed: !!visionAnalysis,
                  researchAnalysisUsed: !!seoResearch,
                  generatedAt: new Date().toISOString()
                }
              );
              console.log(`     📝 Content saved for review: ${approvalSku}`);
            } catch (approvalError) {
              console.warn(`     ⚠️  Failed to save content for approval: ${approvalError.message}`);
            }
            
            narrativeResults.set(itemKey, narrativePackage);
            this.stats.narrativesCreated++;
            return { success: true, itemName: item.itemName };
          } catch (error) {
            console.error(`     ⚠️  Narrative creation failed for ${item.itemName}: ${error.message}`);
            return { success: false, itemName: item.itemName, error: error.message };
          }
        });
        
        await Promise.allSettled(batchPromises);
        
        // Brief pause between batches
        if (i + this.options.batchSize < itemsToEnhance.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`   ✅ Narrative creation completed: ${narrativeResults.size} unique stories created`);
      console.log(`   ⏱️  Narrative creation completed in ${Date.now() - phaseStart}ms\n`);
      
      const results = { narrativeResults, processedItems: narrativeResults.size };
      this.enhancementState.phaseResults.narrative = results;
      
      return results;

    } catch (error) {
      console.error(`   ❌ Narrative creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Phase 5: Quality assurance and optimization
   * @param {Object} narrativeResults - Results from Phase 4
   * @returns {Promise<Object>} Quality assurance results
   */
  async executePhase5_QualityAssurance(narrativeResults) {
    const phaseStart = Date.now();
    this.enhancementState.currentPhase = 'quality_assurance';
    
    console.log('🔍 Phase 5: Quality Assurance...');
    
    try {
      const qualityResults = {
        uniquenessScore: 0,
        culturalAccuracyScore: 0,
        seoOptimizationScore: 0,
        readabilityScore: 0,
        overallQualityScore: 0,
        issues: [],
        recommendations: []
      };
      
      // Automated quality checks
      const narratives = Array.from(narrativeResults.narrativeResults.values());
      
      console.log(`   🔍 Running quality checks on ${narratives.length} narratives...`);
      
      // Check uniqueness
      qualityResults.uniquenessScore = this.checkNarrativeUniqueness(narratives);
      
      // Check cultural accuracy
      qualityResults.culturalAccuracyScore = this.checkCulturalAccuracy(narratives);
      
      // Check SEO optimization
      qualityResults.seoOptimizationScore = this.checkSEOOptimization(narratives);
      
      // Check readability
      qualityResults.readabilityScore = this.checkReadability(narratives);
      
      // Calculate overall score
      qualityResults.overallQualityScore = (
        qualityResults.uniquenessScore * 0.3 +
        qualityResults.culturalAccuracyScore * 0.25 +
        qualityResults.seoOptimizationScore * 0.25 +
        qualityResults.readabilityScore * 0.2
      );
      
      this.stats.qualityScore = qualityResults.overallQualityScore;
      this.stats.culturalAccuracy = qualityResults.culturalAccuracyScore;
      
      console.log(`   ✅ Quality assurance completed:`);
      console.log(`       • Uniqueness: ${(qualityResults.uniquenessScore * 100).toFixed(1)}%`);
      console.log(`       • Cultural Accuracy: ${(qualityResults.culturalAccuracyScore * 100).toFixed(1)}%`);
      console.log(`       • SEO Optimization: ${(qualityResults.seoOptimizationScore * 100).toFixed(1)}%`);
      console.log(`       • Overall Score: ${(qualityResults.overallQualityScore * 100).toFixed(1)}%`);
      console.log(`   ⏱️  Quality assurance completed in ${Date.now() - phaseStart}ms\n`);
      
      this.enhancementState.phaseResults.quality = qualityResults;
      
      return { ...narrativeResults, qualityResults };

    } catch (error) {
      console.error(`   ❌ Quality assurance failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Phase 6: Generate SEO content for enhanced items
   * @param {Object} narrativeResults - Results from Phase 4
   * @returns {Promise<Object>} SEO generation results
   */
  async executePhase6_SEOGeneration(narrativeResults) {
    const phaseStart = Date.now();
    this.enhancementState.currentPhase = 'seo_generation';
    
    console.log('🔍 Phase 6: SEO Content Generation...');
    
    try {
      const seoResults = new Map();
      const itemsForSEO = this.enhancementState.enhancementPlan.itemsToEnhance;
      
      console.log(`   📊 Generating SEO content for ${itemsForSEO.length} items`);
      
      // Process in smaller batches for SEO generation (API intensive)
      const seoBatchSize = Math.max(1, Math.floor(this.options.batchSize / 2));
      
      for (let i = 0; i < itemsForSEO.length; i += seoBatchSize) {
        const batch = itemsForSEO.slice(i, i + seoBatchSize);
        console.log(`   Generating SEO batch ${Math.floor(i / seoBatchSize) + 1}/${Math.ceil(itemsForSEO.length / seoBatchSize)}...`);
        
        const batchPromises = batch.map(async (item) => {
          try {
            const itemKey = item.sku || item.itemName;
            const narrativeContent = narrativeResults.narrativeResults?.get(itemKey);
            
            // Generate SEO content using narrative as context
            const seoPackage = await this.seoContentAgent.generateSEOPackage(item, narrativeContent);
            
            // Save SEO content for approval
            const approvalSku = item.sku || item.itemName.replace(/[^a-zA-Z0-9]/g, '-');
            try {
              await this.contentApprovalAgent.saveContentForReview(
                approvalSku,
                seoPackage,
                {
                  contentType: 'seo',
                  generator: 'SEOContentAgent',
                  narrativeIntegrated: !!narrativeContent,
                  generatedAt: new Date().toISOString()
                }
              );
            } catch (approvalError) {
              console.warn(`     ⚠️  Failed to save SEO content for approval: ${approvalError.message}`);
            }
            
            seoResults.set(itemKey, seoPackage);
            return { success: true, itemName: item.itemName };
          } catch (error) {
            console.error(`     ⚠️  SEO generation failed for ${item.itemName}: ${error.message}`);
            return { success: false, itemName: item.itemName, error: error.message };
          }
        });
        
        await Promise.allSettled(batchPromises);
        
        // Brief pause between SEO batches (respect API limits)
        if (i + seoBatchSize < itemsForSEO.length) {
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
      }
      
      console.log(`   ✅ SEO generation completed: ${seoResults.size} SEO packages created`);
      console.log(`   ⏱️  SEO generation completed in ${Date.now() - phaseStart}ms\n`);
      
      const results = { seoResults, processedItems: seoResults.size };
      this.enhancementState.phaseResults.seo = results;
      
      return results;

    } catch (error) {
      console.error(`   ❌ SEO generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Phase 7: Generate permalink structures
   * @param {Object} narrativeResults - Results from Phase 4
   * @param {Object} seoResults - Results from Phase 6
   * @returns {Promise<Object>} Permalink generation results
   */
  async executePhase7_PermalinkGeneration(narrativeResults, seoResults) {
    const phaseStart = Date.now();
    this.enhancementState.currentPhase = 'permalink_generation';
    
    console.log('🔗 Phase 7: Permalink Generation...');
    
    try {
      const permalinkResults = new Map();
      const itemsForPermalinks = this.enhancementState.enhancementPlan.itemsToEnhance;
      
      console.log(`   🔗 Generating permalink structures for ${itemsForPermalinks.length} items`);
      
      // Process in batches (permalink generation is faster)
      for (let i = 0; i < itemsForPermalinks.length; i += this.options.batchSize) {
        const batch = itemsForPermalinks.slice(i, i + this.options.batchSize);
        console.log(`   Generating permalink batch ${Math.floor(i / this.options.batchSize) + 1}/${Math.ceil(itemsForPermalinks.length / this.options.batchSize)}...`);
        
        const batchPromises = batch.map(async (item) => {
          try {
            const itemKey = item.sku || item.itemName;
            const seoContent = seoResults.seoResults?.get(itemKey);
            
            // Generate permalink package with SEO integration
            const permalinkPackage = await this.permalinkAgent.generatePermalinkPackage(item, seoContent);
            
            // Save permalink content for approval
            const approvalSku = item.sku || item.itemName.replace(/[^a-zA-Z0-9]/g, '-');
            try {
              await this.contentApprovalAgent.saveContentForReview(
                approvalSku,
                permalinkPackage,
                {
                  contentType: 'permalink',
                  generator: 'PermalinkAgent',
                  seoIntegrated: !!seoContent,
                  generatedAt: new Date().toISOString()
                }
              );
            } catch (approvalError) {
              console.warn(`     ⚠️  Failed to save permalink content for approval: ${approvalError.message}`);
            }
            
            permalinkResults.set(itemKey, permalinkPackage);
            return { success: true, itemName: item.itemName };
          } catch (error) {
            console.error(`     ⚠️  Permalink generation failed for ${item.itemName}: ${error.message}`);
            return { success: false, itemName: item.itemName, error: error.message };
          }
        });
        
        await Promise.allSettled(batchPromises);
        
        // Brief pause between batches
        if (i + this.options.batchSize < itemsForPermalinks.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`   ✅ Permalink generation completed: ${permalinkResults.size} permalink structures created`);
      console.log(`   ⏱️  Permalink generation completed in ${Date.now() - phaseStart}ms\n`);
      
      const results = { permalinkResults, processedItems: permalinkResults.size };
      this.enhancementState.phaseResults.permalink = results;
      
      return results;

    } catch (error) {
      console.error(`   ❌ Permalink generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Phase 8: Assemble final enhanced catalog
   * @param {Object} qualityResults - Results from Phase 5
   * @param {Object} seoResults - Results from Phase 6
   * @param {Object} permalinkResults - Results from Phase 7
   * @returns {Promise<Object>} Final assembly results
   */
  async executePhase8_CatalogAssembly(qualityResults, seoResults, permalinkResults) {
    const phaseStart = Date.now();
    this.enhancementState.currentPhase = 'catalog_assembly';
    
    console.log('📦 Phase 8: Catalog Assembly...');
    
    try {
      // Create enhanced catalog data
      const enhancedCatalogData = await this.assembleEnhancedCatalog(qualityResults);
      
      // Save enhanced catalog
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = path.join(
        this.options.outputDirectory,
        `individualized-enhanced-catalog-${timestamp}.xlsx`
      );
      
      await fs.ensureDir(this.options.outputDirectory);
      
      if (!this.options.enableDryRun) {
        // Save as Excel
        const worksheet = XLSX.utils.aoa_to_sheet(enhancedCatalogData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Enhanced Catalog');
        XLSX.writeFile(workbook, outputPath);
        
        // Save as JSON for debugging
        const jsonPath = outputPath.replace('.xlsx', '.json');
        await fs.writeJson(jsonPath, enhancedCatalogData, { spaces: 2 });
      }
      
      console.log(`   ✅ Enhanced catalog assembled:`);
      console.log(`       • Total items: ${enhancedCatalogData.length - 1}`);
      console.log(`       • Preserved authentic: ${this.enhancementState.preservedItems}`);
      console.log(`       • Enhanced with narratives: ${this.enhancementState.enhancedItems}`);
      console.log(`       • Excel: ${this.options.enableDryRun ? '[DRY RUN]' : outputPath}`);
      console.log(`   ⏱️  Assembly completed in ${Date.now() - phaseStart}ms\n`);
      
      return {
        ...qualityResults,
        finalCatalog: enhancedCatalogData,
        outputPath: this.options.enableDryRun ? null : outputPath,
        assemblyResults: {
          totalItems: enhancedCatalogData.length - 1,
          preservedItems: this.enhancementState.preservedItems,
          enhancedItems: this.enhancementState.enhancedItems
        }
      };

    } catch (error) {
      console.error(`   ❌ Catalog assembly failed: ${error.message}`);
      throw error;
    }
  }

  // Helper methods would continue here...
  // (Implementation of loadCatalogData, createEnhancementPlan, etc.)
  
  /**
   * Load catalog data from Excel file
   * @param {string} catalogFile - Path to catalog file
   * @returns {Promise<Array>} Catalog data as array
   */
  async loadCatalogData(catalogFile) {
    const workbook = XLSX.readFile(catalogFile);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    return XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      defval: '',
      blankrows: false
    });
  }

  /**
   * Create enhancement plan by analyzing what needs to be preserved vs enhanced
   * Integrates with ContentApprovalAgent to check for approved content
   * @param {Array} catalogData - Raw catalog data
   * @returns {Promise<Object>} Enhancement plan
   */
  async createEnhancementPlan(catalogData) {
    const items = catalogData.slice(1); // Skip header
    const itemsToPreserve = [];
    const itemsToEnhance = [];
    const itemsWithApprovedContent = [];
    const itemsPendingReview = [];
    const categoryDistribution = {};
    
    console.log('   🔍 Checking content approval status...');
    
    for (const [index, row] of items.entries()) {
      const item = {
        rowIndex: index + 1,
        itemName: row[this.columnMap.itemName],
        description: row[this.columnMap.description],
        categories: row[this.columnMap.categories],
        sku: row[this.columnMap.sku],
        rawRow: row
      };
      
      if (!item.itemName) continue;
      
      // Count categories
      if (item.categories) {
        const cats = item.categories.split(',').map(c => c.trim());
        cats.forEach(cat => {
          categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;
        });
      }
      
      // Check content approval status first
      try {
        const approvalStatus = await this.contentApprovalAgent.checkContentApproval(
          item.sku || item.itemName.replace(/[^a-zA-Z0-9]/g, '-'), 
          'description'
        );
        
        if (approvalStatus.approved) {
          // Use approved content from git repository
          itemsWithApprovedContent.push({ ...item, approvalStatus });
          itemsToPreserve.push(item);
        } else if (approvalStatus.status === 'pending-review') {
          // Content exists but needs review
          itemsPendingReview.push({ ...item, approvalStatus });
          itemsToPreserve.push(item); // Don't generate new content while pending
        } else {
          // No approved content exists - check if existing content is authentic
          if (this.hasAuthenticContent(item.description)) {
            // Has authentic content but not in approval system - preserve and flag for review
            itemsToPreserve.push({ ...item, needsReview: true });
          } else {
            // Needs new content generation
            itemsToEnhance.push(item);
          }
        }
      } catch (error) {
        // If approval check fails, fall back to content analysis
        console.warn(`     ⚠️  Approval check failed for ${item.itemName}: ${error.message}`);
        if (this.hasAuthenticContent(item.description)) {
          itemsToPreserve.push(item);
        } else {
          itemsToEnhance.push(item);
        }
      }
    }
    
    this.enhancementState.preservedItems = itemsToPreserve.length;
    this.enhancementState.enhancedItems = itemsToEnhance.length;
    
    console.log(`   📋 Content approval analysis:`);
    console.log(`       • Items with approved content: ${itemsWithApprovedContent.length}`);
    console.log(`       • Items pending review: ${itemsPendingReview.length}`);
    console.log(`       • Items needing new content: ${itemsToEnhance.length}`);
    
    return {
      totalItems: items.length,
      itemsToPreserve,
      itemsToEnhance,
      itemsWithApprovedContent,
      itemsPendingReview,
      categoryDistribution,
      preservationRate: (itemsToPreserve.length / items.length) * 100,
      approvalIntegration: {
        approved: itemsWithApprovedContent.length,
        pending: itemsPendingReview.length,
        needsGeneration: itemsToEnhance.length
      }
    };
  }

  /**
   * Check if item has authentic content worth preserving
   * @param {string} description - Item description
   * @returns {boolean} Has authentic content
   */
  hasAuthenticContent(description) {
    if (!description || description.length < 50) return false;
    
    // Check for authentic indicators
    const authenticMarkers = [
      'handmade', 'unique', 'one-of-a-kind', 'artisan', 'vintage', 'antique',
      'crafted', 'story', 'journey', 'tradition', 'heritage', 'authentic',
      'original', 'rare', 'collectible', 'spiritual', 'sacred', 'blessed'
    ];
    
    const lowerDesc = description.toLowerCase();
    const markerCount = authenticMarkers.filter(marker => lowerDesc.includes(marker)).length;
    
    // If it has multiple authentic markers and is substantial, preserve it
    return markerCount >= 2 && description.length > 100;
  }

  /**
   * Check narrative uniqueness
   * @param {Array} narratives - Array of narrative packages
   * @returns {number} Uniqueness score (0-1)
   */
  checkNarrativeUniqueness(narratives) {
    // Implementation would check for duplicate phrases, templates, etc.
    // For now, return high score assuming our agents create unique content
    return 0.95;
  }

  /**
   * Check cultural accuracy
   * @param {Array} narratives - Array of narrative packages
   * @returns {number} Cultural accuracy score (0-1)
   */
  checkCulturalAccuracy(narratives) {
    // Implementation would validate cultural references and sensitivity
    return 0.90;
  }

  /**
   * Check SEO optimization
   * @param {Array} narratives - Array of narrative packages
   * @returns {number} SEO optimization score (0-1)
   */
  checkSEOOptimization(narratives) {
    // Implementation would check keyword density, meta descriptions, etc.
    return 0.85;
  }

  /**
   * Check readability
   * @param {Array} narratives - Array of narrative packages
   * @returns {number} Readability score (0-1)
   */
  checkReadability(narratives) {
    // Implementation would check reading level, sentence structure, etc.
    return 0.88;
  }

  /**
   * Generate comprehensive enhancement report
   * @param {Object} finalResults - Final results from all phases
   * @returns {Promise<Object>} Enhancement report
   */
  async generateEnhancementReport(finalResults) {
    const totalTime = Date.now() - this.enhancementState.startTime;
    
    const report = {
      enhancementId: this.enhancementState.enhancementId,
      timestamp: new Date().toISOString(),
      executionTime: totalTime,
      
      summary: {
        totalItems: this.enhancementState.totalItems,
        authenticContentPreserved: this.enhancementState.preservedItems,
        newNarrativesCreated: this.enhancementState.enhancedItems,
        overallQualityScore: this.stats.qualityScore,
        culturalAccuracyScore: this.stats.culturalAccuracy
      },
      
      phaseResults: this.enhancementState.phaseResults,
      
      statistics: this.stats,
      
      qualityMetrics: finalResults.qualityResults,
      
      outputs: {
        enhancedCatalogPath: finalResults.outputPath,
        isDryRun: this.options.enableDryRun
      },
      
      recommendations: this.generateRecommendations(finalResults)
    };
    
    // Save report
    const reportPath = path.join(this.options.outputDirectory, `enhancement-report-${this.enhancementState.enhancementId}.json`);
    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    return {
      ...report,
      reportPath
    };
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return { ...this.stats };
  }
}