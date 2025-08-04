#!/usr/bin/env node

/**
 * Generate Missing Descriptions Pipeline
 * 
 * Focuses only on items missing descriptions
 * Uses OpenAI to generate engaging product descriptions
 * Processes in batches for efficiency
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import xlsx from 'xlsx';
import ora from 'ora';
import chalk from 'chalk';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { logger } from '../../src/utils/logger.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

class DescriptionGenerator {
  constructor(config = {}) {
    this.config = {
      batchSize: config.batchSize ?? 10,
      maxConcurrent: config.maxConcurrent ?? 3,
      limit: config.limit ?? null,
      ...config
    };
    
    this.openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
    
    this.stats = {
      total: 0,
      processed: 0,
      generated: 0,
      failed: 0,
      skipped: 0
    };
  }

  async run() {
    const spinner = ora('Starting Description Generation Pipeline').start();
    
    try {
      // Load the latest enhanced catalog
      spinner.text = 'Loading enhanced catalog...';
      const catalogData = await this.loadLatestCatalog();
      const headers = catalogData[0];
      spinner.succeed(`Loaded ${catalogData.length - 1} items`);
      
      // Find items missing descriptions
      spinner.start('Finding items missing descriptions...');
      const itemsNeedingDescriptions = this.findItemsMissingDescriptions(catalogData, headers);
      spinner.succeed(`Found ${itemsNeedingDescriptions.length} items needing descriptions`);
      
      if (this.config.limit) {
        itemsNeedingDescriptions.splice(this.config.limit);
        console.log(chalk.yellow(`  Limited to ${itemsNeedingDescriptions.length} items`));
      }
      
      this.stats.total = itemsNeedingDescriptions.length;
      
      // Process in batches
      console.log(chalk.cyan(`\n📝 Generating descriptions for ${itemsNeedingDescriptions.length} items...\n`));
      
      const results = await this.processBatches(itemsNeedingDescriptions, catalogData, headers);
      
      // Save enhanced catalog
      spinner.start('Saving enhanced catalog...');
      const outputPath = await this.saveEnhancedCatalog(catalogData, headers);
      spinner.succeed('Catalog saved');
      
      // Display summary
      console.log(chalk.cyan('\n📊 Generation Summary:'));
      console.log(chalk.white(`  Total items: ${this.stats.total}`));
      console.log(chalk.green(`  Descriptions generated: ${this.stats.generated}`));
      console.log(chalk.yellow(`  Skipped (variations): ${this.stats.skipped}`));
      console.log(chalk.red(`  Failed: ${this.stats.failed}`));
      console.log(chalk.gray(`\n  Enhanced catalog: ${outputPath}`));
      
    } catch (error) {
      spinner.fail('Pipeline failed');
      logger.error('Pipeline error:', error);
      throw error;
    }
  }

  async loadLatestCatalog() {
    const enhancedDir = join(projectRoot, 'exports/enhanced');
    const files = await fs.readdir(enhancedDir);
    
    // Get the most recent smart-enhanced catalog
    const catalogFiles = files
      .filter(f => f.includes('enhanced') && f.endsWith('.xlsx'))
      .sort()
      .reverse();
    
    if (catalogFiles.length === 0) {
      throw new Error('No enhanced catalog found');
    }
    
    const catalogPath = join(enhancedDir, catalogFiles[0]);
    logger.info('Using catalog:', catalogPath);
    
    const workbook = xlsx.readFile(catalogPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  }

  findItemsMissingDescriptions(catalogData, headers) {
    const itemNameIndex = headers.indexOf('Item Name');
    const descIndex = headers.indexOf('Description');
    const skuIndex = headers.indexOf('SKU');
    const catIndex = headers.indexOf('Categories');
    const variationIndex = headers.indexOf('Variation Name');
    
    const itemsNeedingDesc = [];
    const processedItemNames = new Set();
    
    for (let i = 1; i < catalogData.length; i++) {
      const row = catalogData[i];
      const itemName = row[itemNameIndex];
      const desc = row[descIndex];
      const sku = row[skuIndex];
      const category = row[catIndex];
      const variation = row[variationIndex];
      
      // Skip if no item name
      if (!itemName) continue;
      
      // For products with variations, only process once per item name
      if (processedItemNames.has(itemName)) {
        continue;
      }
      
      // Check if needs description
      if (!desc || desc.length < 50) {
        itemsNeedingDesc.push({
          index: i,
          itemName,
          sku,
          category,
          variation,
          currentDesc: desc
        });
        
        processedItemNames.add(itemName);
      }
    }
    
    return itemsNeedingDesc;
  }

  async processBatches(items, catalogData, headers) {
    const batches = [];
    
    // Create batches
    for (let i = 0; i < items.length; i += this.config.batchSize) {
      batches.push(items.slice(i, i + this.config.batchSize));
    }
    
    console.log(chalk.gray(`Processing ${batches.length} batches of ${this.config.batchSize} items each...`));
    
    // Process batches with concurrency control
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(chalk.blue(`\n[Batch ${i + 1}/${batches.length}]`));
      
      // Process items in batch concurrently
      const promises = batch.map(item => this.generateDescription(item, catalogData, headers));
      const results = await Promise.allSettled(promises);
      
      // Update stats
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          this.stats.generated++;
          console.log(chalk.green(`  ✓ ${batch[idx].itemName}`));
        } else {
          this.stats.failed++;
          console.log(chalk.red(`  ✗ ${batch[idx].itemName}: ${result.reason?.message || 'Failed'}`));
        }
        this.stats.processed++;
      });
      
      // Progress update
      const progress = ((this.stats.processed / this.stats.total) * 100).toFixed(1);
      console.log(chalk.gray(`  Progress: ${progress}%`));
      
      // Small delay between batches to avoid rate limits
      if (i < batches.length - 1) {
        await this.delay(1000);
      }
    }
  }

  async generateDescription(item, catalogData, headers) {
    try {
      // Build context for description generation
      const context = this.buildContext(item);
      
      const prompt = `Create an engaging product description for an online metaphysical/spiritual retail store.

Product: ${item.itemName}
Category: ${item.category || 'General'}
SKU: ${item.sku || 'N/A'}
Current Description: ${item.currentDesc || 'None'}

Please create a compelling product description that:
1. Is 150-300 words long
2. Highlights the spiritual/metaphysical aspects if applicable
3. Includes practical benefits and uses
4. Uses engaging, authentic language
5. Avoids excessive marketing hype
6. Mentions key features and specifications where relevant

Return ONLY the description text, no additional formatting or explanations.`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert copywriter for a metaphysical and spiritual retail store. Create authentic, engaging product descriptions that resonate with spiritual seekers and conscious consumers.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 400
      });
      
      const description = completion.choices[0].message.content.trim();
      
      // Update the catalog
      const descIndex = headers.indexOf('Description');
      catalogData[item.index][descIndex] = description;
      
      // Also update all variations of this product
      const itemNameIndex = headers.indexOf('Item Name');
      for (let i = 1; i < catalogData.length; i++) {
        if (catalogData[i][itemNameIndex] === item.itemName && i !== item.index) {
          catalogData[i][descIndex] = description;
          this.stats.skipped++;
        }
      }
      
      return description;
      
    } catch (error) {
      logger.error(`Failed to generate description for ${item.itemName}:`, error);
      throw error;
    }
  }

  buildContext(item) {
    // Extract context from item name and category
    const context = {
      type: 'general',
      keywords: []
    };
    
    const name = item.itemName.toLowerCase();
    
    // Identify product type
    if (name.includes('crystal') || name.includes('stone')) {
      context.type = 'crystal';
      context.keywords.push('healing', 'energy', 'chakra');
    } else if (name.includes('candle')) {
      context.type = 'candle';
      context.keywords.push('ritual', 'intention', 'ambiance');
    } else if (name.includes('sage') || name.includes('smudge')) {
      context.type = 'smudging';
      context.keywords.push('cleansing', 'purification', 'sacred');
    } else if (name.includes('jewelry') || name.includes('bracelet') || name.includes('necklace')) {
      context.type = 'jewelry';
      context.keywords.push('spiritual', 'meaningful', 'energy');
    } else if (name.includes('singing bowl') || name.includes('bowl')) {
      context.type = 'sound healing';
      context.keywords.push('meditation', 'healing', 'vibration');
    }
    
    return context;
  }

  async saveEnhancedCatalog(catalogData, headers) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = join(projectRoot, 'exports/enhanced', `descriptions-enhanced-${timestamp}.xlsx`);
    
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet(catalogData);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Enhanced Catalog');
    
    xlsx.writeFile(workbook, outputPath);
    
    return outputPath;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    limit: null,
    batchSize: 10
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      config.limit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--batch-size' && args[i + 1]) {
      config.batchSize = parseInt(args[i + 1]);
      i++;
    }
  }
  
  return config;
}

// Main execution
async function main() {
  console.log(chalk.bold.cyan('\n📝 Missing Descriptions Generator\n'));
  
  const config = parseArgs();
  const generator = new DescriptionGenerator(config);
  
  try {
    await generator.run();
    console.log(chalk.green('\n✨ Description generation completed!\n'));
  } catch (error) {
    console.error(chalk.red('\n❌ Generation failed:'), error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DescriptionGenerator };