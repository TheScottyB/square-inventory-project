import { SquareClient, SquareEnvironment, SquareError } from 'square';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

class CategoryManager {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    
    this.client = new SquareClient({
      environment: process.env.SQUARE_ENVIRONMENT === 'production' 
        ? SquareEnvironment.Production 
        : SquareEnvironment.Sandbox,
      token: process.env.SQUARE_ACCESS_TOKEN,
      timeout: 10000
    });
    
    this.catalogApi = this.client.catalog;
    this.existingCategories = new Map();
  }

  async initialize() {
    console.log(chalk.blue('🔄 Initializing Category Manager...'));
    await this.loadExistingCategories();
  }

  async loadExistingCategories() {
    const spinner = ora('Loading existing Square categories...').start();
    
    try {
      const response = await this.catalogApi.search({
        objectTypes: ['CATEGORY'],
        includeDeletedObjects: false,
        limit: 1000
      });

      const result = response.result || response;
      const categories = result.objects || [];
      
      categories.forEach(category => {
        this.existingCategories.set(category.categoryData.name.toLowerCase(), {
          id: category.id,
          name: category.categoryData.name,
          data: category
        });
      });

      spinner.succeed(`Loaded ${categories.length} existing categories`);
      return categories;
      
    } catch (error) {
      spinner.fail('Failed to load existing categories');
      console.error(chalk.red('Error:'), error.message);
      return [];
    }
  }

  async createMissingCategories(suggestedCategories) {
    const spinner = ora('Creating missing categories...').start();
    const createdCategories = [];
    
    try {
      for (const category of suggestedCategories) {
        const categoryName = category.name.toLowerCase();
        
        if (!this.existingCategories.has(categoryName)) {
          spinner.text = `Creating category: ${category.name}`;
          
          const newCategory = await this.createCategory(category);
          if (newCategory) {
            createdCategories.push(newCategory);
            this.existingCategories.set(categoryName, newCategory);
          }
        }
      }
      
      spinner.succeed(`Created ${createdCategories.length} new categories`);
      return createdCategories;
      
    } catch (error) {
      spinner.fail('Failed to create categories');
      console.error(chalk.red('Error:'), error.message);
      return [];
    }
  }

  async createCategory(categoryData) {
    if (this.dryRun) {
      console.log(chalk.yellow(`[DRY RUN] Would create category: ${categoryData.name}`));
      return {
        id: `mock-category-${Date.now()}`,
        name: categoryData.name,
        data: { id: `mock-category-${Date.now()}`, categoryData: { name: categoryData.name } }
      };
    }
    
    try {
      const idempotencyKey = `category-${Date.now()}-${Math.random()}`;
      const categoryObject = {
        type: 'CATEGORY',
        id: `#${categoryData.name.replace(/\s+/g, '-').toLowerCase()}`,
        presentAtAllLocations: true,
        categoryData: {
          name: categoryData.name
        }
      };

      const response = await this.catalogApi.batchUpsert({
        idempotencyKey,
        batches: [{
          objects: [categoryObject]
        }]
      });
      
      const result = response.result || response;
      const objects = result.objects || [];
      
      if (objects.length === 0) {
        throw new Error('No category objects returned from batch upsert');
      }
      
      return {
        id: objects[0].id,
        name: objects[0].categoryData.name,
        data: objects[0]
      };
      
    } catch (error) {
      console.error(chalk.red(`Failed to create category ${categoryData.name}:`), error.message);
      return null;
    }
  }

  async applyCategorization(categorizedItems, options = {}) {
    const { dryRun = false, confidenceThreshold = 0.6 } = options;
    
    const spinner = ora(dryRun ? 'Simulating categorization...' : 'Applying categorization...').start();
    
    try {
      const results = {
        processed: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        details: []
      };

      // Filter items by confidence threshold
      const itemsToProcess = categorizedItems.filter(item => 
        item.confidence >= confidenceThreshold && 
        item.suggestedCategory !== 'Uncategorized'
      );

      spinner.text = `${dryRun ? 'Simulating' : 'Processing'} ${itemsToProcess.length} items...`;

      for (const item of itemsToProcess) {
        try {
          const categoryName = item.suggestedCategory.toLowerCase();
          const category = this.existingCategories.get(categoryName);
          
          if (!category) {
            results.skipped++;
            results.details.push({
              itemId: item.id,
              itemName: item.name,
              status: 'skipped',
              reason: `Category '${item.suggestedCategory}' not found`
            });
            continue;
          }

          if (dryRun) {
            results.updated++;
            results.details.push({
              itemId: item.id,
              itemName: item.name,
              status: 'would_update',
              category: item.suggestedCategory,
              confidence: item.confidence
            });
          } else {
            const updateResult = await this.updateItemCategory(item.id, category.id);
            if (updateResult) {
              results.updated++;
              results.details.push({
                itemId: item.id,
                itemName: item.name,
                status: 'updated',
                category: item.suggestedCategory,
                confidence: item.confidence
              });
            } else {
              results.errors++;
              results.details.push({
                itemId: item.id,
                itemName: item.name,
                status: 'error',
                reason: 'Update failed'
              });
            }
          }
          
          results.processed++;
          
          if (results.processed % 10 === 0) {
            spinner.text = `${dryRun ? 'Simulated' : 'Processed'} ${results.processed}/${itemsToProcess.length} items...`;
          }
          
        } catch (error) {
          results.errors++;
          results.details.push({
            itemId: item.id,
            itemName: item.name,
            status: 'error',
            reason: error.message
          });
        }
      }

      const action = dryRun ? 'Simulation' : 'Categorization';
      spinner.succeed(`${action} completed: ${results.updated} updated, ${results.skipped} skipped, ${results.errors} errors`);
      
      return results;
      
    } catch (error) {
      spinner.fail('Categorization failed');
      console.error(chalk.red('Error:'), error.message);
      throw error;
    }
  }

  async updateItemCategory(itemId, categoryId) {
    if (this.dryRun) {
      console.log(chalk.yellow(`[DRY RUN] Would update item ${itemId} to category ${categoryId}`));
      return true;
    }
    
    try {
      // First get the current item data
      const getResponse = await this.catalogApi.batchGet({
        objectIds: [itemId]
      });
      const getResult = getResponse.result || getResponse;
      const objects = getResult.objects || [];
      
      if (objects.length === 0) {
        throw new Error('Item not found');
      }
      
      const currentItem = objects[0];

      // Update the category
      const updatedItem = {
        ...currentItem,
        itemData: {
          ...currentItem.itemData,
          categoryId: categoryId
        }
      };
      
      const idempotencyKey = `update-category-${itemId}-${Date.now()}`;
      await this.catalogApi.batchUpsert({
        idempotencyKey,
        batches: [{
          objects: [updatedItem]
        }]
      });
      
      return true;
      
    } catch (error) {
      console.error(chalk.red(`Failed to update item ${itemId}:`), error.message);
      return false;
    }
  }

  async generateCategoryReport(categorizedItems) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalItems: categorizedItems.length,
        categorized: categorizedItems.filter(item => item.suggestedCategory !== 'Uncategorized').length,
        uncategorized: categorizedItems.filter(item => item.suggestedCategory === 'Uncategorized').length,
        highConfidence: categorizedItems.filter(item => item.confidence > 0.8).length,
        lowConfidence: categorizedItems.filter(item => item.confidence < 0.6).length
      },
      categoryBreakdown: {},
      existingCategories: Array.from(this.existingCategories.values()),
      recommendations: []
    };

    // Generate category breakdown
    categorizedItems.forEach(item => {
      const category = item.suggestedCategory;
      if (!report.categoryBreakdown[category]) {
        report.categoryBreakdown[category] = {
          count: 0,
          avgConfidence: 0,
          items: []
        };
      }
      
      report.categoryBreakdown[category].count++;
      report.categoryBreakdown[category].items.push({
        id: item.id,
        name: item.name,
        confidence: item.confidence
      });
    });

    // Calculate average confidence for each category
    Object.keys(report.categoryBreakdown).forEach(category => {
      const items = report.categoryBreakdown[category].items;
      const avgConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
      report.categoryBreakdown[category].avgConfidence = parseFloat(avgConfidence.toFixed(3));
    });

    // Generate recommendations
    if (report.summary.lowConfidence > 0) {
      report.recommendations.push(`Review ${report.summary.lowConfidence} items with low confidence scores`);
    }
    
    if (report.summary.uncategorized > 0) {
      report.recommendations.push(`Manual categorization needed for ${report.summary.uncategorized} uncategorized items`);
    }

    const newCategoriesNeeded = new Set(categorizedItems.map(item => item.suggestedCategory.toLowerCase())).size - this.existingCategories.size;
    if (newCategoriesNeeded > 0) {
      report.recommendations.push(`Create ${newCategoriesNeeded} new categories in Square`);
    }

    return report;
  }

  async exportCategoryReport(report, outputPath) {
    const spinner = ora('Exporting category report...').start();
    
    try {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
      
      spinner.succeed(`Category report exported to ${outputPath}`);
      return outputPath;
      
    } catch (error) {
      spinner.fail('Failed to export report');
      throw error;
    }
  }
}

export default CategoryManager;
