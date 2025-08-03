#!/usr/bin/env node

import InventoryIntelligenceAgent from '../src/agents/InventoryIntelligenceAgent.js';
import fs from 'fs/promises';
import chalk from 'chalk';
import ora from 'ora';

console.log(chalk.blue('🧠 Starting AI Inventory Intelligence Analysis...\n'));

async function main() {
  try {
    // Load active items data
    console.log(chalk.gray('📂 Loading inventory data...'));
    const activeItemsData = await fs.readFile('./data/active-items.json', 'utf8');
    const { items } = JSON.parse(activeItemsData);
    
    console.log(chalk.green(`✅ Loaded ${items.length} active items`));
    
    // Initialize AI agent
    const agent = new InventoryIntelligenceAgent();
    await agent.initialize();
    
    console.log(chalk.blue('\n🎯 Step 1: Analyzing Category Patterns'));
    const categoryAnalysis = await agent.analyzeCategoryPatterns(items);
    
    console.log(chalk.green(`✅ Identified ${categoryAnalysis.categories.length} potential categories`));
    console.log(chalk.gray('Categories found:'));
    categoryAnalysis.categories.forEach(cat => {
      console.log(chalk.cyan(`  • ${cat.name}: ${cat.estimatedCount} items`));
    });
    
    console.log(chalk.blue('\n🏷️  Step 2: Categorizing Individual Items'));
    const categorizedItems = await agent.categorizeItems(items, categoryAnalysis.categories);
    
    const highConfidence = categorizedItems.filter(item => item.confidence > 0.8).length;
    const needsReview = categorizedItems.filter(item => item.confidence < 0.6).length;
    
    console.log(chalk.green(`✅ Categorized ${categorizedItems.length} items`));
    console.log(chalk.gray(`  • High confidence: ${highConfidence} items`));
    console.log(chalk.gray(`  • Needs review: ${needsReview} items`));
    
    console.log(chalk.blue('\n💰 Step 3: Analyzing Pricing Opportunities'));
    const pricingAnalysis = await agent.analyzePricing(categorizedItems);
    
    console.log(chalk.green('✅ Pricing analysis completed'));
    console.log(chalk.gray(`  • Categories analyzed: ${Object.keys(pricingAnalysis.categories).length}`));
    
    console.log(chalk.blue('\n📊 Step 4: Generating Intelligence Report'));
    const report = await agent.generateIntelligenceReport(categorizedItems, pricingAnalysis, categoryAnalysis);
    
    console.log(chalk.blue('\n💾 Step 5: Exporting Results'));
    const exportedFiles = await agent.exportResults(report);
    
    console.log(chalk.green('\n🎉 Inventory Intelligence Analysis Complete!'));
    console.log(chalk.blue('\n📁 Files Generated:'));
    console.log(chalk.gray(`  • Full Report: ${exportedFiles.reportPath}`));
    console.log(chalk.gray(`  • Categorized Items: ${exportedFiles.itemsPath}`));
    console.log(chalk.gray(`  • Category Definitions: ${exportedFiles.categoriesPath}`));
    console.log(chalk.gray(`  • Summary Report: ${exportedFiles.summaryPath}`));
    
    // Display key insights
    console.log(chalk.blue('\n🔍 Key Insights:'));
    console.log(chalk.cyan(`  • Business Type: ${report.insights.primaryBusinessType}`));
    console.log(chalk.cyan(`  • Inventory Diversity: ${report.insights.inventoryDiversity}`));
    
    console.log(chalk.blue('\n🎯 Top Recommendations:'));
    report.recommendations.slice(0, 3).forEach(rec => {
      console.log(chalk.yellow(`  • ${rec}`));
    });
    
    // Show category breakdown
    console.log(chalk.blue('\n📊 Category Breakdown:'));
    const categoryStats = {};
    categorizedItems.forEach(item => {
      const cat = item.suggestedCategory;
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;
    });
    
    Object.entries(categoryStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .forEach(([category, count]) => {
        const percentage = ((count / categorizedItems.length) * 100).toFixed(1);
        console.log(chalk.green(`  ${category.padEnd(25)} ${count.toString().padStart(3)} items (${percentage}%)`));
      });
    
    console.log(chalk.blue('\n💡 Next Steps:'));
    console.log(chalk.gray('  1. Review the generated summary report'));
    console.log(chalk.gray('  2. Verify categorizations with low confidence'));
    console.log(chalk.gray('  3. Implement suggested categories in Square'));
    console.log(chalk.gray('  4. Apply pricing recommendations'));
    console.log(chalk.gray('  5. Set up automated categorization for new items'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Analysis failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

main();
