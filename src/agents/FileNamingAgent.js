import OpenAI from 'openai';
import path from 'path';
import fs from 'fs-extra';
import { config } from '../config/index.js';

/**
 * FileNamingAgent - Generates normalized, SEO-friendly filenames from product descriptions
 * This agent creates consistent, readable filenames suitable for e-commerce and inventory management.
 */
export class FileNamingAgent {
  constructor() {
    // Create standalone OpenAI client for filename generation
    this.openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
    });

    // Configuration
    this.enableDryRun = config.app.enableDryRun;
    this.maxFilenameLength = 100; // Reasonable filename length limit
  }

  /**
   * Get system instructions for the file naming agent
   * @returns {string} System prompt for the agent
   */
  getSystemInstructions() {
    return `You are a professional file naming specialist for e-commerce inventory management.

Your task is to generate clean, consistent, SEO-friendly filenames from product descriptions.

FILENAME RULES:
1. Use only lowercase letters, numbers, and hyphens
2. Replace spaces with hyphens
3. Remove special characters (!@#$%^&*()[]{}+=;:'"<>?/)
4. Keep length under ${this.maxFilenameLength} characters
5. Start with the main product category or type
6. Include key descriptive words (material, color, size, brand)
7. End with distinguishing features if needed
8. Use singular form (bracelet not bracelets)
9. Avoid redundant words (the, a, an, of, for, with)

EXAMPLES:
Input: "Elegant Silver Amethyst Crystal Butterfly Bracelet"
Output: "silver-amethyst-butterfly-bracelet"

Input: "Comprehensive First Aid Kit with Organizer Box"
Output: "first-aid-kit-organizer-box"

Input: "Glass Jar Candle Holder with Metal Lid"
Output: "glass-jar-candle-holder-metal-lid"

PRIORITY ORDER:
1. Product type/category (bracelet, candle-holder, first-aid-kit)
2. Material (silver, glass, metal, wood)
3. Color/finish (black, white, gold, rustic)
4. Key features (butterfly, organizer, lid)
5. Brand/style (if prominent)

Output ONLY the filename without extension - the system will add the appropriate image extension.`;
  }

  /**
   * Generate a normalized filename from a product description
   * @param {Object} productData - Product analysis result with name, category, description, tags
   * @param {string} originalFilename - Original filename for extension reference
   * @returns {Promise<string>} Normalized filename with original extension
   */
  async generateFilename(productData, originalFilename) {
    if (this.enableDryRun) {
      console.log(`[DRY RUN] Would generate filename for: ${productData.productName}`);
      return this.getMockFilename(productData, originalFilename);
    }

    try {
      const { productName, category, description, tags = [] } = productData;
      
      // Prepare context for the AI
      const context = {
        productName,
        category,
        description: description?.substring(0, 200), // Limit description length
        tags: tags.slice(0, 8).join(', ') // Top 8 tags
      };

const prompt = `Generate a normalized filename for this product:

Product Name: ${context.productName}
Category: ${context.category}
Description: ${context.description}
Tags: ${context.tags}

Return only the filename (without extension).`;

const result = await this.openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: this.getSystemInstructions() },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 50
      });
      const rawResponse = result.choices[0]?.message?.content.trim();
      const generatedName = this.sanitizeFilename(rawResponse);
      
      // Get original extension and apply it
      const originalExt = path.extname(originalFilename).toLowerCase();
      const finalFilename = `${generatedName}${originalExt}`;
      
      console.log(`📝 Generated filename: ${path.basename(originalFilename)} → ${finalFilename}`);
      
      return finalFilename;
      
    } catch (error) {
      console.warn(`⚠ Failed to generate filename for ${productData.productName}: ${error.message}`);
      return this.getFallbackFilename(productData, originalFilename);
    }
  }

  /**
   * Generate filenames for multiple products
   * @param {Object[]} analysisResults - Array of product analysis results
   * @returns {Promise<Object[]>} Array of results with original and new filenames
   */
  async generateFilenames(analysisResults) {
    const results = [];
    const errors = [];
    
    console.log(`Starting filename generation for ${analysisResults.length} products...`);
    
    // Process with concurrency limit
    const concurrencyLimit = 5; // Conservative limit for filename generation
    for (let i = 0; i < analysisResults.length; i += concurrencyLimit) {
      const batch = analysisResults.slice(i, i + concurrencyLimit);
      
      const batchPromises = batch.map(async (product) => {
        try {
          const originalPath = product.metadata?.imagePath || 'unknown.jpg';
          const originalFilename = path.basename(originalPath);
          const newFilename = await this.generateFilename(product, originalFilename);
          
          return {
            success: true,
            originalPath,
            originalFilename,
            newFilename,
            productName: product.productName,
            category: product.category
          };
        } catch (error) {
          return {
            success: false,
            originalPath: product.metadata?.imagePath || 'unknown',
            error: error.message,
            productName: product.productName
          };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.push(result.value);
          } else {
            errors.push(result.value);
          }
        } else {
          errors.push({ 
            success: false, 
            error: result.reason.message,
            originalPath: 'unknown'
          });
        }
      }
    }
    
    if (errors.length > 0) {
      console.warn(`⚠ ${errors.length} filenames failed to generate:`);
      errors.forEach(error => {
        console.warn(`  - ${error.productName || error.originalPath}: ${error.error}`);
      });
    }
    
    console.log(`✓ Generated ${results.length} normalized filenames`);
    
    return { results, errors };
  }

  /**
   * Apply filename renaming to actual files (with backup)
   * @param {Object[]} renamingResults - Results from generateFilenames
   * @param {string} sourceDir - Directory containing the images
   * @param {boolean} createBackup - Whether to create backup of original files
   * @returns {Promise<Object>} Renaming operation results
   */
  async applyRenaming(renamingResults, sourceDir, createBackup = true) {
    if (this.enableDryRun) {
      console.log(`[DRY RUN] Would rename ${renamingResults.length} files in ${sourceDir}`);
      return { renamed: 0, errors: [], backupPath: null };
    }

    const renamed = [];
    const errors = [];
    let backupPath = null;

    if (createBackup) {
      // Create backup directory
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = path.join(sourceDir, `backup-${timestamp}`);
      await fs.ensureDir(backupPath);
      console.log(`📦 Created backup directory: ${backupPath}`);
    }

    for (const item of renamingResults) {
      try {
        const oldPath = path.resolve(item.originalPath);
        const newPath = path.join(path.dirname(oldPath), item.newFilename);
        
        // Check if source file exists
        if (!await fs.pathExists(oldPath)) {
          errors.push({
            originalPath: item.originalPath,
            error: 'Source file not found'
          });
          continue;
        }
        
        // Check if target filename already exists
        if (await fs.pathExists(newPath) && newPath !== oldPath) {
          errors.push({
            originalPath: item.originalPath,
            newFilename: item.newFilename,
            error: 'Target filename already exists'
          });
          continue;
        }
        
        // Create backup if requested
        if (createBackup && backupPath) {
          const backupFilePath = path.join(backupPath, item.originalFilename);
          await fs.copy(oldPath, backupFilePath);
        }
        
        // Rename the file
        if (newPath !== oldPath) {
          await fs.rename(oldPath, newPath);
          renamed.push({
            oldPath,
            newPath,
            oldFilename: item.originalFilename,
            newFilename: item.newFilename
          });
          console.log(`✓ Renamed: ${item.originalFilename} → ${item.newFilename}`);
        }
        
      } catch (error) {
        errors.push({
          originalPath: item.originalPath,
          newFilename: item.newFilename,
          error: error.message
        });
      }
    }
    
    console.log('\n📊 Renaming Summary:');
    console.log(`  ✓ Successfully renamed: ${renamed.length} files`);
    console.log(`  ❌ Errors: ${errors.length} files`);
    if (backupPath) {
      console.log(`  📦 Backups saved to: ${backupPath}`);
    }
    
    return { renamed, errors, backupPath };
  }

  /**
   * Sanitize and validate generated filename
   * @param {string} filename - Raw filename from AI
   * @returns {string} Clean, valid filename
   */
  sanitizeFilename(filename) {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .substring(0, this.maxFilenameLength) // Limit length
      .replace(/-$/, ''); // Remove trailing hyphen if created by truncation
  }

  /**
   * Generate fallback filename when AI generation fails
   * @param {Object} productData - Product data
   * @param {string} originalFilename - Original filename
   * @returns {string} Fallback filename
   */
  getFallbackFilename(productData, originalFilename) {
    const { productName, category } = productData;
    const ext = path.extname(originalFilename);
    
    // Create simple fallback based on product name and category
    const fallbackName = `${category || 'product'}-${productName || 'unknown'}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
    
    return `${fallbackName}${ext}`;
  }

  /**
   * Generate mock filename for dry run mode
   * @param {Object} productData - Product data
   * @param {string} originalFilename - Original filename
   * @returns {string} Mock filename for testing
   */
  getMockFilename(productData, originalFilename) {
    const ext = path.extname(originalFilename);
    const mockName = this.sanitizeFilename(`${productData.category}-${productData.productName}`);
    return `${mockName}${ext}`;
  }
}

export default FileNamingAgent;
