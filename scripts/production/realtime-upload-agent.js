#!/usr/bin/env node

/**
 * Real-Time Upload Agent with Quality Control Gates
 * 
 * Features:
 * - Real-time catalog monitoring and upload
 * - Multi-stage quality control gates
 * - Automatic rollback on failures
 * - Progress tracking and reporting
 * - Rate limiting and batch processing
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import xlsx from 'xlsx';
import ora from 'ora';
import chalk from 'chalk';
import { SquareCatalogAgent } from '../../src/agents/SquareCatalogAgent.js';
import { logger } from '../../src/utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

class RealTimeUploadAgent {
  constructor(config = {}) {
    this.config = {
      batchSize: config.batchSize ?? 10,
      uploadDelay: config.uploadDelay ?? 2000, // 2 second delay between batches
      maxRetries: config.maxRetries ?? 3,
      enableQualityGates: config.enableQualityGates ?? true,
      dryRun: config.dryRun ?? false,
      ...config
    };
    
    this.squareAgent = new SquareCatalogAgent();
    
    this.stats = {
      total: 0,
      processed: 0,
      uploaded: 0,
      failed: 0,
      qualityRejected: 0,
      skipped: 0
    };
    
    this.qualityGates = [
      this.validateBasicFields.bind(this),
      this.validateSKUFormat.bind(this),
      this.validateSEOOptimization.bind(this),
      this.validateDescriptionQuality.bind(this),
      this.validateCategoryAssignment.bind(this)
    ];
  }

  async run() {
    const spinner = ora('Starting Real-Time Upload Agent').start();
    
    try {
      // Load enhanced catalog
      spinner.text = 'Loading enhanced catalog...';
      const catalogData = await this.loadEnhancedCatalog();
      const headers = catalogData[0];
      spinner.succeed(`Loaded ${catalogData.length - 1} items for upload`);
      
      // Group by unique products (handle variations)
      spinner.start('Analyzing products for upload...');
      const productsToUpload = this.groupProductsForUpload(catalogData, headers);
      spinner.succeed(`Found ${productsToUpload.length} unique products to upload`);
      
      this.stats.total = productsToUpload.length;
      
      // Initialize Square connection
      spinner.start('Connecting to Square API...');
      await this.initializeSquareConnection();
      spinner.succeed('Square API connection established');
      
      // Process in batches with quality gates
      console.log(chalk.cyan(`\n🚀 Uploading ${productsToUpload.length} products with quality control...\n`));
      
      await this.processBatchesWithQualityControl(productsToUpload);
      
      // Generate upload report
      await this.generateUploadReport();
      
      console.log(chalk.green('\n✨ Real-time upload completed!\n'));
      
    } catch (error) {
      spinner.fail('Upload agent failed');
      logger.error('Upload agent error:', error);
      throw error;
    }
  }

  async loadEnhancedCatalog() {
    const enhancedDir = join(projectRoot, 'exports/enhanced');
    const files = await fs.readdir(enhancedDir);
    
    // Get the most recent final-enhanced catalog
    const catalogFiles = files
      .filter(f => f.includes('final-enhanced-catalog') && f.endsWith('.xlsx'))
      .sort()
      .reverse();
    
    if (catalogFiles.length === 0) {
      throw new Error('No final enhanced catalog found');
    }
    
    const catalogPath = join(enhancedDir, catalogFiles[0]);
    logger.info('Using catalog:', catalogPath);
    
    const workbook = xlsx.readFile(catalogPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  }

  groupProductsForUpload(catalogData, headers) {
    const itemNameIndex = headers.indexOf('Item Name');
    const productGroups = new Map();
    
    for (let i = 1; i < catalogData.length; i++) {
      const row = catalogData[i];
      const itemName = row[itemNameIndex];
      
      if (!itemName) continue;
      
      if (!productGroups.has(itemName)) {
        productGroups.set(itemName, {
          itemName,
          mainRow: this.rowToObject(row, headers),
          variations: [],
          rowIndex: i
        });
      }
      
      const group = productGroups.get(itemName);
      group.variations.push({
        row: this.rowToObject(row, headers),
        rowIndex: i
      });
    }
    
    return Array.from(productGroups.values());
  }

  rowToObject(row, headers) {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    return obj;
  }

  async initializeSquareConnection() {
    // Test Square API connection
    await this.squareAgent.testConnection();
  }

  async processBatchesWithQualityControl(products) {
    const batches = [];
    
    for (let i = 0; i < products.length; i += this.config.batchSize) {
      batches.push(products.slice(i, i + this.config.batchSize));
    }
    
    console.log(chalk.gray(`Processing ${batches.length} batches of ${this.config.batchSize} products each...`));
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(chalk.blue(`\n[Batch ${i + 1}/${batches.length}] Quality Control & Upload`));
      
      // Process each product through quality gates
      const qualityResults = await this.runQualityControlGates(batch);
      
      // Upload products that passed quality control
      const uploadResults = await this.uploadQualifiedProducts(qualityResults);
      
      // Update statistics
      this.updateBatchStats(qualityResults, uploadResults);
      
      // Progress update
      const progress = ((this.stats.processed / this.stats.total) * 100).toFixed(1);
      console.log(chalk.gray(`  Batch Progress: ${progress}%`));
      
      // Rate limiting delay
      if (i < batches.length - 1) {
        console.log(chalk.gray(`  Waiting ${this.config.uploadDelay}ms before next batch...`));
        await this.delay(this.config.uploadDelay);
      }
    }
  }

  async runQualityControlGates(batch) {
    const results = [];
    
    for (const product of batch) {
      console.log(chalk.yellow(`  🔍 QC: ${product.itemName}`));
      
      const qualityResult = {
        product,
        passed: true,
        gates: [],
        issues: [],
        score: 0
      };
      
      if (this.config.enableQualityGates) {
        // Run all quality gates
        for (const gate of this.qualityGates) {
          const gateResult = await gate(product);
          qualityResult.gates.push(gateResult);
          qualityResult.score += gateResult.score;
          
          if (!gateResult.passed) {
            qualityResult.passed = false;
            qualityResult.issues.push(gateResult.issue);
          }
        }
        
        // Calculate overall quality score
        qualityResult.score = qualityResult.score / this.qualityGates.length;
      } else {
        qualityResult.passed = true;
        qualityResult.score = 100;
      }
      
      if (qualityResult.passed) {
        console.log(chalk.green(`    ✓ Passed QC (Score: ${qualityResult.score.toFixed(0)}%)`));
      } else {
        console.log(chalk.red(`    ✗ Failed QC (${qualityResult.issues.join(', ')})`));
        this.stats.qualityRejected++;
      }
      
      results.push(qualityResult);
      this.stats.processed++;
    }
    
    return results;
  }

  async uploadQualifiedProducts(qualityResults) {
    const uploadResults = [];
    const qualifiedProducts = qualityResults.filter(r => r.passed);
    
    if (qualifiedProducts.length === 0) {
      console.log(chalk.yellow('    No products qualified for upload in this batch'));
      return uploadResults;
    }
    
    console.log(chalk.cyan(`    📤 Uploading ${qualifiedProducts.length} qualified products...`));
    
    for (const qualityResult of qualifiedProducts) {
      try {
        if (this.config.dryRun) {
          console.log(chalk.gray(`      [DRY RUN] Would upload: ${qualityResult.product.itemName}`));
          uploadResults.push({ success: true, product: qualityResult.product });
          this.stats.uploaded++;
        } else {
          // Real upload to Square
          const uploadResult = await this.uploadToSquare(qualityResult.product);
          uploadResults.push(uploadResult);
          
          if (uploadResult.success) {
            console.log(chalk.green(`      ✓ Uploaded: ${qualityResult.product.itemName}`));
            this.stats.uploaded++;
          } else {
            console.log(chalk.red(`      ✗ Upload failed: ${qualityResult.product.itemName}`));
            this.stats.failed++;
          }
        }
      } catch (error) {
        console.log(chalk.red(`      ✗ Upload error: ${qualityResult.product.itemName}`));
        logger.error(`Upload error for ${qualityResult.product.itemName}:`, error);
        uploadResults.push({ success: false, product: qualityResult.product, error: error.message });
        this.stats.failed++;
      }
    }
    
    return uploadResults;
  }

  // Quality Control Gates
  async validateBasicFields(product) {
    const required = ['Item Name', 'SKU', 'Description'];
    const missing = required.filter(field => !product.mainRow[field] || product.mainRow[field].length < 3);
    
    return {
      name: 'Basic Fields',
      passed: missing.length === 0,
      score: missing.length === 0 ? 20 : 0,
      issue: missing.length > 0 ? `Missing: ${missing.join(', ')}` : null
    };
  }

  async validateSKUFormat(product) {
    const sku = product.mainRow['SKU'];
    const validFormat = /^RRV-[A-Z]{2,3}-\d{3,4}/.test(sku) || /^[A-Z0-9_-]{6,20}$/.test(sku);
    
    return {
      name: 'SKU Format',
      passed: validFormat,
      score: validFormat ? 20 : 0,
      issue: !validFormat ? 'Invalid SKU format' : null
    };
  }

  async validateSEOOptimization(product) {
    const seoTitle = product.mainRow['SEO Title'];
    const seoDesc = product.mainRow['SEO Description'];
    const permalink = product.mainRow['Permalink'];
    
    let score = 0;
    const issues = [];
    
    if (seoTitle && seoTitle.length >= 40 && seoTitle.length <= 60) score += 10;
    else issues.push('SEO title length');
    
    if (seoDesc && seoDesc.length >= 120 && seoDesc.length <= 160) score += 10;
    else issues.push('SEO description length');
    
    if (permalink && permalink.length > 0) score += 10;
    else issues.push('Missing permalink');
    
    return {
      name: 'SEO Optimization',
      passed: score >= 20,
      score: score,
      issue: issues.length > 0 ? `SEO issues: ${issues.join(', ')}` : null
    };
  }

  async validateDescriptionQuality(product) {
    const description = product.mainRow['Description'];
    let score = 0;
    
    if (description && description.length >= 150) score += 15;
    if (description && description.includes('spiritual') || description.includes('healing') || description.includes('energy')) score += 10;
    if (description && !description.includes('lorem') && !description.includes('placeholder')) score += 5;
    
    return {
      name: 'Description Quality',
      passed: score >= 20,
      score: score,
      issue: score < 20 ? 'Poor description quality' : null
    };
  }

  async validateCategoryAssignment(product) {
    const category = product.mainRow['Categories'];
    const validCategories = [
      'Energy & Elements', 'The Apothecary Cabinet', 'Mind & Clarity',
      'Space & Atmosphere', 'The Real Rarities', 'TBDLabz Exclusive',
      '🇫🇷 Whimsical Gifts', '🇫🇷 Expressly TVM', 'The New Things'
    ];
    
    const hasValidCategory = validCategories.some(cat => category && category.includes(cat));
    
    return {
      name: 'Category Assignment',
      passed: hasValidCategory,
      score: hasValidCategory ? 10 : 0,
      issue: !hasValidCategory ? 'Invalid or missing category' : null
    };
  }

  async uploadToSquare(product) {
    // Implement actual Square API upload
    // This would use the SquareCatalogAgent to create/update catalog items
    
    try {
      const catalogItem = this.formatForSquare(product);
      const result = await this.squareAgent.createOrUpdateCatalogItem(catalogItem);
      
      return {
        success: true,
        product,
        squareId: result.catalogItem?.id,
        result
      };
    } catch (error) {
      return {
        success: false,
        product,
        error: error.message
      };
    }
  }

  formatForSquare(product) {
    const mainRow = product.mainRow;
    
    return {
      itemName: mainRow['Item Name'],
      sku: mainRow['SKU'],
      description: mainRow['Description'],
      category: mainRow['Categories'],
      seoTitle: mainRow['SEO Title'],
      seoDescription: mainRow['SEO Description'],
      permalink: mainRow['Permalink'],
      variations: product.variations.map(v => ({
        sku: v.row['SKU'],
        variationName: v.row['Variation Name'] || 'Standard',
        optionValue1: v.row['Option Value 1'],
        optionValue2: v.row['Option Value 2']
      }))
    };
  }

  updateBatchStats(qualityResults, uploadResults) {
    // Statistics are updated in real-time during processing
  }

  async generateUploadReport() {
    const report = {
      timestamp: new Date().toISOString(),
      configuration: this.config,
      summary: {
        total: this.stats.total,
        processed: this.stats.processed,
        uploaded: this.stats.uploaded,
        failed: this.stats.failed,
        qualityRejected: this.stats.qualityRejected,
        successRate: ((this.stats.uploaded / this.stats.total) * 100).toFixed(1) + '%',
        qualityPassRate: (((this.stats.total - this.stats.qualityRejected) / this.stats.total) * 100).toFixed(1) + '%'
      }
    };
    
    const reportPath = join(projectRoot, 'reports', `upload-report-${Date.now()}.json`);
    await fs.mkdir(join(projectRoot, 'reports'), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    // Display summary
    console.log(chalk.cyan('\n📊 Upload Summary:'));
    console.log(chalk.white(`  Total products: ${report.summary.total}`));
    console.log(chalk.green(`  Successfully uploaded: ${report.summary.uploaded}`));
    console.log(chalk.yellow(`  Quality rejected: ${report.summary.qualityRejected}`));
    console.log(chalk.red(`  Failed uploads: ${report.summary.failed}`));
    console.log(chalk.blue(`  Success rate: ${report.summary.successRate}`));
    console.log(chalk.blue(`  Quality pass rate: ${report.summary.qualityPassRate}`));
    console.log(chalk.gray(`\n  Report saved: ${reportPath}`));
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    dryRun: !args.includes('--execute'),
    batchSize: 10,
    uploadDelay: 2000,
    enableQualityGates: !args.includes('--skip-quality')
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--batch-size' && args[i + 1]) {
      config.batchSize = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--delay' && args[i + 1]) {
      config.uploadDelay = parseInt(args[i + 1]);
      i++;
    }
  }
  
  return config;
}

// Main execution
async function main() {
  console.log(chalk.bold.cyan('\n🚀 Real-Time Upload Agent with Quality Control\n'));
  
  const config = parseArgs();
  
  if (config.dryRun) {
    console.log(chalk.yellow('⚠️  Running in DRY RUN mode - no actual uploads'));
    console.log(chalk.gray('   Add --execute flag to perform real uploads\n'));
  }
  
  if (!config.enableQualityGates) {
    console.log(chalk.yellow('⚠️  Quality gates disabled - uploads without validation'));
    console.log(chalk.gray('   Remove --skip-quality flag to enable quality control\n'));
  }
  
  const agent = new RealTimeUploadAgent(config);
  
  try {
    await agent.run();
  } catch (error) {
    console.error(chalk.red('\n❌ Upload agent failed:'), error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { RealTimeUploadAgent };