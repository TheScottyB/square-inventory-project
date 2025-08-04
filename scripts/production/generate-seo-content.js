#!/usr/bin/env node

/**
 * Generate SEO Content Pipeline
 * 
 * Generates SEO titles and meta descriptions for all products
 * Optimizes for search while maintaining authenticity
 * Processes by product groups to avoid duplication
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

class SEOContentGenerator {
  constructor(config = {}) {
    this.config = {
      batchSize: config.batchSize ?? 10,
      limit: config.limit ?? null,
      ...config
    };
    
    this.openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
    
    this.stats = {
      total: 0,
      processed: 0,
      seoGenerated: 0,
      failed: 0,
      skipped: 0
    };
  }

  async run() {
    const spinner = ora('Starting SEO Content Generation Pipeline').start();
    
    try {
      // Load the latest enhanced catalog
      spinner.text = 'Loading enhanced catalog...';
      const catalogData = await this.loadLatestCatalog();
      const headers = catalogData[0];
      spinner.succeed(`Loaded ${catalogData.length - 1} items`);
      
      // Find unique products needing SEO
      spinner.start('Analyzing SEO needs...');
      const productsNeedingSEO = this.findProductsNeedingSEO(catalogData, headers);
      spinner.succeed(`Found ${productsNeedingSEO.length} products needing SEO content`);
      
      if (this.config.limit) {
        productsNeedingSEO.splice(this.config.limit);
        console.log(chalk.yellow(`  Limited to ${productsNeedingSEO.length} items`));
      }
      
      this.stats.total = productsNeedingSEO.length;
      
      // Process in batches
      console.log(chalk.cyan(`\n🔍 Generating SEO content for ${productsNeedingSEO.length} products...\n`));
      
      await this.processBatches(productsNeedingSEO, catalogData, headers);
      
      // Save enhanced catalog
      spinner.start('Saving SEO-enhanced catalog...');
      const outputPath = await this.saveEnhancedCatalog(catalogData);
      spinner.succeed('Catalog saved');
      
      // Display summary
      console.log(chalk.cyan('\n📊 SEO Generation Summary:'));
      console.log(chalk.white(`  Total products: ${this.stats.total}`));
      console.log(chalk.green(`  SEO content generated: ${this.stats.seoGenerated}`));
      console.log(chalk.yellow(`  Variations updated: ${this.stats.skipped}`));
      console.log(chalk.red(`  Failed: ${this.stats.failed}`));
      console.log(chalk.gray(`\n  SEO-enhanced catalog: ${outputPath}`));
      
    } catch (error) {
      spinner.fail('Pipeline failed');
      logger.error('Pipeline error:', error);
      throw error;
    }
  }

  async loadLatestCatalog() {
    const enhancedDir = join(projectRoot, 'exports/enhanced');
    const files = await fs.readdir(enhancedDir);
    
    // Get the most recent descriptions-enhanced catalog
    const catalogFiles = files
      .filter(f => f.includes('descriptions-enhanced') && f.endsWith('.xlsx'))
      .sort()
      .reverse();
    
    if (catalogFiles.length === 0) {
      throw new Error('No descriptions-enhanced catalog found');
    }
    
    const catalogPath = join(enhancedDir, catalogFiles[0]);
    logger.info('Using catalog:', catalogPath);
    
    const workbook = xlsx.readFile(catalogPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  }

  findProductsNeedingSEO(catalogData, headers) {
    const itemNameIndex = headers.indexOf('Item Name');
    const seoTitleIndex = headers.indexOf('SEO Title');
    const seoDescIndex = headers.indexOf('SEO Description');
    const descIndex = headers.indexOf('Description');
    const catIndex = headers.indexOf('Categories');
    const skuIndex = headers.indexOf('SKU');
    
    const productsNeedingSEO = [];
    const processedItemNames = new Set();
    
    for (let i = 1; i < catalogData.length; i++) {
      const row = catalogData[i];
      const itemName = row[itemNameIndex];
      const seoTitle = row[seoTitleIndex];
      const seoDesc = row[seoDescIndex];
      
      // Skip if no item name
      if (!itemName) continue;
      
      // Skip if already processed (for variations)
      if (processedItemNames.has(itemName)) {
        continue;
      }
      
      // Check if needs SEO content
      if (!seoTitle || seoTitle.length < 30 || !seoDesc || seoDesc.length < 100) {
        productsNeedingSEO.push({
          index: i,
          itemName,
          description: row[descIndex],
          category: row[catIndex],
          sku: row[skuIndex],
          currentSEOTitle: seoTitle,
          currentSEODesc: seoDesc
        });
        
        processedItemNames.add(itemName);
      }
    }
    
    return productsNeedingSEO;
  }

  async processBatches(items, catalogData, headers) {
    const batches = [];
    
    // Create batches
    for (let i = 0; i < items.length; i += this.config.batchSize) {
      batches.push(items.slice(i, i + this.config.batchSize));
    }
    
    console.log(chalk.gray(`Processing ${batches.length} batches of ${this.config.batchSize} items each...`));
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(chalk.blue(`\n[Batch ${i + 1}/${batches.length}]`));
      
      // Process items in batch concurrently
      const promises = batch.map(item => this.generateSEOContent(item, catalogData, headers));
      const results = await Promise.allSettled(promises);
      
      // Update stats
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          this.stats.seoGenerated++;
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
      
      // Small delay between batches
      if (i < batches.length - 1) {
        await this.delay(1000);
      }
    }
  }

  async generateSEOContent(item, catalogData, headers) {
    try {
      const storeName = "The Real Rarities Vintage";
      
      const prompt = `Create SEO-optimized title and meta description for an online metaphysical/spiritual retail store.

Product: ${item.itemName}
Category: ${item.category || 'General'}
Description: ${item.description ? item.description.substring(0, 300) + '...' : 'N/A'}

Create:
1. SEO Title (50-60 characters): Include product name + key benefit/feature + store category
2. Meta Description (150-160 characters): Compelling description with call-to-action

Guidelines:
- Use relevant keywords naturally
- Include emotional/spiritual benefits
- Add urgency or uniqueness when appropriate
- Avoid keyword stuffing
- Make it authentic and compelling

Return JSON format:
{
  "seoTitle": "Your SEO title here",
  "seoDescription": "Your meta description here"
}`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an SEO expert for a metaphysical and spiritual retail store. Create compelling, search-optimized content that converts browsers into buyers.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 200,
        response_format: { type: "json_object" }
      });
      
      const seoContent = JSON.parse(completion.choices[0].message.content);
      
      // Validate lengths
      if (seoContent.seoTitle && seoContent.seoTitle.length > 60) {
        seoContent.seoTitle = seoContent.seoTitle.substring(0, 57) + '...';
      }
      if (seoContent.seoDescription && seoContent.seoDescription.length > 160) {
        seoContent.seoDescription = seoContent.seoDescription.substring(0, 157) + '...';
      }
      
      // Update the catalog
      const seoTitleIndex = headers.indexOf('SEO Title');
      const seoDescIndex = headers.indexOf('SEO Description');
      const itemNameIndex = headers.indexOf('Item Name');
      
      // Update main item
      catalogData[item.index][seoTitleIndex] = seoContent.seoTitle;
      catalogData[item.index][seoDescIndex] = seoContent.seoDescription;
      
      // Update all variations
      for (let i = 1; i < catalogData.length; i++) {
        if (catalogData[i][itemNameIndex] === item.itemName && i !== item.index) {
          catalogData[i][seoTitleIndex] = seoContent.seoTitle;
          catalogData[i][seoDescIndex] = seoContent.seoDescription;
          this.stats.skipped++;
        }
      }
      
      return seoContent;
      
    } catch (error) {
      logger.error(`Failed to generate SEO for ${item.itemName}:`, error);
      throw error;
    }
  }

  async saveEnhancedCatalog(catalogData) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = join(projectRoot, 'exports/enhanced', `seo-enhanced-${timestamp}.xlsx`);
    
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet(catalogData);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'SEO Enhanced Catalog');
    
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
  console.log(chalk.bold.cyan('\n🔍 SEO Content Generator\n'));
  
  const config = parseArgs();
  const generator = new SEOContentGenerator(config);
  
  try {
    await generator.run();
    console.log(chalk.green('\n✨ SEO generation completed!\n'));
  } catch (error) {
    console.error(chalk.red('\n❌ Generation failed:'), error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { SEOContentGenerator };