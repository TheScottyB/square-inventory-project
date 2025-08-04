#!/usr/bin/env node

/**
 * Unified Inventory Pipeline
 * 
 * Complete end-to-end inventory processing pipeline that:
 * 1. Identifies well-formatted example listings
 * 2. Uses examples to train AI agents
 * 3. Processes catalog items in batches
 * 4. Applies consistent formatting across all items
 * 
 * Usage:
 *   pnpm run pipeline:test --category="Energy & Elements" --limit=10
 *   pnpm run pipeline:test --all --limit=50
 *   pnpm run pipeline:full --category="Energy & Elements"
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { parse } from 'csv-parse/sync';
import xlsx from 'xlsx';
import ora from 'ora';
import chalk from 'chalk';

// Import existing agents
import { SquareCatalogAgent } from '../../src/agents/SquareCatalogAgent.js';
import { CorrectSKUAgent } from '../../src/agents/CorrectSKUAgent.js';
import { CorrectCategorizationAgent } from '../../src/agents/CorrectCategorizationAgent.js';
import { ImageAnalysisAgent } from '../../src/agents/ImageAnalysisAgent.js';
// import { SEOResearchAgent } from '../../src/agents/storytelling/SEOResearchAgent.js';
// import { SEOContentAgent } from '../../src/agents/seo/SEOContentAgent.js';
// import { PermalinkAgent } from '../../src/agents/seo/PermalinkAgent.js';
import { logger } from '../../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

class UnifiedInventoryPipeline {
  constructor(config = {}) {
    this.config = {
      dryRun: config.dryRun ?? true,
      category: config.category,
      limit: config.limit ?? 10,
      exampleCount: config.exampleCount ?? 3,
      catalogPath: config.catalogPath,
      ...config
    };
    
    // Initialize agents
    this.agents = {
      sku: new CorrectSKUAgent(),
      categorization: new CorrectCategorizationAgent(),
      imageAnalysis: new ImageAnalysisAgent()
      // seoResearch: new SEOResearchAgent(),
      // seoContent: new SEOContentAgent(),
      // permalink: new PermalinkAgent()
    };
    
    this.examples = [];
    this.catalogData = [];
  }

  /**
   * Main pipeline execution
   */
  async run() {
    const spinner = ora('Starting Unified Inventory Pipeline').start();
    
    try {
      // Step 1: Load catalog data
      spinner.text = 'Loading catalog data...';
      await this.loadCatalogData();
      spinner.succeed(`Loaded ${this.catalogData.length} items from catalog`);
      
      // Step 2: Find example listings
      spinner.start('Finding well-formatted example listings...');
      await this.findExampleListings();
      spinner.succeed(`Found ${this.examples.length} example listings`);
      
      // Step 3: Initialize AI agents with examples
      spinner.start('Initializing AI agents with examples...');
      await this.initializeAIAgents();
      spinner.succeed('AI agents initialized with example context');
      
      // Step 4: Select items to process
      spinner.start('Selecting items to process...');
      const itemsToProcess = await this.selectItemsToProcess();
      spinner.succeed(`Selected ${itemsToProcess.length} items to process`);
      
      // Step 5: Process items through pipeline
      console.log(chalk.cyan(`\n📋 Processing ${itemsToProcess.length} items through pipeline...\n`));
      const results = await this.processItems(itemsToProcess);
      
      // Step 6: Generate report
      await this.generateReport(results);
      
      spinner.succeed('Pipeline completed successfully!');
      
    } catch (error) {
      spinner.fail('Pipeline failed');
      logger.error('Pipeline error:', error);
      throw error;
    }
  }

  /**
   * Load catalog data from Square export
   */
  async loadCatalogData() {
    // Try to find the most recent catalog export
    if (!this.config.catalogPath) {
      const exportsDir = join(projectRoot, 'exports');
      const files = await fs.readdir(exportsDir);
      
      // Prefer filtered catalogs over raw exports
      let catalogFiles = files
        .filter(f => f.includes('catalog-filtered') && f.endsWith('.xlsx'))
        .sort()
        .reverse();
      
      // Fallback to regular catalog files if no filtered ones exist
      if (catalogFiles.length === 0) {
        catalogFiles = files
          .filter(f => f.includes('catalog') && f.endsWith('.xlsx'))
          .sort()
          .reverse();
      }
      
      if (catalogFiles.length === 0) {
        throw new Error('No catalog files found in exports directory');
      }
      
      this.config.catalogPath = join(exportsDir, catalogFiles[0]);
      logger.info('Using catalog file:', this.config.catalogPath);
    }
    
    // Read the Excel file
    const workbook = xlsx.readFile(this.config.catalogPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    this.catalogData = xlsx.utils.sheet_to_json(worksheet, { 
      header: 1,
      defval: '',
      blankrows: false 
    });
    
    // Extract headers
    this.headers = this.catalogData[0];
    this.catalogData = this.catalogData.slice(1); // Remove header row
  }

  /**
   * Find well-formatted example listings
   */
  async findExampleListings() {
    // Criteria for good examples:
    // 1. Has complete description (>200 characters)
    // 2. Has SEO title
    // 3. Has proper categorization
    // 4. Has images
    
    const candidates = [];
    
    for (const row of this.catalogData) {
      const item = this.rowToObject(row);
      
      // Skip if missing critical fields
      if (!item['Item Name'] || !item['Description']) continue;
      
      // Calculate quality score
      const qualityScore = this.calculateQualityScore(item);
      
      if (qualityScore > 0.8) {
        candidates.push({
          item,
          score: qualityScore
        });
      }
    }
    
    // Sort by quality score and take top examples
    candidates.sort((a, b) => b.score - a.score);
    this.examples = candidates.slice(0, this.config.exampleCount).map(c => c.item);
    
    // Log examples found
    console.log(chalk.green('\n✨ Example listings found:'));
    for (const example of this.examples) {
      console.log(chalk.gray(`  - ${example['Item Name']} (${example['Categories']})`));
    }
  }

  /**
   * Calculate quality score for an item
   */
  calculateQualityScore(item) {
    let score = 0;
    let factors = 0;
    
    // Description quality (40%)
    if (item['Description']) {
      const descLength = item['Description'].length;
      if (descLength > 500) score += 0.4;
      else if (descLength > 200) score += 0.3;
      else if (descLength > 100) score += 0.2;
      factors += 0.4;
    }
    
    // SEO fields (30%)
    if (item['SEO Title']) {
      score += 0.15;
      factors += 0.15;
    }
    if (item['SEO Description']) {
      score += 0.15;
      factors += 0.15;
    }
    
    // Categorization (20%)
    if (item['Categories'] && !item['Categories'].includes('Uncategorized')) {
      score += 0.2;
      factors += 0.2;
    }
    
    // Has images (10%)
    if (item['Current Image Url']) {
      score += 0.1;
      factors += 0.1;
    }
    
    return factors > 0 ? score / factors : 0;
  }

  /**
   * Initialize AI agents with example context
   */
  async initializeAIAgents() {
    // Create example context for agents
    const exampleContext = {
      businessType: 'metaphysical/spiritual retail store',
      toneGuidelines: this.extractToneFromExamples(),
      formattingPatterns: this.extractFormattingPatterns(),
      examples: this.examples.map(ex => ({
        name: ex['Item Name'],
        description: ex['Description'],
        seoTitle: ex['SEO Title'],
        seoDescription: ex['SEO Description'],
        category: ex['Categories']
      }))
    };
    
    // Store context for use during processing
    this.exampleContext = exampleContext;
    
    // Agents are already initialized, we'll use the context during processing
    logger.info('Example context prepared for AI processing');
  }

  /**
   * Extract tone guidelines from examples
   */
  extractToneFromExamples() {
    const patterns = {
      mystical: 0,
      professional: 0,
      educational: 0,
      inspirational: 0
    };
    
    for (const example of this.examples) {
      const desc = example['Description'] || '';
      
      // Check for tone indicators
      if (desc.match(/energy|spiritual|mystical|sacred/i)) patterns.mystical++;
      if (desc.match(/quality|professional|crafted|designed/i)) patterns.professional++;
      if (desc.match(/helps?|benefits?|promotes?|supports?/i)) patterns.educational++;
      if (desc.match(/transform|journey|discover|awaken/i)) patterns.inspirational++;
    }
    
    return patterns;
  }

  /**
   * Extract formatting patterns
   */
  extractFormattingPatterns() {
    const patterns = {
      descriptionStructure: [],
      commonPhrases: [],
      bulletPoints: false,
      htmlFormatting: false
    };
    
    for (const example of this.examples) {
      const desc = example['Description'] || '';
      
      // Check for structure
      if (desc.includes('•') || desc.includes('●')) patterns.bulletPoints = true;
      if (desc.includes('<') && desc.includes('>')) patterns.htmlFormatting = true;
      
      // Extract opening patterns
      const firstSentence = desc.split(/[.!?]/)[0];
      if (firstSentence) patterns.descriptionStructure.push(firstSentence);
    }
    
    return patterns;
  }

  /**
   * Determine narrative frameworks based on examples
   */
  determineNarrativeFrameworks() {
    // Analyze examples to determine which frameworks to use
    const frameworks = [];
    
    const hasSpiritual = this.examples.some(ex => 
      (ex['Description'] || '').match(/spiritual|sacred|divine/i)
    );
    const hasWellness = this.examples.some(ex => 
      (ex['Description'] || '').match(/healing|wellness|therapeutic/i)
    );
    const hasArtisan = this.examples.some(ex => 
      (ex['Description'] || '').match(/handmade|crafted|artisan/i)
    );
    
    if (hasSpiritual) frameworks.push('Mystical/Spiritual');
    if (hasWellness) frameworks.push('Transformation/Journey');
    if (hasArtisan) frameworks.push('Artisan/Craft');
    
    // Default frameworks if none detected
    if (frameworks.length === 0) {
      frameworks.push('Discovery/Adventure', 'Heritage/Legacy');
    }
    
    return frameworks;
  }

  /**
   * Select items to process based on criteria
   */
  async selectItemsToProcess() {
    let items = [];
    
    // Filter by category if specified
    if (this.config.category) {
      items = this.catalogData.filter(row => {
        const item = this.rowToObject(row);
        return item['Categories'] && item['Categories'].includes(this.config.category);
      });
    } else {
      items = [...this.catalogData];
    }
    
    // Prioritize items needing enhancement
    items.sort((a, b) => {
      const itemA = this.rowToObject(a);
      const itemB = this.rowToObject(b);
      
      // Prioritize items with missing descriptions
      const scoreA = this.calculateQualityScore(itemA);
      const scoreB = this.calculateQualityScore(itemB);
      
      return scoreA - scoreB; // Lower scores first (need more work)
    });
    
    // Apply limit
    if (this.config.limit) {
      items = items.slice(0, this.config.limit);
    }
    
    return items;
  }

  /**
   * Process items through the pipeline
   */
  async processItems(items) {
    const results = [];
    
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const item = this.rowToObject(row);
      
      console.log(chalk.blue(`\n[${i + 1}/${items.length}] Processing: ${item['Item Name']}`));
      
      try {
        const result = await this.processItem(item, row);
        results.push(result);
        
        // Add delay to respect API rate limits
        if (i < items.length - 1) {
          await this.delay(1000); // 1 second delay between items
        }
      } catch (error) {
        logger.error(`Failed to process ${item['Item Name']}:`, error);
        results.push({
          item,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Process a single item through all pipeline stages
   */
  async processItem(item, row) {
    const result = {
      item,
      original: { ...item },
      enhanced: {},
      changes: [],
      status: 'processing'
    };
    
    try {
      // Stage 1: SKU Generation
      if (!item['SKU'] || item['SKU'].length < 3) {
        console.log(chalk.gray('  → Generating SKU...'));
        try {
          // Create a mini catalog with header row
          const headerRow = this.headers;
          const miniCatalog = [headerRow, row]; // Include header for proper column mapping
          const skuResults = await this.agents.sku.generateCorrectSKUs(miniCatalog);
          
          if (skuResults.success && skuResults.catalogData && skuResults.catalogData.length > 1) {
            // Get the SKU from the processed row (index 1, after header)
            const processedRow = skuResults.catalogData[1];
            const skuColumnIndex = this.headers.indexOf('SKU');
            
            if (skuColumnIndex !== -1 && processedRow[skuColumnIndex]) {
              const newSKU = processedRow[skuColumnIndex];
              // Only use if actually changed
              if (newSKU !== item['SKU']) {
                result.enhanced.sku = newSKU;
                result.changes.push('Generated SKU');
                console.log(chalk.gray(`    ✓ Generated: ${newSKU}`));
              }
            }
          }
        } catch (error) {
          logger.warn('SKU generation failed:', error.message);
        }
      }
      
      // Stage 2: Categorization
      if (!item['Categories'] || item['Categories'] === 'Uncategorized') {
        console.log(chalk.gray('  → Determining category...'));
        try {
          // Create a mini catalog with header row
          const headerRow = this.headers;
          const miniCatalog = [headerRow, row]; // Include header for proper column mapping
          const catResults = await this.agents.categorization.processCorrectCategorization(miniCatalog);
          
          if (catResults.success && catResults.catalogData && catResults.catalogData.length > 1) {
            // Get the category from the processed row (index 1, after header)
            const processedRow = catResults.catalogData[1];
            const catColumnIndex = this.headers.indexOf('Categories');
            
            if (catColumnIndex !== -1 && processedRow[catColumnIndex]) {
              const newCategory = processedRow[catColumnIndex];
              // Only use if actually changed
              if (newCategory !== item['Categories']) {
                result.enhanced.category = newCategory;
                result.changes.push('Applied category');
                console.log(chalk.gray(`    ✓ Categorized: ${newCategory}`));
              }
            }
          }
        } catch (error) {
          logger.warn('Categorization failed:', error.message);
        }
      }
      
      // Stage 3: Image Analysis (if image available)
      let imageAnalysis = null;
      if (item['Current Image Url']) {
        console.log(chalk.gray('  → Analyzing product image...'));
        try {
          imageAnalysis = await this.agents.imageAnalysis.analyzeImage(item['Current Image Url'], {
            context: this.exampleContext,
            itemName: item['Item Name'],
            category: item['Categories']
          });
          result.enhanced.imageAnalysis = imageAnalysis;
        } catch (error) {
          logger.warn('Image analysis failed:', error.message);
        }
      }
      
      // Stage 4: Enhanced Description Generation
      if (!item['Description'] || item['Description'].length < 100) {
        console.log(chalk.gray('  → Generating enhanced description...'));
        const enhancedDescription = await this.generateEnhancedDescription(
          item,
          imageAnalysis,
          null, // seoResearch disabled for now
          this.exampleContext
        );
        
        if (enhancedDescription) {
          result.enhanced.description = enhancedDescription.description;
          result.enhanced.seoTitle = enhancedDescription.seoTitle;
          result.enhanced.seoDescription = enhancedDescription.seoDescription;
          result.changes.push('Generated enhanced content');
        }
      }
      
      // Stage 5: Quality Check
      const qualityScore = this.calculateQualityScore({
        ...item,
        ...result.enhanced
      });
      
      result.qualityScore = {
        before: this.calculateQualityScore(item),
        after: qualityScore,
        improvement: qualityScore - this.calculateQualityScore(item)
      };
      
      result.status = 'completed';
      console.log(chalk.green(`  ✓ Completed (Quality: ${(qualityScore * 100).toFixed(0)}%)`));
      
    } catch (error) {
      result.status = 'failed';
      result.error = error.message;
      console.log(chalk.red(`  ✗ Failed: ${error.message}`));
    }
    
    return result;
  }

  /**
   * Generate pipeline report
   */
  async generateReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      configuration: this.config,
      examples: this.examples.map(ex => ({
        name: ex['Item Name'],
        category: ex['Categories']
      })),
      summary: {
        total: results.length,
        completed: results.filter(r => r.status === 'completed').length,
        failed: results.filter(r => r.status === 'failed').length,
        averageQualityImprovement: 0
      },
      results: results.map(r => ({
        itemName: r.item['Item Name'],
        sku: r.enhanced.sku || r.item['SKU'],
        category: r.enhanced.category || r.item['Categories'],
        status: r.status,
        changes: r.changes,
        qualityScore: r.qualityScore,
        error: r.error
      }))
    };
    
    // Calculate average quality improvement
    const improvements = results
      .filter(r => r.qualityScore)
      .map(r => r.qualityScore.improvement);
    
    if (improvements.length > 0) {
      report.summary.averageQualityImprovement = 
        improvements.reduce((a, b) => a + b, 0) / improvements.length;
    }
    
    // Save report
    const reportPath = join(
      projectRoot, 
      'reports', 
      `pipeline-test-${Date.now()}.json`
    );
    
    await fs.mkdir(join(projectRoot, 'reports'), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    // Display summary
    console.log(chalk.cyan('\n📊 Pipeline Summary:'));
    console.log(chalk.white(`  Total items: ${report.summary.total}`));
    console.log(chalk.green(`  Completed: ${report.summary.completed}`));
    console.log(chalk.red(`  Failed: ${report.summary.failed}`));
    console.log(chalk.yellow(`  Avg quality improvement: ${(report.summary.averageQualityImprovement * 100).toFixed(1)}%`));
    console.log(chalk.gray(`\n  Report saved to: ${reportPath}`));
    
    // Save enhanced catalog if not dry run
    if (!this.config.dryRun && report.summary.completed > 0) {
      await this.saveEnhancedCatalog(results);
    }
  }

  /**
   * Save enhanced catalog
   */
  async saveEnhancedCatalog(results) {
    // Create a copy of the original catalog data
    const enhancedData = this.catalogData.map(row => [...row]);
    
    // Apply enhancements
    for (const result of results) {
      if (result.status !== 'completed') continue;
      
      // Find the row index
      const rowIndex = this.catalogData.findIndex(row => {
        const item = this.rowToObject(row);
        return item['Item Name'] === result.item['Item Name'];
      });
      
      if (rowIndex === -1) continue;
      
      // Update the row with enhanced data
      const row = enhancedData[rowIndex];
      
      if (result.enhanced.sku) {
        const skuIndex = this.headers.indexOf('SKU');
        if (skuIndex !== -1) row[skuIndex] = result.enhanced.sku;
      }
      
      if (result.enhanced.category) {
        const catIndex = this.headers.indexOf('Categories');
        if (catIndex !== -1) row[catIndex] = result.enhanced.category;
      }
      
      if (result.enhanced.description) {
        const descIndex = this.headers.indexOf('Description');
        if (descIndex !== -1) row[descIndex] = result.enhanced.description;
      }
      
      if (result.enhanced.seoTitle) {
        const seoTitleIndex = this.headers.indexOf('SEO Title');
        if (seoTitleIndex !== -1) row[seoTitleIndex] = result.enhanced.seoTitle;
      }
      
      if (result.enhanced.seoDescription) {
        const seoDescIndex = this.headers.indexOf('SEO Description');
        if (seoDescIndex !== -1) row[seoDescIndex] = result.enhanced.seoDescription;
      }
    }
    
    // Save as new Excel file
    const outputPath = join(
      projectRoot,
      'exports',
      'enhanced',
      `pipeline-enhanced-${Date.now()}.xlsx`
    );
    
    await fs.mkdir(join(projectRoot, 'exports', 'enhanced'), { recursive: true });
    
    // Create workbook
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([this.headers, ...enhancedData]);
    xlsx.utils.book_append_sheet(wb, ws, 'Enhanced Catalog');
    
    // Write file
    xlsx.writeFile(wb, outputPath);
    
    console.log(chalk.green(`\n✅ Enhanced catalog saved to: ${outputPath}`));
  }

  /**
   * Convert row array to object
   */
  rowToObject(row) {
    const obj = {};
    this.headers.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    return obj;
  }

  /**
   * Generate enhanced description using OpenAI
   */
  async generateEnhancedDescription(item, imageAnalysis, seoResearch, exampleContext) {
    try {
      // Import OpenAI here to avoid dependency issues
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Build prompt with examples
      let prompt = `Create an enhanced product description for a ${exampleContext.businessType}.

Product: ${item['Item Name']}
Category: ${item['Categories'] || 'Uncategorized'}
Current Description: ${item['Description'] || 'None'}
`;

      if (imageAnalysis) {
        prompt += `\nImage Analysis: ${JSON.stringify(imageAnalysis, null, 2)}`;
      }
      
      if (seoResearch) {
        prompt += `\nSEO Research: ${JSON.stringify(seoResearch, null, 2)}`;
      }
      
      if (exampleContext.examples && exampleContext.examples.length > 0) {
        prompt += `\n\nExample descriptions from this store:\n`;
        for (const example of exampleContext.examples.slice(0, 2)) {
          prompt += `\n"${example.name}": ${example.description}\n`;
        }
      }
      
      prompt += `\nPlease create:
1. An engaging product description (200-400 words)
2. An SEO-optimized title
3. A compelling SEO description

Keep the tone consistent with the examples and focus on the spiritual/metaphysical aspects.
Format as JSON: {"description": "...", "seoTitle": "...", "seoDescription": "..."}`;
      
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert copywriter for a metaphysical and spiritual retail store. Create authentic, engaging product descriptions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      });
      
      const content = response.choices[0].message.content;
      
      // Try to parse JSON response
      try {
        return JSON.parse(content);
      } catch {
        // Fallback if not JSON
        return {
          description: content,
          seoTitle: `${item['Item Name']} - Spiritual & Metaphysical`,
          seoDescription: content.substring(0, 160)
        };
      }
      
    } catch (error) {
      logger.error('Enhanced description generation failed:', error);
      return null;
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    dryRun: !args.includes('--execute'),
    category: null,
    limit: 10,
    catalogPath: null
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) {
      config.category = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      config.limit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--catalog' && args[i + 1]) {
      config.catalogPath = args[i + 1];
      i++;
    } else if (args[i] === '--all') {
      config.limit = null;
    }
  }
  
  return config;
}

// Main execution
async function main() {
  console.log(chalk.bold.cyan('\n🚀 Unified Inventory Pipeline\n'));
  
  const config = parseArgs();
  
  if (config.dryRun) {
    console.log(chalk.yellow('⚠️  Running in DRY RUN mode - no changes will be saved'));
    console.log(chalk.gray('   Add --execute flag to save changes\n'));
  }
  
  const pipeline = new UnifiedInventoryPipeline(config);
  
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

export { UnifiedInventoryPipeline };