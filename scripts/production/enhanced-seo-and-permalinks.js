#!/usr/bin/env node

/**
 * Enhanced SEO and Permalinks Generator
 * 
 * Creates proper SEO optimization and permalinks for Square catalog
 * Focuses on conversion-optimized content that's different from item names
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

class EnhancedSEOGenerator {
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
      enhanced: 0,
      failed: 0,
      skipped: 0
    };
  }

  async run() {
    const spinner = ora('Starting Enhanced SEO & Permalink Generation').start();
    
    try {
      // Load the latest catalog
      spinner.text = 'Loading latest catalog...';
      const catalogData = await this.loadLatestCatalog();
      const headers = catalogData[0];
      spinner.succeed(`Loaded ${catalogData.length - 1} items`);
      
      // Check if we need to add permalink column
      let permalinkIndex = headers.indexOf('Permalink');
      if (permalinkIndex === -1) {
        headers.push('Permalink');
        permalinkIndex = headers.length - 1;
        // Add empty permalink column to all rows
        for (let i = 1; i < catalogData.length; i++) {
          catalogData[i][permalinkIndex] = '';
        }
        console.log(chalk.yellow('Added Permalink column to catalog'));
      }
      
      // Find products needing enhanced SEO
      spinner.start('Analyzing products for SEO enhancement...');
      const productsToEnhance = this.findProductsNeedingEnhancement(catalogData, headers);
      spinner.succeed(`Found ${productsToEnhance.length} products to enhance`);
      
      if (this.config.limit) {
        productsToEnhance.splice(this.config.limit);
        console.log(chalk.yellow(`  Limited to ${productsToEnhance.length} items`));
      }
      
      this.stats.total = productsToEnhance.length;
      
      // Process in batches
      console.log(chalk.cyan(`\n🚀 Enhancing SEO for ${productsToEnhance.length} products...\n`));
      
      await this.processBatches(productsToEnhance, catalogData, headers);
      
      // Save enhanced catalog
      spinner.start('Saving fully enhanced catalog...');
      const outputPath = await this.saveEnhancedCatalog(catalogData);
      spinner.succeed('Catalog saved');
      
      // Display summary
      console.log(chalk.cyan('\n📊 Enhancement Summary:'));
      console.log(chalk.white(`  Total products: ${this.stats.total}`));
      console.log(chalk.green(`  SEO enhanced: ${this.stats.enhanced}`));
      console.log(chalk.yellow(`  Variations updated: ${this.stats.skipped}`));
      console.log(chalk.red(`  Failed: ${this.stats.failed}`));
      console.log(chalk.gray(`\n  Final catalog: ${outputPath}`));
      
    } catch (error) {
      spinner.fail('Pipeline failed');
      logger.error('Pipeline error:', error);
      throw error;
    }
  }

  async loadLatestCatalog() {
    const enhancedDir = join(projectRoot, 'exports/enhanced');
    const files = await fs.readdir(enhancedDir);
    
    // Get the most recent SEO-enhanced catalog (excluding temp files)
    const catalogFiles = files
      .filter(f => f.includes('seo-enhanced') && f.endsWith('.xlsx') && !f.startsWith('~$'))
      .sort()
      .reverse();
    
    if (catalogFiles.length === 0) {
      throw new Error('No SEO-enhanced catalog found');
    }
    
    const catalogPath = join(enhancedDir, catalogFiles[0]);
    logger.info('Using catalog:', catalogPath);
    
    const workbook = xlsx.readFile(catalogPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  }

  findProductsNeedingEnhancement(catalogData, headers) {
    const itemNameIndex = headers.indexOf('Item Name');
    const seoTitleIndex = headers.indexOf('SEO Title');
    const seoDescIndex = headers.indexOf('SEO Description');
    const permalinkIndex = headers.indexOf('Permalink');
    const descIndex = headers.indexOf('Description');
    const catIndex = headers.indexOf('Categories');
    const skuIndex = headers.indexOf('SKU');
    
    const productsToEnhance = [];
    const processedItemNames = new Set();
    
    for (let i = 1; i < catalogData.length; i++) {
      const row = catalogData[i];
      const itemName = row[itemNameIndex];
      
      // Skip if no item name or already processed
      if (!itemName || processedItemNames.has(itemName)) continue;
      
      const seoTitle = row[seoTitleIndex];
      const seoDesc = row[seoDescIndex];
      const permalink = row[permalinkIndex];
      
      // Check if needs enhancement (missing permalink or poor SEO)
      const needsPermalink = !permalink;
      const needsBetterSEO = !seoTitle || seoTitle.length < 40 || 
                            this.isSEOTooSimilarToItemName(itemName, seoTitle);
      
      if (needsPermalink || needsBetterSEO) {
        productsToEnhance.push({
          index: i,
          itemName,
          description: row[descIndex],
          category: row[catIndex],
          sku: row[skuIndex],
          currentSEOTitle: seoTitle,
          currentSEODesc: seoDesc,
          currentPermalink: permalink,
          needsPermalink,
          needsBetterSEO
        });
        
        processedItemNames.add(itemName);
      }
    }
    
    return productsToEnhance;
  }

  isSEOTooSimilarToItemName(itemName, seoTitle) {
    if (!seoTitle) return true;
    
    // Remove common words and compare
    const cleanItemName = itemName.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const cleanSEOTitle = seoTitle.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // If SEO title is too similar to item name (>70% overlap), needs improvement
    const itemWords = new Set(cleanItemName.split(' '));
    const seoWords = new Set(cleanSEOTitle.split(' '));
    const intersection = new Set([...itemWords].filter(x => seoWords.has(x)));
    const similarity = intersection.size / Math.min(itemWords.size, seoWords.size);
    
    return similarity > 0.7;
  }

  async processBatches(items, catalogData, headers) {
    const batches = [];
    
    for (let i = 0; i < items.length; i += this.config.batchSize) {
      batches.push(items.slice(i, i + this.config.batchSize));
    }
    
    console.log(chalk.gray(`Processing ${batches.length} batches of ${this.config.batchSize} items each...`));
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(chalk.blue(`\n[Batch ${i + 1}/${batches.length}]`));
      
      const promises = batch.map(item => this.enhanceProduct(item, catalogData, headers));
      const results = await Promise.allSettled(promises);
      
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          this.stats.enhanced++;
          console.log(chalk.green(`  ✓ ${batch[idx].itemName}`));
        } else {
          this.stats.failed++;
          console.log(chalk.red(`  ✗ ${batch[idx].itemName}: ${result.reason?.message || 'Failed'}`));
        }
        this.stats.processed++;
      });
      
      const progress = ((this.stats.processed / this.stats.total) * 100).toFixed(1);
      console.log(chalk.gray(`  Progress: ${progress}%`));
      
      if (i < batches.length - 1) {
        await this.delay(1000);
      }
    }
  }

  async enhanceProduct(item, catalogData, headers) {
    try {
      const categoryKeywords = this.getCategoryKeywords(item.category);
      const productType = this.getProductType(item.itemName, item.description);
      
      const prompt = `Create highly optimized SEO content for a metaphysical/spiritual retail store product.

Product: ${item.itemName}
Category: ${item.category || 'General'}
Type: ${productType}
Description: ${item.description ? item.description.substring(0, 200) + '...' : 'N/A'}

Create DIFFERENT and OPTIMIZED content (not just rephrasing the item name):

1. SEO Title (50-60 chars): Focus on BENEFITS, EMOTIONS, and SEARCH TERMS, not just product name
   - Use keywords: ${categoryKeywords.join(', ')}
   - Include emotional triggers: healing, sacred, energy, spiritual, mystical
   - Add value propositions: handcrafted, authentic, premium, powerful

2. Meta Description (150-160 chars): COMPELLING sales copy with call-to-action
   - Focus on transformation, benefits, and emotional connection
   - Include urgency and uniqueness
   - End with clear CTA

3. Permalink (URL-friendly): short, keyword-rich, lowercase with hyphens
   - Format: primary-keyword-secondary-keyword
   - Max 60 characters
   - No special characters

EXAMPLES OF GOOD vs BAD:
❌ BAD: "Amethyst Crystal Bracelet" → "Amethyst Crystal Bracelet - Spiritual Jewelry"
✅ GOOD: "Amethyst Crystal Bracelet" → "Healing Amethyst Bracelet - Anxiety Relief & Spiritual Protection"

❌ BAD: "Rose Quartz Stone" → "High Quality Rose Quartz Stone for Sale"  
✅ GOOD: "Rose Quartz Stone" → "Love & Self-Care Rose Quartz - Heart Chakra Healing Crystal"

Return JSON:
{
  "seoTitle": "benefit-focused title under 60 chars",
  "seoDescription": "compelling sales copy with CTA under 160 chars",
  "permalink": "keyword-rich-url-slug"
}`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are an expert SEO copywriter for spiritual/metaphysical products. Create compelling, conversion-focused content that goes beyond basic product names. Focus on benefits, emotions, and search intent rather than just describing the product. ALWAYS respond with valid JSON format.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 300
      });
      
      const seoContent = JSON.parse(completion.choices[0].message.content);
      
      // Validate and clean up
      if (seoContent.seoTitle && seoContent.seoTitle.length > 60) {
        seoContent.seoTitle = seoContent.seoTitle.substring(0, 57) + '...';
      }
      if (seoContent.seoDescription && seoContent.seoDescription.length > 160) {
        seoContent.seoDescription = seoContent.seoDescription.substring(0, 157) + '...';
      }
      if (seoContent.permalink) {
        seoContent.permalink = this.cleanPermalink(seoContent.permalink);
      }
      
      // Update the catalog
      const seoTitleIndex = headers.indexOf('SEO Title');
      const seoDescIndex = headers.indexOf('SEO Description');
      const permalinkIndex = headers.indexOf('Permalink');
      const itemNameIndex = headers.indexOf('Item Name');
      
      // Update main item
      catalogData[item.index][seoTitleIndex] = seoContent.seoTitle;
      catalogData[item.index][seoDescIndex] = seoContent.seoDescription;
      catalogData[item.index][permalinkIndex] = seoContent.permalink;
      
      // Update all variations with same content
      for (let i = 1; i < catalogData.length; i++) {
        if (catalogData[i][itemNameIndex] === item.itemName && i !== item.index) {
          catalogData[i][seoTitleIndex] = seoContent.seoTitle;
          catalogData[i][seoDescIndex] = seoContent.seoDescription;
          catalogData[i][permalinkIndex] = seoContent.permalink;
          this.stats.skipped++;
        }
      }
      
      return seoContent;
      
    } catch (error) {
      logger.error(`Failed to enhance ${item.itemName}:`, error);
      throw error;
    }
  }

  getCategoryKeywords(category) {
    const keywordMap = {
      'Energy & Elements': ['healing', 'chakra', 'energy', 'spiritual', 'crystal', 'meditation'],
      'The Apothecary Cabinet': ['healing', 'wellness', 'natural', 'herbal', 'therapeutic', 'organic'],
      'Mind & Clarity': ['meditation', 'focus', 'clarity', 'mindfulness', 'peace', 'zen'],
      'Space & Atmosphere': ['ambiance', 'sacred space', 'cleansing', 'protection', 'ritual'],
      'The Real Rarities': ['unique', 'rare', 'collector', 'vintage', 'exclusive', 'special'],
      'TBDLabz Exclusive': ['exclusive', 'limited', 'premium', 'artisan', 'handcrafted'],
      '🇫🇷 Whimsical Gifts': ['gift', 'unique', 'charming', 'special', 'memorable', 'delightful']
    };
    
    return keywordMap[category] || ['spiritual', 'metaphysical', 'healing', 'energy', 'sacred'];
  }

  getProductType(itemName, description) {
    const name = itemName.toLowerCase();
    const desc = (description || '').toLowerCase();
    
    if (name.includes('crystal') || name.includes('stone') || name.includes('gem')) return 'Crystal/Gemstone';
    if (name.includes('candle') || name.includes('ritual')) return 'Candle/Ritual';
    if (name.includes('bracelet') || name.includes('necklace') || name.includes('jewelry')) return 'Spiritual Jewelry';
    if (name.includes('singing bowl') || name.includes('bowl')) return 'Sound Healing';
    if (name.includes('sage') || name.includes('smudge') || name.includes('incense')) return 'Cleansing/Smudging';
    if (name.includes('tarot') || name.includes('oracle') || name.includes('cards')) return 'Divination';
    if (name.includes('oil') && (name.includes('essential') || desc.includes('aromatherapy'))) return 'Essential Oils';
    
    return 'Spiritual/Metaphysical';
  }

  cleanPermalink(permalink) {
    return permalink
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 60);
  }

  async saveEnhancedCatalog(catalogData) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = join(projectRoot, 'exports/enhanced', `final-enhanced-catalog-${timestamp}.xlsx`);
    
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet(catalogData);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Final Enhanced Catalog');
    
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
  console.log(chalk.bold.cyan('\n🚀 Enhanced SEO & Permalinks Generator\n'));
  
  const config = parseArgs();
  const generator = new EnhancedSEOGenerator(config);
  
  try {
    await generator.run();
    console.log(chalk.green('\n✨ SEO enhancement completed!\n'));
  } catch (error) {
    console.error(chalk.red('\n❌ Enhancement failed:'), error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { EnhancedSEOGenerator };