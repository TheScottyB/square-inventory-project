#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import XLSX from 'xlsx';
import { CorrectSKUAgent } from '../../src/agents/CorrectSKUAgent.js';
import { CorrectCategorizationAgent } from '../../src/agents/CorrectCategorizationAgent.js';
import { CatalogObserver } from '../../src/observability/CatalogObserver.js';

/**
 * Process Current Catalog - Complete processing with correct logic
 * 
 * This script processes the current Square catalog with:
 * 1. Correct column mapping (column 6 for categories, NOT item names)
 * 2. Proper SKU generation for the 68% missing SKUs
 * 3. Fixed categorization using the 16 real categories
 * 4. Enhanced descriptions and SEO fields (future enhancement)
 */

class CatalogProcessor {
  constructor(options = {}) {
    this.options = {
      enableDryRun: options.enableDryRun || false,
      preserveExistingSKUs: options.preserveExistingSKUs || true,
      preserveExistingCategories: options.preserveExistingCategories || true,
      generateMissingSKUs: options.generateMissingSKUs || true,
      fixInvalidCategories: options.fixInvalidCategories || true,
      outputDirectory: options.outputDirectory || './exports/processed-catalog',
      ...options
    };

    // Initialize agents
    this.skuAgent = new CorrectSKUAgent({
      enableDryRun: this.options.enableDryRun,
      preserveExisting: this.options.preserveExistingSKUs,
      brandPrefix: 'RRV'
    });

    this.categorizationAgent = new CorrectCategorizationAgent({
      enableDryRun: this.options.enableDryRun,
      preserveExisting: this.options.preserveExistingCategories
    });

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: true,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/catalog-processing'
    });

    this.processingStats = {
      startTime: null,
      totalRows: 0,
      processedRows: 0,
      skusGenerated: 0,
      categoriesFixed: 0,
      errors: [],
      steps: {}
    };
  }

  /**
   * Main processing function
   * @param {string} catalogFile - Path to catalog Excel file
   * @returns {Promise<Object>} Processing results
   */
  async processCatalog(catalogFile) {
    const processingId = `catalog-processing-${Date.now()}`;
    
    try {
      console.log(`🚀 Starting Catalog Processing: ${processingId}`);
      console.log(`📁 Input File: ${catalogFile}`);
      console.log(`⚙️  Dry Run: ${this.options.enableDryRun ? 'Yes' : 'No'}\n`);
      
      this.processingStats.startTime = Date.now();
      
      // Step 1: Load and validate catalog
      const catalogData = await this.loadCatalog(catalogFile);
      
      // Step 2: Process SKU generation
      let processedData = catalogData;
      if (this.options.generateMissingSKUs) {
        const skuResults = await this.processSKUs(processedData);
        processedData = skuResults.catalogData;
        this.processingStats.skusGenerated = skuResults.stats.skusGenerated;
      }
      
      // Step 3: Process categorization
      if (this.options.fixInvalidCategories) {
        const categoryResults = await this.processCategories(processedData);
        processedData = categoryResults.catalogData;
        this.processingStats.categoriesFixed = categoryResults.stats.categoriesFixed;
      }
      
      // Step 4: Save processed catalog
      const outputResults = await this.saveProcessedCatalog(processedData, processingId);
      
      // Step 5: Generate final report
      const finalReport = await this.generateFinalReport(processingId, outputResults);
      
      console.log(`✅ Catalog processing completed successfully!`);
      console.log(`📄 Report: ${finalReport.reportPath}\n`);
      
      return finalReport;

    } catch (error) {
      console.error(`❌ Catalog processing failed: ${error.message}`);
      await this.handleProcessingError(error, processingId);
      throw error;
    }
  }

  /**
   * Load catalog from Excel file
   * @param {string} catalogFile - Path to Excel file
   * @returns {Promise<Array>} Catalog data as array
   */
  async loadCatalog(catalogFile) {
    const stepStart = Date.now();
    console.log('📊 Step 1: Loading catalog...');
    
    try {
      if (!await fs.pathExists(catalogFile)) {
        throw new Error(`Catalog file not found: ${catalogFile}`);
      }
      
      // Read Excel file
      const workbook = XLSX.readFile(catalogFile);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to array of arrays (preserving exact structure)
      const catalogData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: '',
        blankrows: false
      });
      
      this.processingStats.totalRows = catalogData.length - 1; // Exclude header
      this.processingStats.steps.load = Date.now() - stepStart;
      
      console.log(`   ✅ Loaded ${catalogData.length} rows (${this.processingStats.totalRows} items)`);
      console.log(`   ⏱️  Loading completed in ${Date.now() - stepStart}ms\n`);
      
      return catalogData;

    } catch (error) {
      console.error(`   ❌ Failed to load catalog: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process SKU generation
   * @param {Array} catalogData - Catalog data
   * @returns {Promise<Object>} SKU processing results
   */
  async processSKUs(catalogData) {
    const stepStart = Date.now();
    console.log('🏷️  Step 2: Processing SKU generation...');
    
    try {
      const results = await this.skuAgent.generateCorrectSKUs(catalogData);
      
      this.processingStats.steps.skus = Date.now() - stepStart;
      
      console.log(`   ✅ SKU processing completed:`);
      console.log(`       • Generated: ${results.stats.skusGenerated} SKUs`);
      console.log(`       • Preserved: ${results.stats.skusPreserved} existing SKUs`);
      console.log(`       • Variations: ${results.stats.variationsProcessed} processed`);
      console.log(`   ⏱️  SKU generation completed in ${Date.now() - stepStart}ms\n`);
      
      return results;

    } catch (error) {
      console.error(`   ❌ SKU generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process categorization
   * @param {Array} catalogData - Catalog data
   * @returns {Promise<Object>} Categorization results
   */
  async processCategories(catalogData) {
    const stepStart = Date.now();
    console.log('📂 Step 3: Processing categorization...');
    
    try {
      const results = await this.categorizationAgent.processCorrectCategorization(catalogData);
      
      this.processingStats.steps.categories = Date.now() - stepStart;
      
      console.log(`   ✅ Categorization completed:`);
      console.log(`       • Fixed: ${results.stats.categoriesFixed} categories`);
      console.log(`       • Added: ${results.stats.categoriesAdded} new categories`);
      console.log(`       • Preserved: ${results.stats.categoriesPreserved} existing categories`);
      console.log(`   ⏱️  Categorization completed in ${Date.now() - stepStart}ms\n`);
      
      return results;

    } catch (error) {
      console.error(`   ❌ Categorization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save processed catalog
   * @param {Array} catalogData - Processed catalog data
   * @param {string} processingId - Processing ID
   * @returns {Promise<Object>} Save results
   */
  async saveProcessedCatalog(catalogData, processingId) {
    const stepStart = Date.now();
    console.log('💾 Step 4: Saving processed catalog...');
    
    try {
      await fs.ensureDir(this.options.outputDirectory);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = path.join(
        this.options.outputDirectory,
        `processed-catalog-${timestamp}.xlsx`
      );
      
      // Convert back to Excel format
      const worksheet = XLSX.utils.aoa_to_sheet(catalogData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Catalog');
      
      // Save file
      if (!this.options.enableDryRun) {
        XLSX.writeFile(workbook, outputPath);
      }
      
      // Also save as JSON for debugging
      const jsonPath = outputPath.replace('.xlsx', '.json');
      if (!this.options.enableDryRun) {
        await fs.writeJson(jsonPath, catalogData, { spaces: 2 });
      }
      
      this.processingStats.steps.save = Date.now() - stepStart;
      
      console.log(`   ✅ Catalog saved:`);
      console.log(`       • Excel: ${this.options.enableDryRun ? '[DRY RUN]' : outputPath}`);
      console.log(`       • JSON: ${this.options.enableDryRun ? '[DRY RUN]' : jsonPath}`);
      console.log(`   ⏱️  Saving completed in ${Date.now() - stepStart}ms\n`);
      
      return {
        excelPath: outputPath,
        jsonPath,
        isDryRun: this.options.enableDryRun
      };

    } catch (error) {
      console.error(`   ❌ Failed to save catalog: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate final processing report
   * @param {string} processingId - Processing ID
   * @param {Object} outputResults - Save results
   * @returns {Promise<Object>} Final report
   */
  async generateFinalReport(processingId, outputResults) {
    const totalTime = Date.now() - this.processingStats.startTime;
    
    const report = {
      processingId,
      timestamp: new Date().toISOString(),
      options: this.options,
      statistics: {
        ...this.processingStats,
        totalProcessingTime: totalTime,
        averageTimePerRow: this.processingStats.totalRows > 0 
          ? totalTime / this.processingStats.totalRows 
          : 0
      },
      outputs: outputResults,
      summary: {
        totalRows: this.processingStats.totalRows,
        skusGenerated: this.processingStats.skusGenerated,
        categoriesFixed: this.processingStats.categoriesFixed,
        successRate: this.processingStats.totalRows > 0
          ? ((this.processingStats.totalRows - this.processingStats.errors.length) / this.processingStats.totalRows) * 100
          : 0
      },
      recommendations: this.generateRecommendations()
    };
    
    // Save report
    const reportPath = path.join(this.options.outputDirectory, `processing-report-${processingId}.json`);
    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    console.log('📊 Processing Summary:');
    console.log(`   🎯 Total Rows: ${report.summary.totalRows}`);
    console.log(`   🏷️  SKUs Generated: ${report.summary.skusGenerated}`);
    console.log(`   📂 Categories Fixed: ${report.summary.categoriesFixed}`);
    console.log(`   📈 Success Rate: ${report.summary.successRate.toFixed(1)}%`);
    console.log(`   ⏱️  Total Time: ${(totalTime / 1000).toFixed(1)}s`);
    
    return {
      ...report,
      reportPath
    };
  }

  /**
   * Generate processing recommendations
   * @returns {Array} Recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    
    if (this.processingStats.skusGenerated > 0) {
      recommendations.push(`Generated ${this.processingStats.skusGenerated} SKUs - consider implementing automated SKU generation for new products`);
    }
    
    if (this.processingStats.categoriesFixed > 0) {
      recommendations.push(`Fixed ${this.processingStats.categoriesFixed} categories - review category assignment workflow`);
    }
    
    if (this.processingStats.errors.length > 0) {
      recommendations.push(`${this.processingStats.errors.length} processing errors - manual review needed`);
    }
    
    recommendations.push('Consider implementing SEO field enhancement as next step');
    recommendations.push('Set up automated validation for future catalog imports');
    
    return recommendations;
  }

  /**
   * Handle processing errors
   * @param {Error} error - The error
   * @param {string} processingId - Processing ID
   */
  async handleProcessingError(error, processingId) {
    const errorReport = {
      processingId,
      error: error.message,
      timestamp: new Date().toISOString(),
      processingStats: this.processingStats,
      stackTrace: error.stack
    };
    
    const errorPath = path.join(this.options.outputDirectory, `error-report-${processingId}.json`);
    await fs.ensureDir(path.dirname(errorPath));
    await fs.writeJson(errorPath, errorReport, { spaces: 2 });
    
    console.error(`💥 Processing failed`);
    console.error(`📄 Error report saved: ${errorPath}`);
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Usage: node process-current-catalog.js <catalog-file.xlsx> [options]');
    console.error('Options:');
    console.error('  --dry-run                    Run without making changes');
    console.error('  --preserve-skus             Preserve existing SKUs (default: true)');
    console.error('  --preserve-categories       Preserve existing categories (default: true)');
    console.error('  --skip-sku-generation       Skip SKU generation');
    console.error('  --skip-categorization       Skip categorization fixes');
    process.exit(1);
  }
  
  const catalogFile = args[0];
  const options = {
    enableDryRun: args.includes('--dry-run'),
    preserveExistingSKUs: !args.includes('--no-preserve-skus'),
    preserveExistingCategories: !args.includes('--no-preserve-categories'),
    generateMissingSKUs: !args.includes('--skip-sku-generation'),
    fixInvalidCategories: !args.includes('--skip-categorization')
  };
  
  try {
    const processor = new CatalogProcessor(options);
    await processor.processCatalog(catalogFile);
    
    console.log('🎉 Catalog processing completed successfully!');
    
  } catch (error) {
    console.error(`💥 Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Export for programmatic use
export { CatalogProcessor };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}