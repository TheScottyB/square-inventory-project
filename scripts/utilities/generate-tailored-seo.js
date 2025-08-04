#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import OpenAI from 'openai';
import { EventEmitter } from 'events';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class TailoredSEOGenerator extends EventEmitter {
  constructor() {
    super();
    
    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('\n❌ OPENAI_API_KEY not found!');
      console.log('\nPlease add your OpenAI API key to the .env file:');
      console.log('OPENAI_API_KEY=your-api-key-here\n');
      process.exit(1);
    }
    
    // Initialize OpenAI
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.stats = {
      total: 0,
      processed: 0,
      enhanced: 0,
      skipped: 0,
      errors: 0
    };
  }

  async generateTailoredSEO() {
    console.log('🚀 Starting Tailored SEO Generation for ALL Products\n');
    
    try {
      // Load the merged catalog
      const catalogPath = path.join(__dirname, '../../organized-inventory/00-active-working/MERGED_COMPREHENSIVE_CATALOG_2025-08-03.xlsx');
      const workbook = xlsx.readFile(catalogPath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(worksheet);
      
      this.stats.total = data.length;
      console.log(`📊 Found ${this.stats.total} products to process\n`);
      
      // Process in batches to avoid rate limits
      const batchSize = 10;
      const results = [];
      
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, Math.min(i + batchSize, data.length));
        console.log(`\n🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(data.length/batchSize)}`);
        
        const batchResults = await Promise.all(
          batch.map(async (product) => {
            try {
              const enhanced = await this.generateProductSEO(product);
              this.stats.processed++;
              if (enhanced._seoGenerated) {
                this.stats.enhanced++;
                console.log(`  ✅ ${product['Item Name']}`);
              } else {
                this.stats.skipped++;
                console.log(`  ⏭️  ${product['Item Name']} (already has SEO)`);
              }
              return enhanced;
            } catch (error) {
              this.stats.errors++;
              console.error(`  ❌ Error with ${product['Item Name']}: ${error.message}`);
              return { ...product, _seoError: error.message };
            }
          })
        );
        
        results.push(...batchResults);
        
        // Add delay between batches to respect rate limits
        if (i + batchSize < data.length) {
          console.log('  ⏳ Waiting 2 seconds before next batch...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Save enhanced catalog
      const outputPath = path.join(__dirname, `../../organized-inventory/00-active-working/CATALOG_WITH_TAILORED_SEO_${new Date().toISOString().split('T')[0]}.xlsx`);
      const newWorkbook = xlsx.utils.book_new();
      const newWorksheet = xlsx.utils.json_to_sheet(results);
      xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, 'Products');
      xlsx.writeFile(newWorkbook, outputPath);
      
      console.log('\n' + '='.repeat(80));
      console.log('✨ TAILORED SEO GENERATION COMPLETE!');
      console.log('='.repeat(80));
      console.log(`Total products: ${this.stats.total}`);
      console.log(`Enhanced with SEO: ${this.stats.enhanced}`);
      console.log(`Skipped (already had SEO): ${this.stats.skipped}`);
      console.log(`Errors: ${this.stats.errors}`);
      console.log(`\nOutput saved to: ${path.basename(outputPath)}`);
      
    } catch (error) {
      console.error('Fatal error:', error);
      process.exit(1);
    }
  }

  async generateProductSEO(product) {
    // Skip if already has complete SEO
    if (product['SEO Title'] && product['SEO Description']) {
      return { ...product, _seoGenerated: false };
    }
    
    // Build context-aware prompt
    const prompt = this.buildTailoredPrompt(product);
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert ecommerce SEO specialist. Create unique, compelling SEO content that:
- Captures the specific essence and unique value of each product
- Uses natural, search-friendly language
- Avoids generic templates or filler words
- Focuses on what makes THIS specific product special
- Incorporates relevant keywords naturally
- Speaks to the target customer's needs and desires

Always return valid JSON with the exact structure requested.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });
      
      const seoData = JSON.parse(completion.choices[0].message.content);
      
      return {
        ...product,
        'SEO Title': seoData.seoTitle || product['SEO Title'],
        'SEO Description': seoData.seoDescription || product['SEO Description'],
        '_seoKeywords': seoData.keywords?.join(', ') || '',
        '_seoFocus': seoData.focus || '',
        '_seoGenerated': true,
        '_seoGeneratedAt': new Date().toISOString()
      };
      
    } catch (error) {
      throw new Error(`SEO generation failed: ${error.message}`);
    }
  }

  buildTailoredPrompt(product) {
    const name = product['Item Name'] || 'Unknown Product';
    const description = product['Description'] || '';
    const category = product['Categories'] || '';
    const price = product['Price'] || '';
    
    // Extract key product characteristics
    const hasSpiritual = /chakra|crystal|selenite|sage|tarot|oracle|metaphysical|spiritual/i.test(name + description);
    const hasArt = /sculpture|art|handmade|crafted|artisan/i.test(name + description);
    const hasCollectible = /vintage|rare|sealed|collectible|limited/i.test(name + description);
    const hasBeauty = /serum|cream|oil|beauty|skin|hair|cosmetic/i.test(name + description);
    
    return `Generate tailored SEO content for this specific product:

PRODUCT DETAILS:
Name: ${name}
Price: ${price ? `$${price}` : 'Price not set'}
Category: ${category}
Current Description: ${description.substring(0, 500)}${description.length > 500 ? '...' : ''}

PRODUCT CHARACTERISTICS:
${hasSpiritual ? '- Spiritual/Metaphysical item\n' : ''}${hasArt ? '- Artistic/Handcrafted piece\n' : ''}${hasCollectible ? '- Collectible/Rare item\n' : ''}${hasBeauty ? '- Beauty/Personal care product\n' : ''}

REQUIREMENTS:
1. SEO Title (50-60 chars): Must be unique to THIS product, include key benefit/feature
2. SEO Description (150-160 chars): Compelling, specific to this item, action-oriented
3. Keywords: 5-8 highly relevant search terms specific to this product
4. Focus: Primary selling point or unique value proposition

Generate JSON response:
{
  "seoTitle": "Unique title specific to this product",
  "seoDescription": "Compelling description that captures this product's unique value",
  "keywords": ["specific", "relevant", "search", "terms", "for", "this", "product"],
  "focus": "What makes this product special"
}

Remember: Each product needs its own unique SEO - no templates or generic content!`;
  }
}

// Run the generator
const generator = new TailoredSEOGenerator();
generator.generateTailoredSEO().catch(console.error);
