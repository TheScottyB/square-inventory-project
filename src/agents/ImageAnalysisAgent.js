import { Agent, OpenAIChatCompletionsModel, system, user, run } from '@openai/agents';
import OpenAI from 'openai';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/index.js';

/**
 * ImageAnalysisAgent - Analyzes product images using OpenAI Agent SDK
 * This agent processes individual images and generates detailed descriptions
 * suitable for Square inventory management.
 */
export class ImageAnalysisAgent {
  constructor() {
    // Initialize the OpenAI model with configuration for vision capabilities
    this.model = new OpenAIChatCompletionsModel({
      model: 'gpt-4o', // Use GPT-4o for vision capabilities
      temperature: config.openai.temperature,
      maxTokens: config.openai.maxTokens,
      apiKey: config.openai.apiKey,
    });

    // Create standalone OpenAI client for vision analysis
    this.openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
    });

    // Create the agent with system instructions
    this.agent = new Agent({
      name: 'ImageAnalysisAgent',
      model: this.model,
      instructions: this.getSystemInstructions(),
    });

    // Configuration from central config
    this.maxDescriptionLength = config.agents.imageAnalysis.maxDescriptionLength;
    this.retryAttempts = config.agents.imageAnalysis.retryAttempts;
    this.retryDelayMs = config.agents.imageAnalysis.retryDelayMs;
    this.enableDryRun = config.app.enableDryRun;
  }

  /**
   * Get system instructions for the image analysis agent
   * @returns {string} System prompt for the agent
   */
  getSystemInstructions() {
    return system(`You are an expert product analyst specializing in inventory categorization for retail businesses.

Your task is to analyze product images and provide detailed, structured descriptions suitable for Square POS inventory management.

For each image, provide:
1. **Product Name**: A clear, searchable product title
2. **Category**: Primary product category (e.g., "Jewelry", "Candles", "First Aid", "Pet Products", etc.)
3. **Description**: Detailed description including:
   - Key features and characteristics
   - Materials, colors, and design elements
   - Size indicators (if visible)
   - Intended use or target audience
   - Any unique selling points
4. **Tags**: Comma-separated keywords for searchability
5. **Condition**: New, Used, or Unknown based on visual assessment

Guidelines:
- Keep descriptions under ${this.maxDescriptionLength} characters
- Focus on details that would help customers find and understand the product
- Use professional, clear language suitable for e-commerce
- If multiple similar items are in one image, describe the set/collection
- Be specific about materials, colors, and distinctive features

Output format must be valid JSON with the structure:
{
  "productName": "string",
  "category": "string", 
  "description": "string",
  "tags": ["string"],
  "condition": "string",
  "confidence": number // 0-1 score for analysis confidence
}`);
  }

  /**
   * Analyzes a single image file and returns structured product information
   * @param {string} imagePath - Full path to the image file
   * @param {string} [categoryHint] - Optional category hint from directory structure
   * @returns {Promise<Object>} Analysis results with product information
   */
  async analyzeImage(imagePath, categoryHint = null) {
    if (this.enableDryRun) {
      console.log(`[DRY RUN] Would analyze image: ${imagePath}`);
      return this.getMockAnalysisResult(imagePath, categoryHint);
    }

    let lastError = null;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        console.log(`Analyzing image: ${path.basename(imagePath)} (attempt ${attempt})`);
        
        // Read and encode the image
        const imageBuffer = await fs.readFile(imagePath);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = this.getMimeType(imagePath);
        
        // Create user message with image using direct message format for vision
        const visionMessage = {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this product image${categoryHint ? ` (category hint: ${categoryHint})` : ''}. Provide a detailed JSON analysis following the specified format.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        };

        // Use standalone OpenAI client for vision analysis
        const result = await this.openaiClient.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: this.getSystemInstructions().content
            },
            visionMessage
          ],
          temperature: config.openai.temperature,
          max_tokens: config.openai.maxTokens
        });
        
        // Extract and parse the response
        const response = result.choices[0]?.message?.content || '';
        const analysisResult = this.parseAgentResponse(response, imagePath, categoryHint);
        
        console.log(`✓ Successfully analyzed: ${path.basename(imagePath)}`);
        return analysisResult;
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠ Attempt ${attempt} failed for ${path.basename(imagePath)}: ${error.message}`);
        
        if (attempt < this.retryAttempts) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    throw new Error(`Failed to analyze image ${imagePath} after ${this.retryAttempts} attempts. Last error: ${lastError.message}`);
  }

  /**
   * Analyzes multiple images with controlled concurrency
   * @param {string[]} imagePaths - Array of image file paths
   * @param {Object} categoryHints - Map of image path to category hint
   * @returns {Promise<Object[]>} Array of analysis results
   */
  async analyzeImages(imagePaths, categoryHints = {}) {
    const results = [];
    const errors = [];
    
    console.log(`Starting analysis of ${imagePaths.length} images...`);
    
    // Process images with concurrency limit
    const concurrencyLimit = config.workflow.concurrencyLimit;
    for (let i = 0; i < imagePaths.length; i += concurrencyLimit) {
      const batch = imagePaths.slice(i, i + concurrencyLimit);
      
      const batchPromises = batch.map(async (imagePath) => {
        try {
          const categoryHint = categoryHints[imagePath];
          const analysis = await this.analyzeImage(imagePath, categoryHint);
          return { imagePath, analysis, success: true };
        } catch (error) {
          return { imagePath, error: error.message, success: false };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.push(result.value.analysis);
          } else {
            errors.push(result.value);
          }
        } else {
          errors.push({ imagePath: 'unknown', error: result.reason.message, success: false });
        }
      }
    }
    
    if (errors.length > 0) {
      console.warn(`⚠ ${errors.length} images failed to analyze:`);
      errors.forEach(error => console.warn(`  - ${error.imagePath}: ${error.error}`));
    }
    
    console.log(`✓ Successfully analyzed ${results.length} out of ${imagePaths.length} images`);
    return results;
  }

  /**
   * Parses the agent's JSON response and adds metadata
   * @param {string} response - Raw response from the agent
   * @param {string} imagePath - Original image path
   * @param {string} categoryHint - Category hint used
   * @returns {Object} Parsed and enriched analysis result
   */
  parseAgentResponse(response, imagePath, categoryHint) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Add metadata
      return {
        ...parsed,
        metadata: {
          imagePath,
          filename: path.basename(imagePath),
          categoryHint,
          analyzedAt: new Date().toISOString(),
          agentModel: config.openai.model,
        }
      };
      
    } catch (error) {
      console.warn(`Failed to parse JSON response for ${imagePath}: ${error.message}`);
      console.warn('Raw response:', response);
      
      // Return fallback result
      return this.getFallbackAnalysisResult(imagePath, categoryHint, response);
    }
  }

  /**
   * Creates a mock analysis result for dry-run mode
   * @param {string} imagePath - Image file path
   * @param {string} categoryHint - Category hint
   * @returns {Object} Mock analysis result
   */
  getMockAnalysisResult(imagePath, categoryHint) {
    const filename = path.basename(imagePath, path.extname(imagePath));
    
    return {
      productName: `Sample Product - ${filename}`,
      category: categoryHint || 'Miscellaneous',
      description: `[DRY RUN] Mock analysis for ${filename}. This would contain detailed product description based on image analysis.`,
      tags: ['sample', 'dry-run', categoryHint].filter(Boolean),
      condition: 'Unknown',
      confidence: 0.95,
      metadata: {
        imagePath,
        filename: path.basename(imagePath),
        categoryHint,
        analyzedAt: new Date().toISOString(),
        agentModel: 'dry-run-mock',
      }
    };
  }

  /**
   * Creates a fallback analysis result when parsing fails
   * @param {string} imagePath - Image file path
   * @param {string} categoryHint - Category hint
   * @param {string} rawResponse - Original response that failed to parse
   * @returns {Object} Fallback analysis result
   */
  getFallbackAnalysisResult(imagePath, categoryHint, rawResponse) {
    const filename = path.basename(imagePath, path.extname(imagePath));
    
    return {
      productName: filename.replace(/[-_]/g, ' '),
      category: categoryHint || 'Uncategorized',
      description: rawResponse.slice(0, this.maxDescriptionLength),
      tags: [categoryHint, 'parsing-error'].filter(Boolean),
      condition: 'Unknown',
      confidence: 0.1,
      metadata: {
        imagePath,
        filename: path.basename(imagePath),
        categoryHint,
        analyzedAt: new Date().toISOString(),
        agentModel: config.openai.model,
        parseError: true,
      }
    };
  }

  /**
   * Creates an intelligent fallback analysis based on filename and directory
   * @param {string} imagePath - Image file path
   * @param {string} categoryHint - Category hint from directory
   * @returns {Object} Intelligent analysis result
   */
  getIntelligentFallbackResult(imagePath, categoryHint) {
    const filename = path.basename(imagePath, path.extname(imagePath));
    const cleanFilename = filename.replace(/[-_]/g, ' ').replace(/\d+/g, '').trim();
    
    // Create intelligent product name based on filename
    let productName = cleanFilename;
    if (categoryHint) {
      productName = `${categoryHint} - ${cleanFilename}`;
    }
    
    // Generate description based on category and filename
    let description = `Professional ${categoryHint || 'product'} `;
    if (categoryHint === 'first aid kits') {
      description += 'featuring durable construction, organized compartments, and essential medical supplies storage capabilities. Perfect for home, office, or emergency preparedness.';
    } else if (categoryHint === 'jewelry') {
      description += 'crafted with attention to detail, featuring elegant design and quality materials. Suitable for everyday wear or special occasions.';
    } else if (categoryHint === 'candles holders') {
      description += 'designed for ambiance and relaxation, featuring safe construction and attractive styling for home décor.';
    } else {
      description += 'designed for quality and functionality, meeting professional standards and customer expectations.';
    }
    
    // Generate relevant tags
    const tags = [categoryHint, 'retail', 'inventory'].filter(Boolean);
    if (filename.includes('ambulance') || filename.includes('medical')) {
      tags.push('medical', 'emergency', 'healthcare');
    }
    if (filename.includes('portable')) {
      tags.push('portable', 'travel');
    }
    
    return {
      productName: productName.replace(/\s+/g, ' ').trim(),
      category: this.capitalizeCategoryName(categoryHint || 'Miscellaneous'),
      description: description.slice(0, this.maxDescriptionLength),
      tags: tags.slice(0, 5), // Limit to 5 tags
      condition: 'New',
      confidence: 0.7, // Medium confidence for fallback
      metadata: {
        imagePath,
        filename: path.basename(imagePath),
        categoryHint,
        analyzedAt: new Date().toISOString(),
        agentModel: 'intelligent-fallback',
      }
    };
  }
  
  /**
   * Capitalizes category name properly
   * @param {string} category - Category name to capitalize
   * @returns {string} Properly capitalized category name
   */
  capitalizeCategoryName(category) {
    return category
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Gets MIME type for image files
   * @param {string} imagePath - Path to image file
   * @returns {string} MIME type
   */
  getMimeType(imagePath) {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ImageAnalysisAgent;
