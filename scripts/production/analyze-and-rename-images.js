#!/usr/bin/env node

import { ImageAnalysisAgent } from '../../src/agents/ImageAnalysisAgent.js';
import { FileNamingAgent } from '../../src/agents/FileNamingAgent.js';
import fs from 'fs-extra';
import path from 'path';
import fetch from 'node-fetch';
import crypto from 'crypto';

/**
 * AI-Powered Image Analysis and Intelligent Renaming Workflow
 * 
 * This script implements a complete workflow:
 * 1. Download images from JSON URL data (if needed)
 * 2. Queue images for visual analysis with AI
 * 3. Analyze images with ImageAnalysisAgent for product descriptions
 * 4. Generate intelligent filenames using FileNamingAgent
 * 5. Apply renaming with backup
 * 6. Generate comprehensive report
 * 
 * Usage: node scripts/production/analyze-and-rename-images.js [--dry-run] [--no-backup] [--no-rename]
 */

class ImageAnalysisWorkflow {
  constructor(options = {}) {
    this.dryRun = options.dryRun || process.env.ENABLE_DRY_RUN === 'true';
    this.createBackup = options.createBackup !== false;
    this.applyRenaming = options.applyRenaming !== false;
    
    // Initialize agents
    this.imageAnalysisAgent = new ImageAnalysisAgent();
    this.fileNamingAgent = new FileNamingAgent();
    
    // Paths
    this.sourceJsonPath = 'spocket-scraped-images.json';
    this.downloadsDir = 'assets/downloads/miscellaneous-products';
    this.outputDir = 'output';
    
    // Statistics
    this.stats = {
      totalImages: 0,
      downloadSuccesses: 0,
      downloadFailures: 0,
      analysisSuccesses: 0,
      analysisFailures: 0,
      renamingSuccesses: 0,
      renamingFailures: 0,
      backupPath: null
    };
    
    console.log('🔍 AI-Powered Image Analysis and Intelligent Renaming Workflow');
    console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE'}${this.createBackup ? ' with backup' : ''}`);
    console.log(''.padEnd(80, '='));
  }

  /**
   * Step 1: Load and parse spocket-scraped-images.json
   */
  async loadImageJson() {
    console.log('\n📂 Step 1: Loading image JSON data...');
    
    try {
      if (!await fs.pathExists(this.sourceJsonPath)) {
        throw new Error(`Source JSON file not found: ${this.sourceJsonPath}`);
      }
      
      const jsonData = await fs.readJson(this.sourceJsonPath);
      
      if (!jsonData.productImages || !Array.isArray(jsonData.productImages)) {
        throw new Error('Invalid JSON structure: missing productImages array');
      }
      
      this.stats.totalImages = jsonData.productImages.length;
      console.log(`✓ Loaded ${this.stats.totalImages} image entries from JSON`);
      
      return jsonData.productImages;
    } catch (error) {
      console.error('❌ Failed to load image JSON:', error.message);
      throw error;
    }
  }

  /**
   * Step 2: Ensure all images are downloaded locally
   */
  async ensureImagesDownloaded(imageEntries) {
    console.log('\n📥 Step 2: Ensuring images are downloaded...');
    
    await fs.ensureDir(this.downloadsDir);
    const downloadPromises = [];
    const downloadedPaths = [];
    
    for (const entry of imageEntries) {
      const localPath = path.join(this.downloadsDir, entry.filename);
      downloadedPaths.push({ entry, localPath });
      
      if (!await fs.pathExists(localPath)) {
        console.log(`📥 Downloading: ${entry.filename}`);
        downloadPromises.push(this.downloadImage(entry.url, localPath, entry));
      } else {
        console.log(`✓ Already exists: ${entry.filename}`);
        this.stats.downloadSuccesses++;
      }
    }
    
    // Wait for all downloads to complete
    if (downloadPromises.length > 0) {
      const downloadResults = await Promise.allSettled(downloadPromises);
      
      for (const result of downloadResults) {
        if (result.status === 'fulfilled') {
          this.stats.downloadSuccesses++;
        } else {
          this.stats.downloadFailures++;
          console.warn(`⚠ Download failed: ${result.reason.message}`);
        }
      }
    }
    
    console.log(`✓ Downloads complete: ${this.stats.downloadSuccesses} succeeded, ${this.stats.downloadFailures} failed`);
    return downloadedPaths;
  }

  /**
   * Download a single image with retry mechanism
   */
  async downloadImage(url, localPath, metadata, maxRetries = 3) {
    if (this.dryRun) {
      console.log(`[DRY RUN] Would download: ${url} → ${localPath}`);
      return;
    }
    
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'image/*,*/*;q=0.8',
            'Cache-Control': 'no-cache'
          },
          timeout: 30000
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const buffer = await response.buffer();
        await fs.writeFile(localPath, buffer);
        
        console.log(`✓ Downloaded: ${path.basename(localPath)} (${buffer.length} bytes)`);
        return;
        
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.warn(`⚠ Attempt ${attempt} failed for ${path.basename(localPath)}: ${error.message}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Failed to download ${url} after ${maxRetries} attempts. Last error: ${lastError.message}`);
  }

  /**
   * Step 3: Prepare image queue with category hints
   */
  async prepareImageQueue(downloadedPaths) {
    console.log('\n🗂️ Step 3: Preparing image analysis queue...');
    
    const imagePaths = [];
    const categoryHints = {};
    
    for (const { entry, localPath } of downloadedPaths) {
      // Only include files that actually exist
      if (await fs.pathExists(localPath)) {
        imagePaths.push(localPath);
        
        // Extract category hint from metadata
        const categoryHint = entry.category || 
          (entry.productName?.toLowerCase().includes('flatware') ? 'flatware' : 'miscellaneous-products');
        categoryHints[localPath] = categoryHint;
      }
    }
    
    console.log(`✓ Prepared ${imagePaths.length} images for analysis`);
    return { imagePaths, categoryHints };
  }

  /**
   * Step 4: Analyze images with ImageAnalysisAgent
   */
  async analyzeImages(imagePaths, categoryHints) {
    console.log('\n🔍 Step 4: Analyzing images with AI...');
    console.log('   🤖 Using GPT-4o for visual analysis...');
    
    try {
      const analysisResults = await this.imageAnalysisAgent.analyzeImages(imagePaths, categoryHints);
      
      this.stats.analysisSuccesses = analysisResults.length;
      this.stats.analysisFailures = imagePaths.length - analysisResults.length;
      
      // Save analysis results
      await fs.ensureDir(this.outputDir);
      const analysisOutputPath = path.join(this.outputDir, 'analysis_results.json');
      
      const analysisData = {
        generatedAt: new Date().toISOString(),
        totalImages: imagePaths.length,
        successfulAnalyses: analysisResults.length,
        analysisResults
      };
      
      await fs.writeJson(analysisOutputPath, analysisData, { spaces: 2 });
      console.log(`✓ Analysis complete: ${this.stats.analysisSuccesses} succeeded, saved to ${analysisOutputPath}`);
      
      // Show sample results
      if (analysisResults.length > 0) {
        console.log('\n📋 Sample Analysis Results:');
        console.log(''.padEnd(60, '-'));
        const sample = analysisResults.slice(0, 3);
        for (const result of sample) {
          console.log(`📸 ${result.metadata?.filename}`);
          console.log(`   📦 Category: ${result.category}`);
          console.log(`   🏷️ Product: ${result.productName}`);
          console.log(`   📝 Description: ${result.description.substring(0, 100)}...`);
          console.log(`   🏆 Confidence: ${Math.round(result.confidence * 100)}%\n`);
        }
        if (analysisResults.length > 3) {
          console.log(`... and ${analysisResults.length - 3} more results\n`);
        }
      }
      
      return analysisResults;
    } catch (error) {
      console.error('❌ Image analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Step 5: Generate intelligent filenames
   */
  async generateFilenames(analysisResults) {
    console.log('\n🏷️ Step 5: Generating intelligent filenames...');
    console.log('   🤖 Using AI for filename generation...');
    
    try {
      const { results: filenameResults, errors } = await this.fileNamingAgent.generateFilenames(analysisResults);
      
      this.stats.renamingSuccesses = filenameResults.length;
      this.stats.renamingFailures = errors.length;
      
      // Save filename mapping
      const mappingOutputPath = path.join(this.outputDir, 'filename_mapping.json');
      
      const mappingData = {
        generatedAt: new Date().toISOString(),
        totalProducts: analysisResults.length,
        successfulMappings: filenameResults.length,
        errors: errors.length,
        mappings: filenameResults,
        errorDetails: errors
      };
      
      await fs.writeJson(mappingOutputPath, mappingData, { spaces: 2 });
      console.log(`✓ Filename generation complete: ${this.stats.renamingSuccesses} succeeded, saved to ${mappingOutputPath}`);
      
      // Show sample mappings
      if (filenameResults.length > 0) {
        console.log('\n📋 Sample Filename Mappings:');
        console.log(''.padEnd(80, '-'));
        const sample = filenameResults.slice(0, 5);
        for (const result of sample) {
          console.log(`📁 ${result.category.padEnd(15)} | ${result.originalFilename}`);
          console.log(`${''.padEnd(15)} → ${result.newFilename}\n`);
        }
        if (filenameResults.length > 5) {
          console.log(`... and ${filenameResults.length - 5} more mappings\n`);
        }
      }
      
      return filenameResults;
    } catch (error) {
      console.error('❌ Filename generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Step 6: Apply filename renaming with backup
   */
  async applyFileRenaming(filenameResults) {
    if (!this.applyRenaming) {
      console.log('\n💡 Step 6: Skipping file renaming (--no-rename flag)');
      return { renamed: [], errors: [], backupPath: null };
    }
    
    console.log('\n🔄 Step 6: Applying filename renaming...');
    
    try {
      const renamingResults = await this.fileNamingAgent.applyRenaming(
        filenameResults,
        this.downloadsDir,
        this.createBackup
      );
      
      this.stats.backupPath = renamingResults.backupPath;
      this.stats.renamingSuccesses = renamingResults.renamed.length;
      this.stats.renamingFailures = renamingResults.errors.length;
      
      console.log(`✓ File renaming complete: ${this.stats.renamingSuccesses} files renamed`);
      
      if (renamingResults.backupPath) {
        console.log(`📦 Backup created at: ${renamingResults.backupPath}`);
      }
      
      return renamingResults;
    } catch (error) {
      console.error('❌ File renaming failed:', error.message);
      throw error;
    }
  }

  /**
   * Step 7: Generate comprehensive report
   */
  async generateReport(renamingResults = null) {
    console.log('\n📊 Step 7: Generating final report...');
    
    const report = {
      generatedAt: new Date().toISOString(),
      mode: this.dryRun ? 'dry-run' : 'live',
      settings: {
        createBackup: this.createBackup,
        applyRenaming: this.applyRenaming
      },
      statistics: this.stats,
      summary: {
        totalProcessed: this.stats.totalImages,
        analysisSuccessRate: this.stats.totalImages > 0 ? 
          Math.round((this.stats.analysisSuccesses / this.stats.totalImages) * 100) : 0,
        filesRenamed: this.stats.renamingSuccesses,
        backupCreated: !!this.stats.backupPath
      }
    };
    
    if (renamingResults) {
      report.renamingDetails = renamingResults;
    }
    
    // Save report
    const reportPath = path.join(this.outputDir, 'analysis_report.json');
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    // Print summary
    console.log('\n📋 Process Summary:');
    console.log(''.padEnd(60, '='));
    console.log(`Total images: ${this.stats.totalImages}`);
    console.log(`Downloads: ${this.stats.downloadSuccesses} ✓, ${this.stats.downloadFailures} ❌`);
    console.log(`AI Analysis: ${this.stats.analysisSuccesses} ✓, ${this.stats.analysisFailures} ❌`);
    console.log(`Filename Generation: ${this.stats.renamingSuccesses} ✓, ${this.stats.renamingFailures} ❌`);
    if (this.stats.backupPath) {
      console.log(`Backup Location: ${this.stats.backupPath}`);
    }
    console.log(`Detailed Report: ${reportPath}`);
    console.log(''.padEnd(60, '='));
    
    return report;
  }

  /**
   * Main workflow execution
   */
  async execute() {
    const startTime = Date.now();
    
    try {
      // Step 1: Load JSON data
      const imageEntries = await this.loadImageJson();
      
      // Step 2: Download images
      const downloadedPaths = await this.ensureImagesDownloaded(imageEntries);
      
      // Step 3: Prepare queue
      const { imagePaths, categoryHints } = await this.prepareImageQueue(downloadedPaths);
      
      // Step 4: Analyze images
      const analysisResults = await this.analyzeImages(imagePaths, categoryHints);
      
      // Step 5: Generate filenames
      const filenameResults = await this.generateFilenames(analysisResults);
      
      // Step 6: Apply renaming
      const renamingResults = await this.applyFileRenaming(filenameResults);
      
      // Step 7: Generate report
      const report = await this.generateReport(renamingResults);
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`\n🎉 AI Analysis and Renaming Workflow completed successfully in ${duration}s!`);
      
      return report;
      
    } catch (error) {
      console.error('\n💥 Workflow failed:', error.message);
      console.error(error.stack);
      
      // Generate partial report on failure
      try {
        await this.generateReport();
      } catch (reportError) {
        console.error('Failed to generate error report:', reportError.message);
      }
      
      process.exit(1);
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔍 AI-Powered Image Analysis and Intelligent Renaming Workflow

This script uses AI to analyze product images and generate intelligent filenames:

1. Downloads images from spocket-scraped-images.json (if needed)
2. Analyzes each image with GPT-4o to extract product information
3. Generates SEO-friendly filenames based on AI analysis
4. Optionally renames files with backup

Usage:
  node scripts/production/analyze-and-rename-images.js [options]

Options:
  --dry-run        Preview actions without making changes
  --no-backup      Skip creating backup of original files
  --no-rename      Generate analysis and filenames but don't rename files
  --help, -h       Show this help message

Examples:
  # Full workflow with backup
  node scripts/production/analyze-and-rename-images.js

  # Preview mode (no changes)
  node scripts/production/analyze-and-rename-images.js --dry-run

  # Generate analysis and filenames only (no renaming)
  node scripts/production/analyze-and-rename-images.js --no-rename

Files:
  Input:  spocket-scraped-images.json (image URLs and metadata)
  Output: output/analysis_results.json (AI analysis results)
          output/filename_mapping.json (generated filename mappings)
          output/analysis_report.json (comprehensive report)
`);
    process.exit(0);
  }
  
  const options = {
    dryRun: args.includes('--dry-run'),
    createBackup: !args.includes('--no-backup'),
    applyRenaming: !args.includes('--no-rename')
  };
  
  const workflow = new ImageAnalysisWorkflow(options);
  workflow.execute();
}

export { ImageAnalysisWorkflow };
