#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';

// Import all agents
import { ImageAnalysisAgent } from '../agents/ImageAnalysisAgent.js';
import { GroupingAgent } from '../agents/GroupingAgent.js';
import { FileNamingAgent } from '../agents/FileNamingAgent.js';
import { SquareCatalogAgent } from '../agents/SquareCatalogAgent.js';
import { config } from '../config/index.js';

/**
 * InventoryAutomationOrchestrator
 * 
 * Master workflow that chains ImageAnalysisAgent, GroupingAgent, FileNamingAgent, 
 * and SquareCatalogAgent steps automatically with minimal manual intervention.
 * 
 * Features:
 * - End-to-end pipeline automation
 * - Intelligent error recovery
 * - Progress tracking and observability
 * - Configurable workflow steps
 * - Smart catalog item matching
 */
export class InventoryAutomationOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration
    this.options = {
      batchSize: options.batchSize || 10,
      maxConcurrency: options.maxConcurrency || 3,
      enableDryRun: options.enableDryRun || false,
      autoApplyFileRenames: options.autoApplyFileRenames || false,
      confidenceThreshold: options.confidenceThreshold || 0.7,
      matchingThreshold: options.matchingThreshold || 0.8,
      enableBackups: options.enableBackups || true,
      maxRetries: options.maxRetries || 3,
      ...options
    };
    
    // Initialize agents
    this.imageAnalysisAgent = new ImageAnalysisAgent();
    this.groupingAgent = new GroupingAgent();
    this.fileNamingAgent = new FileNamingAgent();
    this.squareCatalogAgent = new SquareCatalogAgent();
    
    // Workflow state
    this.workflowState = {
      startTime: null,
      currentStep: null,
      processedItems: 0,
      totalItems: 0,
      errors: [],
      results: {},
      stepResults: {}
    };
    
    // Performance tracking
    this.performanceMetrics = {
      stepTimes: {},
      totalProcessingTime: 0,
      successRate: 0,
      errorRate: 0
    };
  }

  /**
   * Execute the complete inventory automation pipeline
   * @param {string} sourceDirectory - Directory containing images to process
   * @param {Object} options - Pipeline options
   * @returns {Promise<Object>} Workflow execution results
   */
  async executeFullPipeline(sourceDirectory, options = {}) {
    const pipelineId = `pipeline-${Date.now()}`;
    console.log(`🚀 Starting Inventory Automation Pipeline: ${pipelineId}`);
    console.log(`📁 Source Directory: ${sourceDirectory}\n`);
    
    try {
      // Initialize workflow state
      this.workflowState.startTime = Date.now();
      this.workflowState.pipelineId = pipelineId;
      
      // Step 1: Discover and validate images
      const discoveryResult = await this.discoverImages(sourceDirectory, options);
      this.emit('step-completed', 'discovery', discoveryResult);
      
      // Step 2: Analyze images
      const analysisResult = await this.analyzeImages(discoveryResult.imagePaths, options);
      this.emit('step-completed', 'analysis', analysisResult);
      
      // Step 3: Group products
      const groupingResult = await this.groupProducts(analysisResult.results, options);
      this.emit('step-completed', 'grouping', groupingResult);
      
      // Step 4: Generate and apply filenames
      const namingResult = await this.processFileNaming(analysisResult.results, options);
      this.emit('step-completed', 'naming', namingResult);
      
      // Step 5: Smart catalog matching and integration
      const catalogResult = await this.integrateCatalog(analysisResult.results, groupingResult, options);
      this.emit('step-completed', 'catalog', catalogResult);
      
      // Step 6: Generate comprehensive report
      const finalReport = await this.generateWorkflowReport();
      this.emit('pipeline-completed', finalReport);
      
      return finalReport;
      
    } catch (error) {
      const errorReport = await this.handlePipelineError(error, pipelineId);
      this.emit('pipeline-failed', errorReport);
      throw errorReport;
    }
  }

  /**
   * Step 1: Discover and validate images in source directory
   */
  async discoverImages(sourceDirectory, options = {}) {
    const stepStart = Date.now();
    this.workflowState.currentStep = 'discovery';
    
    console.log('📸 Step 1: Discovering images...');
    
    try {
      const resolvedPath = path.resolve(sourceDirectory);
      
      if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`Source directory not found: ${resolvedPath}`);
      }
      
      // Find all image files recursively
      const allFiles = await this.findImageFiles(resolvedPath);
      const validImages = await this.validateImages(allFiles);
      
      this.workflowState.totalItems = validImages.length;
      
      console.log(`   ✅ Found ${validImages.length} valid images`);
      console.log(`   ⏱️  Discovery completed in ${Date.now() - stepStart}ms\n`);
      
      this.performanceMetrics.stepTimes.discovery = Date.now() - stepStart;
      
      return {
        success: true,
        imagePaths: validImages,
        totalImages: validImages.length,
        sourceDirectory: resolvedPath
      };
      
    } catch (error) {
      console.error(`❌ Discovery failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Step 2: Analyze images using ImageAnalysisAgent
   */
  async analyzeImages(imagePaths, options = {}) {
    const stepStart = Date.now();
    this.workflowState.currentStep = 'analysis';
    
    console.log('🔍 Step 2: Analyzing images...');
    
    try {
      // Process images with category hints from directory structure
      const categoryHints = this.extractCategoryHints(imagePaths);
      
      // Execute analysis with concurrency control
      const results = [];
      const errors = [];
      
      for (let i = 0; i < imagePaths.length; i += this.options.batchSize) {
        const batch = imagePaths.slice(i, i + this.options.batchSize);
        console.log(`   Processing batch ${Math.floor(i / this.options.batchSize) + 1}/${Math.ceil(imagePaths.length / this.options.batchSize)}...`);
        
        const batchPromises = batch.map(async (imagePath) => {
          try {
            const categoryHint = categoryHints[imagePath];
            const analysis = await this.imageAnalysisAgent.analyzeImage(imagePath, categoryHint);
            
            // Filter by confidence threshold
            if (analysis.confidence >= this.options.confidenceThreshold) {
              return { success: true, imagePath, analysis };
            } else {
              return { 
                success: false, 
                imagePath, 
                reason: `Low confidence: ${analysis.confidence}`,
                analysis 
              };
            }
          } catch (error) {
            return { success: false, imagePath, error: error.message };
          }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            if (result.value.success) {
              results.push(result.value.analysis);
            } else {
              errors.push(result.value);
            }
          } else {
            errors.push({ 
              success: false, 
              imagePath: 'unknown', 
              error: result.reason.message 
            });
          }
        }
        
        this.workflowState.processedItems = results.length;
        this.emit('progress', {
          step: 'analysis',
          processed: this.workflowState.processedItems,
          total: this.workflowState.totalItems,
          percentage: Math.round((this.workflowState.processedItems / this.workflowState.totalItems) * 100)
        });
      }
      
      console.log(`   ✅ Analyzed ${results.length} images successfully`);
      if (errors.length > 0) {
        console.log(`   ⚠️  ${errors.length} images failed analysis`);
      }
      console.log(`   ⏱️  Analysis completed in ${Date.now() - stepStart}ms\n`);
      
      this.performanceMetrics.stepTimes.analysis = Date.now() - stepStart;
      this.workflowState.stepResults.analysis = { results, errors };
      
      return { success: true, results, errors, totalProcessed: results.length };
      
    } catch (error) {
      console.error(`❌ Analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Step 3: Group products using GroupingAgent
   */
  async groupProducts(analysisResults, options = {}) {
    const stepStart = Date.now();
    this.workflowState.currentStep = 'grouping';
    
    console.log('🔗 Step 3: Grouping products...');
    
    try {
      const groupingResult = await this.groupingAgent.groupProducts(analysisResults);
      
      console.log(`   ✅ Created ${groupingResult.groups.length} product groups`);
      console.log(`   📊 Confidence: ${(groupingResult.confidence * 100).toFixed(1)}%`);
      console.log(`   ⏱️  Grouping completed in ${Date.now() - stepStart}ms\n`);
      
      this.performanceMetrics.stepTimes.grouping = Date.now() - stepStart;
      this.workflowState.stepResults.grouping = groupingResult;
      
      return { success: true, ...groupingResult };
      
    } catch (error) {
      console.error(`❌ Grouping failed: ${error.message}`);
      // Continue pipeline with individual items if grouping fails
      const fallbackGroups = this.createFallbackGroups(analysisResults);
      console.log(`   🔄 Using fallback grouping with ${fallbackGroups.groups.length} individual groups`);
      
      this.performanceMetrics.stepTimes.grouping = Date.now() - stepStart;
      return { success: true, ...fallbackGroups, fallback: true };
    }
  }

  /**
   * Step 4: Process file naming using FileNamingAgent
   */
  async processFileNaming(analysisResults, options = {}) {
    const stepStart = Date.now();
    this.workflowState.currentStep = 'naming';
    
    console.log('📝 Step 4: Processing file naming...');
    
    try {
      const namingResult = await this.fileNamingAgent.generateFilenames(analysisResults);
      
      // Auto-apply file renames if enabled
      if (this.options.autoApplyFileRenames && !this.options.enableDryRun) {
        console.log('   🔄 Auto-applying file renames...');
        
        // Group by source directory for efficient renaming
        const dirGroups = this.groupByDirectory(namingResult.results);
        
        for (const [sourceDir, renamingItems] of Object.entries(dirGroups)) {
          const renameResult = await this.fileNamingAgent.applyRenaming(
            renamingItems,
            sourceDir,
            this.options.enableBackups
          );
          
          console.log(`     📁 ${sourceDir}: ${renameResult.renamed.length} files renamed`);
        }
      }
      
      console.log(`   ✅ Generated ${namingResult.results.length} normalized filenames`);
      if (namingResult.errors.length > 0) {
        console.log(`   ⚠️  ${namingResult.errors.length} filename generation errors`);
      }
      console.log(`   ⏱️  Naming completed in ${Date.now() - stepStart}ms\n`);
      
      this.performanceMetrics.stepTimes.naming = Date.now() - stepStart;
      this.workflowState.stepResults.naming = namingResult;
      
      return { success: true, ...namingResult };
      
    } catch (error) {
      console.error(`❌ File naming failed: ${error.message}`);
      // Continue pipeline without renaming
      console.log(`   🔄 Continuing without file renaming`);
      
      this.performanceMetrics.stepTimes.naming = Date.now() - stepStart;
      return { success: false, error: error.message, continuePipeline: true };
    }
  }

  /**
   * Step 5: Integrate with Square catalog
   */
  async integrateCatalog(analysisResults, groupingResult, options = {}) {
    const stepStart = Date.now();
    this.workflowState.currentStep = 'catalog';
    
    console.log('🏪 Step 5: Integrating with Square catalog...');
    
    try {
      // Test Square connection first
      const isConnected = await this.squareCatalogAgent.testConnection();
      if (!isConnected && !this.options.enableDryRun) {
        throw new Error('Failed to connect to Square API');
      }
      
      // Smart catalog matching and integration
      const integrationResults = await this.smartCatalogIntegration(
        analysisResults, 
        groupingResult, 
        options
      );
      
      console.log(`   ✅ Integrated ${integrationResults.successful} items with catalog`);
      if (integrationResults.failed > 0) {
        console.log(`   ⚠️  ${integrationResults.failed} items failed integration`);
      }
      console.log(`   ⏱️  Catalog integration completed in ${Date.now() - stepStart}ms\n`);
      
      this.performanceMetrics.stepTimes.catalog = Date.now() - stepStart;
      this.workflowState.stepResults.catalog = integrationResults;
      
      return { success: true, ...integrationResults };
      
    } catch (error) {
      console.error(`❌ Catalog integration failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Smart catalog integration with automatic matching
   */
  async smartCatalogIntegration(analysisResults, groupingResult, options = {}) {
    // Get existing catalog items for matching
    console.log('   🔍 Fetching existing catalog items for matching...');
    const catalogItems = await this.squareCatalogAgent.searchCatalogObjects({
      objectTypes: ['ITEM'],
      limit: 1000
    });
    
    const results = [];
    const errors = [];
    
    // Process each analyzed product
    for (const product of analysisResults) {
      try {
        // Find best matching catalog item
        const matchedItem = this.findBestCatalogMatch(product, catalogItems);
        
        let catalogItemId;
        
        if (matchedItem && matchedItem.score >= this.options.matchingThreshold) {
          // Use existing catalog item
          catalogItemId = matchedItem.item.id;
          console.log(`   🎯 Matched "${product.productName}" to existing item: ${matchedItem.item.itemData?.name}`);
        } else {
          // Create new catalog item
          console.log(`   ➕ Creating new catalog item for: ${product.productName}`);
          const newItem = await this.squareCatalogAgent.createCatalogItem(product);
          catalogItemId = newItem.id;
        }
        
        // Upload image to catalog item
        if (product.metadata?.imagePath && !this.options.enableDryRun) {
          const imagePath = product.metadata.imagePath;
          const imageBuffer = await fs.readFile(imagePath);
          
          await this.squareCatalogAgent.uploadImage(
            imageBuffer,
            product.productName,
            product.description?.substring(0, 100),
            catalogItemId,
            true // Set as primary image
          );
        }
        
        results.push({
          productName: product.productName,
          catalogItemId,
          matched: !!matchedItem,
          matchScore: matchedItem?.score || 0,
          success: true
        });
        
      } catch (error) {
        console.error(`   ❌ Failed to integrate ${product.productName}: ${error.message}`);
        errors.push({
          productName: product.productName,
          error: error.message,
          success: false
        });
      }
    }
    
    return {
      successful: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  /**
   * Find best matching catalog item using fuzzy matching
   */
  findBestCatalogMatch(product, catalogItems) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const item of catalogItems) {
      if (!item.itemData?.name) continue;
      
      const score = this.calculateMatchScore(product, item);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { item, score };
      }
    }
    
    return bestMatch;
  }

  /**
   * Calculate matching score between product and catalog item
   */
  calculateMatchScore(product, catalogItem) {
    let score = 0;
    const weights = {
      name: 0.4,
      category: 0.3,
      tags: 0.2,
      description: 0.1
    };
    
    // Name similarity
    if (catalogItem.itemData?.name) {
      score += this.calculateTextSimilarity(
        product.productName.toLowerCase(),
        catalogItem.itemData.name.toLowerCase()
      ) * weights.name;
    }
    
    // Category similarity
    if (product.category && catalogItem.itemData?.categories?.[0]) {
      const categoryMatch = product.category.toLowerCase() === 
        catalogItem.itemData.categories[0].name?.toLowerCase();
      score += (categoryMatch ? 1 : 0) * weights.category;
    }
    
    // Tags similarity
    if (product.tags && product.tags.length > 0) {
      const itemText = (catalogItem.itemData.name + ' ' + 
                       (catalogItem.itemData.description || '')).toLowerCase();
      const tagMatches = product.tags.filter(tag => 
        itemText.includes(tag.toLowerCase())
      ).length;
      score += (tagMatches / product.tags.length) * weights.tags;
    }
    
    // Description similarity
    if (product.description && catalogItem.itemData?.description) {
      score += this.calculateTextSimilarity(
        product.description.substring(0, 100).toLowerCase(),
        catalogItem.itemData.description.substring(0, 100).toLowerCase()
      ) * weights.description;
    }
    
    return score;
  }

  /**
   * Calculate text similarity using Levenshtein distance
   */
  calculateTextSimilarity(str1, str2) {
    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;
    
    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }
    
    // Calculate Levenshtein distance
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    const maxLen = Math.max(len1, len2);
    return 1 - (matrix[len1][len2] / maxLen);
  }

  /**
   * Generate comprehensive workflow report
   */
  async generateWorkflowReport() {
    const totalTime = Date.now() - this.workflowState.startTime;
    
    const report = {
      pipelineId: this.workflowState.pipelineId,
      executionTime: totalTime,
      steps: {
        discovery: this.workflowState.stepResults.discovery || null,
        analysis: this.workflowState.stepResults.analysis || null,
        grouping: this.workflowState.stepResults.grouping || null,
        naming: this.workflowState.stepResults.naming || null,
        catalog: this.workflowState.stepResults.catalog || null
      },
      performance: {
        ...this.performanceMetrics,
        totalProcessingTime: totalTime,
        averageTimePerItem: this.workflowState.totalItems > 0 
          ? totalTime / this.workflowState.totalItems 
          : 0
      },
      summary: {
        totalItems: this.workflowState.totalItems,
        processedItems: this.workflowState.processedItems,
        successRate: this.workflowState.totalItems > 0 
          ? (this.workflowState.processedItems / this.workflowState.totalItems) * 100 
          : 0,
        errors: this.workflowState.errors
      },
      configuration: this.options,
      timestamp: new Date().toISOString()
    };
    
    // Save report to file
    const reportPath = path.join(process.cwd(), 'reports', `workflow-report-${this.workflowState.pipelineId}.json`);
    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    console.log('📊 Workflow Summary:');
    console.log(`   🎯 Total Items: ${report.summary.totalItems}`);
    console.log(`   ✅ Processed: ${report.summary.processedItems}`);
    console.log(`   📈 Success Rate: ${report.summary.successRate.toFixed(1)}%`);
    console.log(`   ⏱️  Total Time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`   📄 Report saved: ${reportPath}\n`);
    
    return report;
  }

  /**
   * Utility methods
   */
  
  async findImageFiles(directory) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const files = [];
    
    const scanDirectory = async (dir) => {
      const items = await fs.readdir(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        
        if (item.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (imageExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };
    
    await scanDirectory(directory);
    return files;
  }

  async validateImages(imagePaths) {
    const validImages = [];
    
    for (const imagePath of imagePaths) {
      try {
        const stats = await fs.stat(imagePath);
        
        // Check file size (skip files over 15MB for Square API compliance)
        if (stats.size <= 15 * 1024 * 1024) {
          validImages.push(imagePath);
        } else {
          console.warn(`   ⚠️  Skipping large file: ${path.basename(imagePath)} (${Math.round(stats.size / 1024 / 1024)}MB)`);
        }
      } catch (error) {
        console.warn(`   ⚠️  Skipping invalid file: ${imagePath}`);
      }
    }
    
    return validImages;
  }

  extractCategoryHints(imagePaths) {
    const hints = {};
    
    for (const imagePath of imagePaths) {
      const pathParts = imagePath.split(path.sep);
      
      // Look for category hints in directory names
      for (const part of pathParts) {
        if (part.includes('jewelry') || part.includes('bracelet')) {
          hints[imagePath] = 'jewelry';
          break;
        } else if (part.includes('candle') || part.includes('holder')) {
          hints[imagePath] = 'candles-holders';
          break;
        } else if (part.includes('first-aid') || part.includes('medical')) {
          hints[imagePath] = 'first-aid-kits';
          break;
        } else if (part.includes('pet') || part.includes('dog') || part.includes('cat')) {
          hints[imagePath] = 'pet-products';
          break;
        } else if (part.includes('shoe') || part.includes('sneaker')) {
          hints[imagePath] = 'shoes-sneakers';
          break;
        } else if (part.includes('holographic') || part.includes('purse')) {
          hints[imagePath] = 'holographic-purses';
          break;
        } else if (part.includes('miscellaneous')) {
          hints[imagePath] = 'miscellaneous-products';
          break;
        }
      }
    }
    
    return hints;
  }

  createFallbackGroups(analysisResults) {
    const groups = analysisResults.map((product, index) => ({
      groupId: `fallback-${index + 1}`,
      items: [{ id: product.metadata?.filename || `item-${index}`, justification: 'Fallback individual grouping' }],
      groupName: product.category || 'Uncategorized',
      rationale: `Individual item due to grouping failure: ${product.productName}`
    }));
    
    return { groups, confidence: 0.5 };
  }

  groupByDirectory(renamingResults) {
    const groups = {};
    
    for (const item of renamingResults) {
      const dir = path.dirname(item.originalPath);
      if (!groups[dir]) {
        groups[dir] = [];
      }
      groups[dir].push(item);
    }
    
    return groups;
  }

  async handlePipelineError(error, pipelineId) {
    const errorReport = {
      pipelineId,
      error: error.message,
      step: this.workflowState.currentStep,
      timestamp: new Date().toISOString(),
      workflowState: this.workflowState,
      stackTrace: error.stack
    };
    
    // Save error report
    const errorPath = path.join(process.cwd(), 'reports', `error-report-${pipelineId}.json`);
    await fs.ensureDir(path.dirname(errorPath));
    await fs.writeJson(errorPath, errorReport, { spaces: 2 });
    
    console.error(`💥 Pipeline failed at step: ${this.workflowState.currentStep}`);
    console.error(`📄 Error report saved: ${errorPath}`);
    
    return errorReport;
  }
}

export default InventoryAutomationOrchestrator;
