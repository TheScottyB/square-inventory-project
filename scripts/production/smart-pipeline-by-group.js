#!/usr/bin/env node

/**
 * Smart Pipeline by Product Group
 * 
 * Processes only one variant per product group to avoid redundant processing
 * Focuses on items from the last export that need enhancement
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import xlsx from 'xlsx';
import ora from 'ora';
import chalk from 'chalk';

// Import agents
import { CorrectSKUAgent } from '../../src/agents/CorrectSKUAgent.js';
import { CorrectCategorizationAgent } from '../../src/agents/CorrectCategorizationAgent.js';
import { logger } from '../../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

class SmartPipelineByGroup {
  constructor(config = {}) {
    this.config = {
      dryRun: config.dryRun ?? true,
      useLastExport: config.useLastExport ?? true,
      limit: config.limit ?? null,
      ...config
    };
    
    this.agents = {
      sku: new CorrectSKUAgent(),
      categorization: new CorrectCategorizationAgent()
    };
  }

  async run() {
    const spinner = ora('Starting Smart Pipeline by Product Group').start();
    
    try {
      // Load the last enhanced export
      spinner.text = 'Loading last enhanced export...';
      const { lastExport, enhancedItems } = await this.loadLastExport();
      spinner.succeed(`Loaded ${enhancedItems.size} enhanced items from last export`);
      
      // Load current catalog
      spinner.start('Loading current catalog...');
      const catalogData = await this.loadFilteredCatalog();
      const headers = catalogData[0];
      spinner.succeed(`Loaded ${catalogData.length - 1} items from filtered catalog`);
      
      // Group products by Item Name
      spinner.start('Grouping products...');
      const productGroups = this.groupProductsByItemName(catalogData);
      spinner.succeed(`Found ${productGroups.size} unique product groups`);
      
      // Filter to items that need processing
      spinner.start('Identifying items needing enhancement...');
      const itemsToProcess = this.selectItemsToProcess(productGroups, enhancedItems, headers);
      spinner.succeed(`Selected ${itemsToProcess.length} product groups to process`);
      
      if (this.config.limit) {
        itemsToProcess.splice(this.config.limit);
        console.log(chalk.yellow(`  Limited to ${itemsToProcess.length} items`));
      }
      
      // Process items
      console.log(chalk.cyan(`\n📋 Processing ${itemsToProcess.length} product groups...\n`));
      
      // First: Generate all SKUs at once
      spinner.start('Generating SKUs for all items...');
      const skuEnhancedCatalog = await this.generateAllSKUs(catalogData);
      spinner.succeed('SKU generation complete');
      
      // Second: Generate categories for items missing them
      spinner.start('Applying categories...');
      const fullyEnhancedCatalog = await this.applyCategorization(skuEnhancedCatalog);
      spinner.succeed('Categorization complete');
      
      // Save results
      await this.saveEnhancedCatalog(fullyEnhancedCatalog);
      
      spinner.succeed('Smart pipeline completed successfully!');
      
    } catch (error) {
      spinner.fail('Pipeline failed');
      logger.error('Pipeline error:', error);
      throw error;
    }
  }

  async loadLastExport() {
    const enhancedDir = join(projectRoot, 'exports/enhanced');
    const files = await fs.readdir(enhancedDir);
    
    // Find the most recent pipeline-enhanced file
    const enhancedFiles = files
      .filter(f => f.startsWith('pipeline-enhanced-') && f.endsWith('.xlsx'))
      .sort()
      .reverse();
    
    if (enhancedFiles.length === 0) {
      return { lastExport: null, enhancedItems: new Set() };
    }
    
    const lastExportPath = join(enhancedDir, enhancedFiles[0]);
    
    // Load and analyze
    const workbook = xlsx.readFile(lastExportPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
    
    const headers = data[0];
    const itemNameIndex = headers.indexOf('Item Name');
    const skuIndex = headers.indexOf('SKU');
    const descIndex = headers.indexOf('Description');
    
    const enhancedItems = new Set();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const itemName = row[itemNameIndex];
      const sku = row[skuIndex];
      const desc = row[descIndex];
      
      // Consider item enhanced if it has a good SKU and description
      if (itemName && sku && sku.match(/^RRV-/) && desc && desc.length > 200) {
        enhancedItems.add(itemName);
      }
    }
    
    return { lastExport: lastExportPath, enhancedItems };
  }

  async loadFilteredCatalog() {
    const exportsDir = join(projectRoot, 'exports');
    const files = await fs.readdir(exportsDir);
    
    // Use the filtered catalog
    const catalogFiles = files
      .filter(f => f.includes('catalog-filtered') && f.endsWith('.xlsx'))
      .sort()
      .reverse();
    
    if (catalogFiles.length === 0) {
      throw new Error('No filtered catalog found');
    }
    
    const catalogPath = join(exportsDir, catalogFiles[0]);
    
    const workbook = xlsx.readFile(catalogPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  }

  groupProductsByItemName(catalogData) {
    const headers = catalogData[0];
    const itemNameIndex = headers.indexOf('Item Name');
    const variationIndex = headers.indexOf('Variation Name');
    
    const groups = new Map();
    
    for (let i = 1; i < catalogData.length; i++) {
      const row = catalogData[i];
      const itemName = row[itemNameIndex];
      
      if (!itemName) continue;
      
      if (!groups.has(itemName)) {
        groups.set(itemName, {
          itemName,
          rows: [],
          firstRowIndex: i
        });
      }
      
      groups.get(itemName).rows.push({
        index: i,
        row: row,
        variation: row[variationIndex] || 'Default'
      });
    }
    
    return groups;
  }

  selectItemsToProcess(productGroups, enhancedItems, headers) {
    const itemsToProcess = [];
    const skuIndex = headers.indexOf('SKU');
    const catIndex = headers.indexOf('Categories');
    
    for (const [itemName, group] of productGroups) {
      // Skip if already enhanced in last export
      if (enhancedItems.has(itemName)) {
        continue;
      }
      
      // Check if needs processing
      const firstRow = group.rows[0].row;
      const needsSKU = !firstRow[skuIndex] || firstRow[skuIndex].length < 3;
      const needsCategory = !firstRow[catIndex] || firstRow[catIndex] === 'Uncategorized';
      
      if (needsSKU || needsCategory) {
        itemsToProcess.push({
          itemName,
          group,
          needsSKU,
          needsCategory,
          variationCount: group.rows.length
        });
      }
    }
    
    // Sort by priority (items with more variations first)
    itemsToProcess.sort((a, b) => b.variationCount - a.variationCount);
    
    return itemsToProcess;
  }

  async generateAllSKUs(catalogData) {
    const result = await this.agents.sku.generateCorrectSKUs(catalogData);
    
    if (result.success) {
      logger.info(`Generated ${result.stats.skusGenerated} SKUs`);
      return result.catalogData;
    }
    
    return catalogData;
  }

  async applyCategorization(catalogData) {
    const result = await this.agents.categorization.processCorrectCategorization(catalogData);
    
    if (result.success) {
      logger.info(`Applied ${result.stats.categoriesAdded} categories`);
      return result.catalogData;
    }
    
    return catalogData;
  }

  async saveEnhancedCatalog(catalogData) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = join(projectRoot, 'exports/enhanced', `smart-enhanced-${timestamp}.xlsx`);
    
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet(catalogData);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Enhanced Catalog');
    
    xlsx.writeFile(workbook, outputPath);
    
    console.log(chalk.green(`\n✅ Enhanced catalog saved to:`));
    console.log(chalk.cyan(`   ${outputPath}`));
    
    return outputPath;
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    dryRun: !args.includes('--execute'),
    limit: null
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      config.limit = parseInt(args[i + 1]);
      i++;
    }
  }
  
  return config;
}

// Main execution
async function main() {
  console.log(chalk.bold.cyan('\n🚀 Smart Pipeline by Product Group\n'));
  
  const config = parseArgs();
  
  if (config.dryRun) {
    console.log(chalk.yellow('⚠️  Running in DRY RUN mode'));
    console.log(chalk.gray('   Add --execute flag to save changes\n'));
  }
  
  const pipeline = new SmartPipelineByGroup(config);
  
  try {
    await pipeline.run();
    console.log(chalk.green('\n✨ Pipeline completed successfully!\n'));
  } catch (error) {
    console.error(chalk.red('\n❌ Pipeline failed:'), error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { SmartPipelineByGroup };