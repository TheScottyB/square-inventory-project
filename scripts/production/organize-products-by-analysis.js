#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

/**
 * Product Organization Script
 * 
 * This script reads AI analysis results and organizes products into individual folders:
 * 1. Reads analysis_results.json 
 * 2. Groups products by unique product name/category combinations
 * 3. Creates organized folder structure: assets/organized/{category}/{product-name}/
 * 4. Moves related images into their product folders
 * 5. Creates product metadata files with AI analysis data
 * 6. Generates organization report
 * 
 * Usage: node scripts/production/organize-products-by-analysis.js [--dry-run] [--clean]
 */

class ProductOrganizer {
  constructor(options = {}) {
    this.dryRun = options.dryRun || process.env.ENABLE_DRY_RUN === 'true';
    this.cleanExisting = options.cleanExisting || false;
    
    // Paths
    this.analysisResultsPath = 'output/analysis_results.json';
    this.sourceDir = 'assets/downloads/miscellaneous-products';
    this.organizedDir = 'assets/organized';
    this.outputDir = 'output';
    
    // Statistics
    this.stats = {
      totalProducts: 0,
      uniqueProducts: 0,
      foldersCreated: 0,
      filesMovedSuccessfully: 0,
      filesMovedFailed: 0,
      metadataFilesCreated: 0
    };
    
    console.log('📁 Product Organization Based on AI Analysis');
    console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE'}${this.cleanExisting ? ' (clean existing)' : ''}`);
    console.log(''.padEnd(70, '='));
  }

  /**
   * Step 1: Load analysis results
   */
  async loadAnalysisResults() {
    console.log('\n📂 Step 1: Loading AI analysis results...');
    
    try {
      if (!await fs.pathExists(this.analysisResultsPath)) {
        throw new Error(`Analysis results not found: ${this.analysisResultsPath}`);
      }
      
      const analysisData = await fs.readJson(this.analysisResultsPath);
      
      if (!analysisData.analysisResults || !Array.isArray(analysisData.analysisResults)) {
        throw new Error('Invalid analysis results structure');
      }
      
      this.stats.totalProducts = analysisData.analysisResults.length;
      console.log(`✓ Loaded ${this.stats.totalProducts} analyzed products`);
      
      return analysisData.analysisResults;
    } catch (error) {
      console.error('❌ Failed to load analysis results:', error.message);
      throw error;
    }
  }

  /**
   * Step 2: Group products by unique combinations
   */
  async groupProducts(analysisResults) {
    console.log('\n🗂️ Step 2: Grouping products by unique identifiers...');
    
    const productGroups = new Map();
    
    for (const analysis of analysisResults) {
      // Create unique identifier combining category and product name
      const categorySlug = this.slugify(analysis.category);
      const productSlug = this.slugify(analysis.productName);
      const uniqueId = `${categorySlug}--${productSlug}`;
      
      if (!productGroups.has(uniqueId)) {
        productGroups.set(uniqueId, {
          id: uniqueId,
          category: analysis.category,
          categorySlug,
          productName: analysis.productName,
          productSlug,
          folderPath: path.join(this.organizedDir, categorySlug, productSlug),
          images: [],
          analyses: []
        });
      }
      
      const group = productGroups.get(uniqueId);
      group.images.push({
        originalPath: analysis.metadata.imagePath,
        filename: analysis.metadata.filename,
        analysisId: crypto.randomUUID()
      });
      group.analyses.push(analysis);
    }
    
    this.stats.uniqueProducts = productGroups.size;
    
    console.log(`✓ Identified ${this.stats.uniqueProducts} unique products:`);
    for (const [id, group] of productGroups) {
      console.log(`   📦 ${group.category} → ${group.productName} (${group.images.length} images)`);
    }
    
    return productGroups;
  }

  /**
   * Step 3: Clean existing organized directory if requested
   */
  async cleanExistingOrganization() {
    if (!this.cleanExisting) {
      return;
    }
    
    console.log('\n🧹 Step 3: Cleaning existing organization...');
    
    if (this.dryRun) {
      console.log(`[DRY RUN] Would clean directory: ${this.organizedDir}`);
      return;
    }
    
    try {
      if (await fs.pathExists(this.organizedDir)) {
        await fs.remove(this.organizedDir);
        console.log(`✓ Cleaned existing organization directory`);
      } else {
        console.log('✓ No existing organization to clean');
      }
    } catch (error) {
      console.warn(`⚠ Failed to clean existing organization: ${error.message}`);
    }
  }

  /**
   * Step 4: Create organized folder structure
   */
  async createFolderStructure(productGroups) {
    console.log('\n📁 Step 4: Creating organized folder structure...');
    
    for (const [id, group] of productGroups) {
      try {
        if (this.dryRun) {
          console.log(`[DRY RUN] Would create folder: ${group.folderPath}`);
        } else {
          await fs.ensureDir(group.folderPath);
          console.log(`✓ Created: ${group.folderPath}`);
        }
        this.stats.foldersCreated++;
      } catch (error) {
        console.error(`❌ Failed to create folder ${group.folderPath}: ${error.message}`);
      }
    }
    
    console.log(`✓ Created ${this.stats.foldersCreated} product folders`);
  }

  /**
   * Step 5: Move images into organized folders
   */
  async organizeImages(productGroups) {
    console.log('\n🖼️ Step 5: Moving images into organized folders...');
    
    for (const [id, group] of productGroups) {
      console.log(`\n[${group.category}] ${group.productName}:`);
      
      for (let i = 0; i < group.images.length; i++) {
        const image = group.images[i];
        const sourcePath = image.originalPath;
        
        // Generate organized filename
        const extension = path.extname(image.filename);
        const organizedFilename = i === 0 
          ? `${group.productSlug}-main${extension}`
          : `${group.productSlug}-${i + 1}${extension}`;
        
        const destinationPath = path.join(group.folderPath, organizedFilename);
        
        try {
          if (this.dryRun) {
            console.log(`   [DRY RUN] Would move: ${path.basename(sourcePath)} → ${organizedFilename}`);
          } else {
            // Check if source exists
            if (await fs.pathExists(sourcePath)) {
              await fs.copy(sourcePath, destinationPath);
              console.log(`   ✓ Moved: ${path.basename(sourcePath)} → ${organizedFilename}`);
              this.stats.filesMovedSuccessfully++;
            } else {
              console.warn(`   ⚠ Source not found: ${sourcePath}`);
              this.stats.filesMovedFailed++;
            }
          }
          
          // Update image info with new path
          image.organizedPath = destinationPath;
          image.organizedFilename = organizedFilename;
          
        } catch (error) {
          console.error(`   ❌ Failed to move ${image.filename}: ${error.message}`);
          this.stats.filesMovedFailed++;
        }
      }
    }
    
    console.log(`✓ Images organized: ${this.stats.filesMovedSuccessfully} succeeded, ${this.stats.filesMovedFailed} failed`);
  }

  /**
   * Step 6: Create product metadata files
   */
  async createProductMetadata(productGroups) {
    console.log('\n📋 Step 6: Creating product metadata files...');
    
    for (const [id, group] of productGroups) {
      try {
        // Aggregate analysis data for the product
        const primaryAnalysis = group.analyses[0];
        const allTags = [...new Set(group.analyses.flatMap(a => a.tags || []))];
        
        const productMetadata = {
          productInfo: {
            name: group.productName,
            category: group.category,
            slug: group.productSlug,
            createdAt: new Date().toISOString()
          },
          analysis: {
            primaryDescription: primaryAnalysis.description,
            condition: primaryAnalysis.condition,
            averageConfidence: group.analyses.reduce((sum, a) => sum + a.confidence, 0) / group.analyses.length,
            allTags: allTags.sort()
          },
          images: group.images.map((img, index) => ({
            filename: img.organizedFilename,
            originalFilename: img.filename,
            isPrimary: index === 0,
            analysisId: img.analysisId
          })),
          analysisDetails: group.analyses.map(analysis => ({
            id: crypto.randomUUID(),
            originalFilename: analysis.metadata.filename,
            productName: analysis.productName,
            description: analysis.description,
            tags: analysis.tags,
            confidence: analysis.confidence,
            analyzedAt: analysis.metadata.analyzedAt,
            model: analysis.metadata.agentModel
          }))
        };
        
        const metadataPath = path.join(group.folderPath, 'product-info.json');
        
        if (this.dryRun) {
          console.log(`   [DRY RUN] Would create metadata: ${metadataPath}`);
        } else {
          await fs.writeJson(metadataPath, productMetadata, { spaces: 2 });
          console.log(`   ✓ Created metadata: ${group.categorySlug}/${group.productSlug}/product-info.json`);
        }
        
        this.stats.metadataFilesCreated++;
        
      } catch (error) {
        console.error(`   ❌ Failed to create metadata for ${group.productName}: ${error.message}`);
      }
    }
    
    console.log(`✓ Created ${this.stats.metadataFilesCreated} product metadata files`);
  }

  /**
   * Step 7: Generate organization report
   */
  async generateOrganizationReport(productGroups) {
    console.log('\n📊 Step 7: Generating organization report...');
    
    const report = {
      generatedAt: new Date().toISOString(),
      mode: this.dryRun ? 'dry-run' : 'live',
      settings: {
        cleanExisting: this.cleanExisting
      },
      statistics: this.stats,
      productGroups: Array.from(productGroups.values()).map(group => ({
        id: group.id,
        category: group.category,
        productName: group.productName,
        folderPath: group.folderPath,
        imageCount: group.images.length,
        analysisCount: group.analyses.length
      })),
      summary: {
        organizationSuccess: this.stats.filesMovedFailed === 0,
        averageImagesPerProduct: Math.round(this.stats.totalProducts / this.stats.uniqueProducts * 10) / 10
      }
    };
    
    // Save report
    await fs.ensureDir(this.outputDir);
    const reportPath = path.join(this.outputDir, 'organization_report.json');
    
    if (!this.dryRun) {
      await fs.writeJson(reportPath, report, { spaces: 2 });
    }
    
    // Print summary
    console.log('\n📋 Organization Summary:');
    console.log(''.padEnd(60, '='));
    console.log(`Total products analyzed: ${this.stats.totalProducts}`);
    console.log(`Unique products identified: ${this.stats.uniqueProducts}`);
    console.log(`Folders created: ${this.stats.foldersCreated}`);
    console.log(`Images organized: ${this.stats.filesMovedSuccessfully} ✓, ${this.stats.filesMovedFailed} ❌`);
    console.log(`Metadata files created: ${this.stats.metadataFilesCreated}`);
    console.log(`Organization report: ${reportPath}`);
    console.log(''.padEnd(60, '='));
    
    return report;
  }

  /**
   * Utility: Create URL-safe slug from text
   */
  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Main execution
   */
  async execute() {
    const startTime = Date.now();
    
    try {
      // Step 1: Load analysis results
      const analysisResults = await this.loadAnalysisResults();
      
      // Step 2: Group products
      const productGroups = await this.groupProducts(analysisResults);
      
      // Step 3: Clean existing (if requested)
      await this.cleanExistingOrganization();
      
      // Step 4: Create folder structure
      await this.createFolderStructure(productGroups);
      
      // Step 5: Organize images
      await this.organizeImages(productGroups);
      
      // Step 6: Create metadata
      await this.createProductMetadata(productGroups);
      
      // Step 7: Generate report
      const report = await this.generateOrganizationReport(productGroups);
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`\n🎉 Product organization completed successfully in ${duration}s!`);
      
      // Show organized structure
      if (!this.dryRun) {
        console.log('\n📁 Organized Structure:');
        console.log(''.padEnd(60, '-'));
        for (const [id, group] of productGroups) {
          console.log(`${group.folderPath}/`);
          for (const image of group.images) {
            console.log(`  ├── ${image.organizedFilename || image.filename}`);
          }
          console.log(`  └── product-info.json`);
        }
      }
      
      return report;
      
    } catch (error) {
      console.error('\n💥 Organization failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
📁 Product Organization Based on AI Analysis

This script organizes analyzed products into individual folders based on AI analysis results:

1. Reads output/analysis_results.json from previous AI analysis
2. Groups products by unique category + product name combinations  
3. Creates organized folder structure: assets/organized/{category}/{product-name}/
4. Moves related images into their product folders with clean naming
5. Creates product-info.json metadata files with complete analysis data
6. Generates comprehensive organization report

Usage:
  node scripts/production/organize-products-by-analysis.js [options]

Options:
  --dry-run       Preview organization without making changes
  --clean         Clean existing organized directory before organizing
  --help, -h      Show this help message

Examples:
  # Organize products into folders
  node scripts/production/organize-products-by-analysis.js

  # Preview organization (no changes)
  node scripts/production/organize-products-by-analysis.js --dry-run

  # Clean existing and reorganize  
  node scripts/production/organize-products-by-analysis.js --clean

Folder Structure Created:
  assets/organized/
  ├── kitchenware/
  │   ├── stainless-steel-acrylic-cutlery-set/
  │   │   ├── stainless-steel-acrylic-cutlery-set-main.jpg
  │   │   ├── stainless-steel-acrylic-cutlery-set-2.jpg
  │   │   └── product-info.json
  │   └── pink-marble-handle-cutlery-set/
  │       ├── pink-marble-handle-cutlery-set-main.jpg
  │       └── product-info.json
  └── organization_report.json
`);
    process.exit(0);
  }
  
  const options = {
    dryRun: args.includes('--dry-run'),
    cleanExisting: args.includes('--clean')
  };
  
  const organizer = new ProductOrganizer(options);
  organizer.execute();
}

export { ProductOrganizer };
