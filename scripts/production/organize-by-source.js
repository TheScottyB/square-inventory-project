#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

/**
 * Smart Product Organization by Source
 * 
 * This script organizes products correctly by understanding that:
 * 1. Images from the same JSON source = same product (different angles/pieces)
 * 2. Original JSON metadata is the source of truth for product identity
 * 3. AI analysis provides supplementary descriptions, not product identification
 * 
 * Usage: node scripts/production/organize-by-source.js [--dry-run] [--clean]
 */

class SmartProductOrganizer {
  constructor(options = {}) {
    this.dryRun = options.dryRun || process.env.ENABLE_DRY_RUN === 'true';
    this.cleanExisting = options.cleanExisting || false;
    
    // Paths
    this.sourceJsonPath = 'spocket-scraped-images.json';
    this.analysisResultsPath = 'output/analysis_results.json';
    this.sourceDir = 'assets/downloads/miscellaneous-products';
    this.organizedDir = 'assets/organized';
    this.outputDir = 'output';
    
    // Statistics
    this.stats = {
      totalImages: 0,
      sourceProducts: 0,
      foldersCreated: 0,
      filesMovedSuccessfully: 0,
      filesMovedFailed: 0,
      metadataFilesCreated: 0
    };
    
    console.log('🎯 Smart Product Organization by Source');
    console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE'}${this.cleanExisting ? ' (clean existing)' : ''}`);
    console.log(''.padEnd(70, '='));
    console.log('📝 Logic: Group by JSON source (same product page = same product)');
    console.log(''.padEnd(70, '='));
  }

  /**
   * Step 1: Load source JSON and analysis results
   */
  async loadSourceData() {
    console.log('\n📂 Step 1: Loading source data...');
    
    // Load original JSON data (source of truth)
    if (!await fs.pathExists(this.sourceJsonPath)) {
      throw new Error(`Source JSON not found: ${this.sourceJsonPath}`);
    }
    const sourceData = await fs.readJson(this.sourceJsonPath);
    
    // Load AI analysis results (supplementary data)
    let analysisData = null;
    if (await fs.pathExists(this.analysisResultsPath)) {
      analysisData = await fs.readJson(this.analysisResultsPath);
      console.log(`✓ Loaded ${analysisData.analysisResults?.length || 0} AI analysis results`);
    } else {
      console.log('⚠ No AI analysis results found - will use source data only');
    }
    
    console.log(`✓ Loaded source data: ${sourceData.productImages?.length || 0} images from ${sourceData.pageType || 'unknown'} page`);
    
    return {
      sourceImages: sourceData.productImages || [],
      analysisResults: analysisData?.analysisResults || [],
      sourceMetadata: {
        pageType: sourceData.pageType,
        totalImages: sourceData.totalImages,
        filteredImages: sourceData.filteredImages
      }
    };
  }

  /**
   * Step 2: Create analysis lookup by filename
   */
  createAnalysisLookup(analysisResults) {
    console.log('\n🔍 Step 2: Creating AI analysis lookup...');
    
    const lookup = new Map();
    
    for (const analysis of analysisResults) {
      const filename = analysis.metadata?.filename;
      if (filename) {
        lookup.set(filename, analysis);
      }
    }
    
    console.log(`✓ Created lookup for ${lookup.size} analyzed images`);
    return lookup;
  }

  /**
   * Step 3: Group images by actual product (from source)
   */
  async groupBySourceProduct(sourceImages, analysisLookup) {
    console.log('\n🗂️ Step 3: Grouping by source product...');
    
    // Since all images are from same JSON source, they're all the same product
    const productGroups = new Map();
    
    // Use the first image's product data as the canonical product info
    const firstImage = sourceImages[0];
    if (!firstImage) {
      throw new Error('No source images found');
    }
    
    // Create single product group
    const productName = firstImage.productName || 'Unknown Product';
    const category = firstImage.category || 'Miscellaneous';
    const productSlug = this.slugify(productName);
    const categorySlug = this.slugify(category);
    const productId = `${categorySlug}--${productSlug}`;
    
    console.log(`📦 Identified source product: "${productName}" in category "${category}"`);
    
    const productGroup = {
      id: productId,
      category: category,
      categorySlug: categorySlug,
      productName: productName,
      productSlug: productSlug,
      folderPath: path.join(this.organizedDir, categorySlug, productSlug),
      sourceMetadata: {
        price: firstImage.price,
        description: firstImage.description,
        supplier: firstImage.supplier,
        dimensions: firstImage.dimensions
      },
      images: [],
      analyses: []
    };
    
    // Add all images to this single product
    for (let i = 0; i < sourceImages.length; i++) {
      const sourceImage = sourceImages[i];
      const analysis = analysisLookup.get(sourceImage.filename);
      
      // Determine current filename (may have been renamed)
      let currentFilename = sourceImage.filename;
      const currentPath = path.join(this.sourceDir, currentFilename);
      
      // Check if file was renamed by looking for alternate names
      if (!await fs.pathExists(currentPath)) {
        // Look for renamed versions
        const alternateNames = await this.findRenamedFile(sourceImage.filename);
        if (alternateNames.length > 0) {
          currentFilename = alternateNames[0];
          console.log(`   📝 Found renamed file: ${sourceImage.filename} → ${currentFilename}`);
        }
      }
      
      productGroup.images.push({
        index: i,
        originalFilename: sourceImage.filename,
        currentFilename: currentFilename,
        currentPath: path.join(this.sourceDir, currentFilename),
        url: sourceImage.url,
        alt: sourceImage.alt,
        analysisId: crypto.randomUUID()
      });
      
      if (analysis) {
        productGroup.analyses.push(analysis);
      }
    }
    
    productGroups.set(productId, productGroup);
    
    this.stats.totalImages = sourceImages.length;
    this.stats.sourceProducts = 1; // Only one actual product
    
    console.log(`✓ Grouped ${this.stats.totalImages} images into ${this.stats.sourceProducts} source product`);
    console.log(`   📁 ${productGroup.images.length} images for "${productName}"`);
    
    return productGroups;
  }

  /**
   * Find renamed files by looking for similar names in directory
   */
  async findRenamedFile(originalFilename) {
    try {
      const files = await fs.readdir(this.sourceDir);
      const baseNameWithoutExt = path.basename(originalFilename, path.extname(originalFilename));
      const ext = path.extname(originalFilename);
      
      // Look for files that might be renamed versions
      const candidates = files.filter(file => {
        // Skip if it's the exact original
        if (file === originalFilename) return false;
        
        // Must have same extension
        if (path.extname(file) !== ext) return false;
        
        // Look for files that contain similar elements
        const fileLower = file.toLowerCase();
        const baseElements = baseNameWithoutExt.toLowerCase().split(/[-_]/);
        
        // Check if the file contains key elements from the original
        return baseElements.some(element => 
          element.length > 3 && fileLower.includes(element)
        );
      });
      
      return candidates;
    } catch (error) {
      return [];
    }
  }

  /**
   * Step 4: Clean existing if requested
   */
  async cleanExistingOrganization() {
    if (!this.cleanExisting) {
      return;
    }
    
    console.log('\n🧹 Step 4: Cleaning existing organization...');
    
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
   * Step 5: Create folder structure
   */
  async createFolderStructure(productGroups) {
    console.log('\n📁 Step 5: Creating folder structure...');
    
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
   * Step 6: Organize images
   */
  async organizeImages(productGroups) {
    console.log('\n🖼️ Step 6: Organizing images...');
    
    for (const [id, group] of productGroups) {
      console.log(`\n📦 [${group.category}] ${group.productName}:`);
      
      for (let i = 0; i < group.images.length; i++) {
        const image = group.images[i];
        const sourcePath = image.currentPath;
        
        // Generate organized filename based on original alt text or index
        const extension = path.extname(image.currentFilename);
        let organizedFilename;
        
        if (i === 0) {
          organizedFilename = `${group.productSlug}-main${extension}`;
        } else if (image.alt && image.alt !== 'Image') {
          const altSlug = this.slugify(image.alt);
          organizedFilename = `${group.productSlug}-${altSlug}${extension}`;
        } else {
          organizedFilename = `${group.productSlug}-${i + 1}${extension}`;
        }
        
        const destinationPath = path.join(group.folderPath, organizedFilename);
        
        try {
          if (this.dryRun) {
            console.log(`   [DRY RUN] Would move: ${image.currentFilename} → ${organizedFilename}`);
          } else {
            if (await fs.pathExists(sourcePath)) {
              await fs.copy(sourcePath, destinationPath);
              console.log(`   ✓ Moved: ${image.currentFilename} → ${organizedFilename}`);
              this.stats.filesMovedSuccessfully++;
            } else {
              console.warn(`   ⚠ Source not found: ${sourcePath}`);
              this.stats.filesMovedFailed++;
            }
          }
          
          // Update image info
          image.organizedPath = destinationPath;
          image.organizedFilename = organizedFilename;
          
        } catch (error) {
          console.error(`   ❌ Failed to move ${image.currentFilename}: ${error.message}`);
          this.stats.filesMovedFailed++;
        }
      }
    }
    
    console.log(`✓ Images organized: ${this.stats.filesMovedSuccessfully} succeeded, ${this.stats.filesMovedFailed} failed`);
  }

  /**
   * Step 7: Create enhanced metadata
   */
  async createProductMetadata(productGroups) {
    console.log('\n📋 Step 7: Creating product metadata...');
    
    for (const [id, group] of productGroups) {
      try {
        // Aggregate all AI analyses for richer metadata
        const allTags = [...new Set(group.analyses.flatMap(a => a.tags || []))];
        const avgConfidence = group.analyses.length > 0 
          ? group.analyses.reduce((sum, a) => sum + a.confidence, 0) / group.analyses.length 
          : 0;
        
        const productMetadata = {
          productInfo: {
            name: group.productName,
            category: group.category,
            slug: group.productSlug,
            createdAt: new Date().toISOString(),
            source: 'spocket-scraped-images.json'
          },
          sourceData: {
            ...group.sourceMetadata,
            pageType: 'product-detail',
            totalVariations: group.images.length
          },
          aiAnalysis: {
            analyzedImages: group.analyses.length,
            averageConfidence: avgConfidence,
            aggregatedTags: allTags.sort(),
            primaryDescription: group.analyses[0]?.description || group.sourceMetadata.description
          },
          images: group.images.map((img, index) => ({
            filename: img.organizedFilename,
            originalFilename: img.originalFilename,
            currentFilename: img.currentFilename,
            alt: img.alt,
            isPrimary: index === 0,
            sourceUrl: img.url,
            analysisId: img.analysisId
          })),
          analysisDetails: group.analyses.map(analysis => ({
            id: crypto.randomUUID(),
            originalFilename: analysis.metadata.filename,
            aiProductName: analysis.productName,
            aiCategory: analysis.category,
            description: analysis.description,
            tags: analysis.tags,
            confidence: analysis.confidence,
            condition: analysis.condition,
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
   * Utility: Create URL-safe slug
   */
  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Main execution
   */
  async execute() {
    const startTime = Date.now();
    
    try {
      // Step 1: Load source data
      const { sourceImages, analysisResults, sourceMetadata } = await this.loadSourceData();
      
      // Step 2: Create analysis lookup
      const analysisLookup = this.createAnalysisLookup(analysisResults);
      
      // Step 3: Group by source product
      const productGroups = await this.groupBySourceProduct(sourceImages, analysisLookup);
      
      // Step 4: Clean existing
      await this.cleanExistingOrganization();
      
      // Step 5: Create folders
      await this.createFolderStructure(productGroups);
      
      // Step 6: Organize images
      await this.organizeImages(productGroups);
      
      // Step 7: Create metadata
      await this.createProductMetadata(productGroups);
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`\n🎉 Smart organization completed successfully in ${duration}s!`);
      
      // Show final structure
      if (!this.dryRun) {
        console.log('\n📁 Organized Structure:');
        console.log(''.padEnd(60, '-'));
        for (const [id, group] of productGroups) {
          console.log(`${group.folderPath}/`);
          for (const image of group.images) {
            const indicator = image.organizedFilename?.includes('-main') ? '🌟' : '📸';
            console.log(`  ├── ${indicator} ${image.organizedFilename || image.currentFilename} (${image.alt})`);
          }
          console.log(`  └── 📋 product-info.json`);
        }
      }
      
      console.log('\n📊 Final Summary:');
      console.log(''.padEnd(60, '='));
      console.log(`Source product pages: 1 (spocket-scraped-images.json)`);
      console.log(`Total images: ${this.stats.totalImages}`);
      console.log(`Actual products: ${this.stats.sourceProducts}`);
      console.log(`Images organized: ${this.stats.filesMovedSuccessfully} ✓, ${this.stats.filesMovedFailed} ❌`);
      console.log(`Metadata files: ${this.stats.metadataFilesCreated}`);
      console.log(''.padEnd(60, '='));
      
    } catch (error) {
      console.error('\n💥 Smart organization failed:', error.message);
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
🎯 Smart Product Organization by Source

This script correctly organizes products by understanding that images from the same 
JSON source represent the same product (different angles/pieces), not separate products.

Key Logic:
- Images from same JSON entry = same product (different views)
- Original JSON metadata = source of truth for product identity  
- AI analysis = supplementary data for descriptions/tags
- Handles renamed files automatically

Usage:
  node scripts/production/organize-by-source.js [options]

Options:
  --dry-run       Preview organization without making changes
  --clean         Clean existing organized directory before organizing
  --help, -h      Show this help message

Examples:
  # Smart organize (correct grouping)
  node scripts/production/organize-by-source.js

  # Preview (no changes)
  node scripts/production/organize-by-source.js --dry-run

  # Clean and reorganize
  node scripts/production/organize-by-source.js --clean

Expected Structure:
  assets/organized/
  └── miscellaneous-products/
      └── 10-pcs-sleek-modern-pinky-flatware-set/
          ├── 10-pcs-sleek-modern-pinky-flatware-set-main.jpg
          ├── 10-pcs-sleek-modern-pinky-flatware-set-thumbnail.jpg
          ├── 10-pcs-sleek-modern-pinky-flatware-set-2.jpg
          ├── 10-pcs-sleek-modern-pinky-flatware-set-3.jpg
          ├── 10-pcs-sleek-modern-pinky-flatware-set-4.jpg
          ├── 10-pcs-sleek-modern-pinky-flatware-set-5.jpg
          └── product-info.json
`);
    process.exit(0);
  }
  
  const options = {
    dryRun: args.includes('--dry-run'),
    cleanExisting: args.includes('--clean')
  };
  
  const organizer = new SmartProductOrganizer(options);
  organizer.execute();
}

export { SmartProductOrganizer };
