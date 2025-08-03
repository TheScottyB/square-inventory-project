import { OpenAI } from 'openai';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

class InventoryIntelligenceAgent {
  constructor(options = {}) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.options = {
      model: 'gpt-4o',
      maxTokens: 1000,
      temperature: 0.3, // Lower temperature for more consistent categorization
      ...options
    };
    this.outputDir = path.join(__dirname, '../../data/intelligence');
  }

  async initialize() {
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  async analyzeCategoryPatterns(items) {
    const spinner = ora('🧠 Analyzing inventory patterns with AI...').start();
    
    try {
      // Extract product names for analysis
      const productNames = items.map(item => item.name);
      
      const prompt = `Analyze these ${productNames.length} product names and identify logical category patterns:

${productNames.slice(0, 50).join('\n')}
${productNames.length > 50 ? `\n... and ${productNames.length - 50} more items` : ''}

Based on these products, suggest 8-12 logical categories that would organize this inventory effectively. 

For each category, provide:
1. Category name
2. Description
3. Example products that would fit
4. Estimated item count

Respond in JSON format:
{
  "categories": [
    {
      "name": "Category Name",
      "description": "Brief description",
      "examples": ["product1", "product2"],
      "estimatedCount": 25
    }
  ],
  "insights": {
    "primaryBusinessType": "description",
    "inventoryDiversity": "assessment",
    "organizationRecommendations": ["rec1", "rec2"]
  }
}`;

      const response = await this.openai.chat.completions.create({
        model: this.options.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.options.maxTokens,
        temperature: this.options.temperature
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      
      spinner.succeed('AI category analysis completed');
      return analysis;
      
    } catch (error) {
      spinner.fail('Category analysis failed');
      console.error(chalk.red('Error:'), error.message);
      
      // Fallback to pattern-based categorization
      return this.fallbackCategoryAnalysis(items);
    }
  }

  fallbackCategoryAnalysis(items) {
    console.log(chalk.yellow('🔄 Using fallback pattern-based categorization...'));
    
    const categories = {
      "Services": { count: 0, keywords: ["service", "brainstorming", "tour", "improvement", "consultation"] },
      "Beauty & Cosmetics": { count: 0, keywords: ["lip", "gloss", "shimmer", "moisturizer", "oil", "liner", "lipstick"] },
      "Drinkware": { count: 0, keywords: ["mug", "cup", "travel mug", "ceramic"] },
      "Apparel & Accessories": { count: 0, keywords: ["bag", "tote", "beanie", "clothing", "wear"] },
      "Tech Accessories": { count: 0, keywords: ["case", "iphone", "phone", "tech"] },
      "Art & Decor": { count: 0, keywords: ["art", "print", "framed", "glass", "decor", "giraffe"] },
      "Stationery": { count: 0, keywords: ["notebook", "journal", "paper"] },
      "Entertainment": { count: 0, keywords: ["pinball", "game", "box"] }
    };

    items.forEach(item => {
      const name = item.name.toLowerCase();
      let categorized = false;
      
      for (const [category, data] of Object.entries(categories)) {
        if (data.keywords.some(keyword => name.includes(keyword))) {
          data.count++;
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        if (!categories["Uncategorized"]) {
          categories["Uncategorized"] = { count: 0, keywords: [] };
        }
        categories["Uncategorized"].count++;
      }
    });

    return {
      categories: Object.entries(categories).map(([name, data]) => ({
        name,
        description: `Products related to ${name.toLowerCase()}`,
        estimatedCount: data.count,
        examples: []
      })),
      insights: {
        primaryBusinessType: "Mixed retail and services",
        inventoryDiversity: "High diversity across multiple product categories",
        organizationRecommendations: [
          "Consider separate catalogs for services vs products",
          "Group similar items (beauty, drinkware) for better customer experience",
          "Create seasonal collections for gift items"
        ]
      }
    };
  }

  async categorizeItems(items, suggestedCategories) {
    const spinner = ora('🏷️  Categorizing individual items...').start();
    
    try {
      const categorizedItems = [];
      const batchSize = 20; // Process items in batches
      
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await this.categorizeBatch(batch, suggestedCategories);
        categorizedItems.push(...batchResults);
        
        spinner.text = `Categorized ${Math.min(i + batchSize, items.length)}/${items.length} items...`;
      }
      
      spinner.succeed(`Successfully categorized ${categorizedItems.length} items`);
      return categorizedItems;
      
    } catch (error) {
      spinner.fail('Item categorization failed, using pattern-based fallback');
      console.error(chalk.red('Error:'), error.message);
      return this.fallbackItemCategorization(items, suggestedCategories);
    }
  }

  async categorizeBatch(items, categories) {
    const categoryNames = categories.map(c => c.name);
    
    const prompt = `Categorize these products into the most appropriate category:

Categories: ${categoryNames.join(', ')}

Products:
${items.map((item, idx) => `${idx + 1}. ${item.name}`).join('\n')}

For each product, respond with JSON:
{
  "categorizations": [
    {
      "itemIndex": 1,
      "category": "Category Name",
      "confidence": 0.95,
      "reasoning": "brief explanation"
    }
  ]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.options.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.2
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      return items.map((item, idx) => {
        const categorization = result.categorizations.find(c => c.itemIndex === idx + 1);
        return {
          ...item,
          suggestedCategory: categorization?.category || 'Uncategorized',
          confidence: categorization?.confidence || 0,
          reasoning: categorization?.reasoning || 'No categorization found'
        };
      });
      
    } catch (error) {
      console.warn(chalk.yellow(`Batch categorization failed: ${error.message}`));
      // Use pattern-based fallback for this batch
      return this.fallbackBatchCategorization(items, categories);
    }
  }

  async analyzePricing(items) {
    const spinner = ora('💰 Analyzing pricing patterns...').start();
    
    try {
      // Group items by category for pricing analysis
      const categoryGroups = {};
      items.forEach(item => {
        const category = item.suggestedCategory || 'Uncategorized';
        if (!categoryGroups[category]) {
          categoryGroups[category] = [];
        }
        categoryGroups[category].push(item);
      });

      const pricingAnalysis = {
        categories: {},
        insights: {
          averagePrice: 0,
          priceRange: { min: Infinity, max: 0 },
          pricingGaps: [],
          recommendations: []
        }
      };

      for (const [category, categoryItems] of Object.entries(categoryGroups)) {
        const analysis = await this.analyzeCategoryPricing(category, categoryItems);
        pricingAnalysis.categories[category] = analysis;
      }

      spinner.succeed('Pricing analysis completed');
      return pricingAnalysis;
      
    } catch (error) {
      spinner.fail('Pricing analysis failed');
      console.error(chalk.red('Error:'), error.message);
      return { categories: {}, insights: {} };
    }
  }

  async analyzeCategoryPricing(category, items) {
    // Since we don't have pricing data in the active-items.json, 
    // we'll provide AI-powered pricing suggestions based on product types
    
    const prompt = `Provide pricing suggestions for these ${category} products:

Products:
${items.slice(0, 10).map(item => `- ${item.name}`).join('\n')}
${items.length > 10 ? `... and ${items.length - 10} similar items` : ''}

Suggest:
1. Typical price range for this category
2. Premium pricing opportunities
3. Bundle pricing strategies
4. Competitive positioning

Respond in JSON:
{
  "priceRange": {
    "low": 10,
    "mid": 25,
    "high": 50
  },
  "recommendations": [
    {
      "strategy": "Premium positioning",
      "description": "explanation",
      "suggestedPrice": 45
    }
  ],
  "bundleOpportunities": ["suggestion1", "suggestion2"]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.options.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.4
      });

      return JSON.parse(response.choices[0].message.content);
      
    } catch (error) {
      // Fallback pricing suggestions
      return {
        priceRange: { low: 10, mid: 25, high: 50 },
        recommendations: [
          {
            strategy: "Market-based pricing",
            description: "Set competitive prices based on similar products",
            suggestedPrice: 25
          }
        ],
        bundleOpportunities: ["Create category bundles", "Seasonal promotions"]
      };
    }
  }

  async generateIntelligenceReport(categorizedItems, pricingAnalysis, categoryAnalysis) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalItems: categorizedItems.length,
        categoriesIdentified: categoryAnalysis.categories.length,
        highConfidenceItems: categorizedItems.filter(item => item.confidence > 0.8).length,
        needsReview: categorizedItems.filter(item => item.confidence < 0.6).length
      },
      categories: categoryAnalysis.categories,
      categorizedItems: categorizedItems,
      pricingAnalysis,
      insights: categoryAnalysis.insights,
      recommendations: [
        "Implement suggested categories to improve navigation",
        "Review low-confidence categorizations manually",
        "Consider pricing strategies for each category",
        "Create bundles within related categories",
        "Set up automated category assignments for new items"
      ]
    };

    return report;
  }

  async exportResults(report) {
    const spinner = ora('📊 Exporting intelligence report...').start();
    
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      
      // Export full report
      const reportPath = path.join(this.outputDir, `inventory-intelligence-${timestamp}.json`);
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      
      // Export categorized items for easy import
      const itemsPath = path.join(this.outputDir, `categorized-items-${timestamp}.json`);
      await fs.writeFile(itemsPath, JSON.stringify(report.categorizedItems, null, 2));
      
      // Export category definitions
      const categoriesPath = path.join(this.outputDir, `suggested-categories-${timestamp}.json`);
      await fs.writeFile(categoriesPath, JSON.stringify(report.categories, null, 2));
      
      // Create human-readable summary
      const summaryPath = path.join(this.outputDir, `intelligence-summary-${timestamp}.md`);
      const summary = this.generateMarkdownSummary(report);
      await fs.writeFile(summaryPath, summary);
      
      spinner.succeed('Intelligence report exported');
      
      return {
        reportPath,
        itemsPath,
        categoriesPath,
        summaryPath
      };
      
    } catch (error) {
      spinner.fail('Export failed');
      throw error;
    }
  }

  generateMarkdownSummary(report) {
    const { summary, categories, pricingAnalysis } = report;
    
    return `# Inventory Intelligence Report
*Generated: ${new Date(report.timestamp).toLocaleDateString()}*

## 📊 Summary
- **Total Items Analyzed**: ${summary.totalItems}
- **Categories Identified**: ${summary.categoriesIdentified}
- **High Confidence**: ${summary.highConfidenceItems} items (${((summary.highConfidenceItems/summary.totalItems)*100).toFixed(1)}%)
- **Needs Review**: ${summary.needsReview} items

## 🗂️ Suggested Categories

${categories.map(cat => `### ${cat.name}
- **Description**: ${cat.description}
- **Estimated Items**: ${cat.estimatedCount}
${cat.examples?.length ? `- **Examples**: ${cat.examples.slice(0, 3).join(', ')}` : ''}
`).join('\n')}

## 💰 Pricing Insights

${Object.entries(pricingAnalysis.categories || {}).map(([category, analysis]) => `### ${category}
- **Price Range**: $${analysis.priceRange?.low} - $${analysis.priceRange?.high}
- **Recommendations**: ${analysis.recommendations?.length} pricing strategies identified
`).join('\n')}

## 🎯 Key Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}

## 🔍 Business Insights

${report.insights.organizationRecommendations?.map(insight => `- ${insight}`).join('\n') || 'No specific insights generated'}

---
*This report was generated by the AI Inventory Intelligence Agent*
`;
  }

  fallbackItemCategorization(items, suggestedCategories) {
    console.log(chalk.yellow('🔄 Using pattern-based item categorization...'));
    
    const categoryKeywords = {
      "Services": ["service", "brainstorming", "tour", "improvement", "consultation"],
      "Beauty & Cosmetics": ["lip", "gloss", "shimmer", "moisturizer", "oil", "liner", "lipstick"],
      "Drinkware": ["mug", "cup", "travel mug", "ceramic"],
      "Apparel & Accessories": ["bag", "tote", "beanie", "clothing", "wear"],
      "Tech Accessories": ["case", "iphone", "phone", "tech"],
      "Art & Decor": ["art", "print", "framed", "glass", "decor", "giraffe"],
      "Stationery": ["notebook", "journal", "paper"],
      "Entertainment": ["pinball", "game", "box"]
    };

    return items.map(item => {
      const name = item.name.toLowerCase();
      let bestCategory = 'Uncategorized';
      let confidence = 0.5; // Pattern-based gets medium confidence
      
      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(keyword => name.includes(keyword))) {
          bestCategory = category;
          confidence = 0.7; // Higher confidence for keyword matches
          break;
        }
      }
      
      return {
        ...item,
        suggestedCategory: bestCategory,
        confidence: confidence,
        reasoning: bestCategory === 'Uncategorized' ? 'No pattern match found' : 'Pattern-based classification'
      };
    });
  }

  fallbackBatchCategorization(items, categories) {
    const categoryNames = categories.map(c => c.name);
    const categoryKeywords = {
      "Services": ["service", "brainstorming", "tour", "improvement", "consultation"],
      "Beauty & Cosmetics": ["lip", "gloss", "shimmer", "moisturizer", "oil", "liner", "lipstick"],
      "Drinkware": ["mug", "cup", "travel mug", "ceramic"],
      "Apparel & Accessories": ["bag", "tote", "beanie", "clothing", "wear"],
      "Tech Accessories": ["case", "iphone", "phone", "tech"],
      "Art & Decor": ["art", "print", "framed", "glass", "decor", "giraffe"],
      "Stationery": ["notebook", "journal", "paper"],
      "Entertainment": ["pinball", "game", "box"]
    };

    return items.map(item => {
      const name = item.name.toLowerCase();
      let bestCategory = 'Uncategorized';
      let confidence = 0.5;
      
      // Check against available categories first
      for (const categoryName of categoryNames) {
        const keywords = categoryKeywords[categoryName] || [];
        if (keywords.some(keyword => name.includes(keyword))) {
          bestCategory = categoryName;
          confidence = 0.7;
          break;
        }
      }
      
      return {
        ...item,
        suggestedCategory: bestCategory,
        confidence: confidence,
        reasoning: bestCategory === 'Uncategorized' ? 'No pattern match found' : 'Pattern-based classification'
      };
    });
  }
}

export default InventoryIntelligenceAgent;
