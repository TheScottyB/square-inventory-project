#!/usr/bin/env node

import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';
import CategoryManager from '../src/managers/CategoryManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log(chalk.blue('🏷️  Starting Category Application Process...\n'));

  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log(chalk.yellow('🔍 DRY RUN MODE - No actual changes will be made\n'));
  }

  try {
    // Initialize CategoryManager
    const categoryManager = new CategoryManager({ dryRun });
    await categoryManager.initialize();

    // Find latest categorization results
    const intelligenceDir = path.join(__dirname, '../data/intelligence');
    const files = await fs.readdir(intelligenceDir);
    const categorizedItemsFiles = files
      .filter(f => f.startsWith('categorized-items-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (categorizedItemsFiles.length === 0) {
      console.error(chalk.red('❌ No categorization results found. Run inventory intelligence analysis first.'));
      process.exit(1);
    }

    const latestFile = categorizedItemsFiles[0];
    const filePath = path.join(intelligenceDir, latestFile);
    
    console.log(chalk.cyan(`📁 Loading categorization results from: ${latestFile}\n`));

    // Load categorization results
    const categorizedItems = JSON.parse(await fs.readFile(filePath, 'utf8'));
    
    console.log(chalk.green(`✅ Loaded ${categorizedItems.length} categorized items\n`));

    // Step 1: Load existing categories from Square
    console.log(chalk.blue('🔍 Step 1: Loading existing Square categories'));
    const existingCategories = await categoryManager.loadExistingCategories();
    console.log(chalk.green(`✅ Found ${existingCategories.length} existing categories\n`));

    // Step 2: Create missing categories  
    console.log(chalk.blue('🆕 Step 2: Creating missing categories'));
    const uniqueCategories = [...new Set(categorizedItems
      .filter(item => item.suggestedCategory && item.suggestedCategory !== 'Uncategorized')
      .map(item => item.suggestedCategory)
    )].map(name => ({ name }));
    
    const createdCategories = await categoryManager.createMissingCategories(uniqueCategories);
    console.log(chalk.green(`✅ Categories processed (${createdCategories.length} created)\n`));

    // Step 3: Apply categorizations to items
    console.log(chalk.blue('🏷️  Step 3: Applying categories to items'));
    const applicationResults = await categoryManager.applyCategorization(categorizedItems, { 
      dryRun, 
      confidenceThreshold: 0.6 
    });

    // Step 4: Generate and export report
    console.log(chalk.blue('📊 Step 4: Generating application report'));
    const report = await categoryManager.generateCategoryReport(categorizedItems);
    const timestamp = new Date().toISOString().split('T')[0];
    const outputDir = path.join(__dirname, '../data/categories');
    await fs.mkdir(outputDir, { recursive: true });
    const reportPath = path.join(outputDir, `category-application-${timestamp}.json`);
    await categoryManager.exportCategoryReport(report, reportPath);

    console.log(chalk.green('\n🎉 Category Application Complete!\n'));

    // Display summary results
    console.log(chalk.blue('📊 Summary Results:'));
    console.log(chalk.green(`✅ Items successfully updated: ${applicationResults.updated}`));
    console.log(chalk.yellow(`⚠️  Items skipped: ${applicationResults.skipped}`));
    console.log(chalk.red(`❌ Items failed: ${applicationResults.errors}\n`));

    // Display category breakdown
    console.log(chalk.blue('🏷️  Category Breakdown:'));
    const categoryBreakdown = {};
    categorizedItems.forEach(item => {
      const category = item.suggestedCategory || 'Uncategorized';
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
    });

    Object.entries(categoryBreakdown)
      .sort(([,a], [,b]) => b - a)
      .forEach(([category, count]) => {
        const percentage = ((count / categorizedItems.length) * 100).toFixed(1);
        console.log(chalk.cyan(`  ${category.padEnd(25)} ${count.toString().padStart(3)} items (${percentage}%)`));
      });

    console.log(chalk.blue('\n📁 Generated Files:'));
    console.log(chalk.green(`  • Category Report: ${path.basename(reportPath)}\n`));

    if (dryRun) {
      console.log(chalk.yellow('🔍 This was a dry run. To apply changes, run:'));
      console.log(chalk.yellow('   pnpm run categories:apply\n'));
    }

    console.log(chalk.blue('💡 Next Steps:'));
    console.log(chalk.cyan('  1. Review the generated report for any issues'));
    console.log(chalk.cyan('  2. Check items that were skipped or failed'));
    console.log(chalk.cyan('  3. Verify categories in Square Dashboard'));
    console.log(chalk.cyan('  4. Consider running SEO updates for newly categorized items\n'));

  } catch (error) {
    console.error(chalk.red('❌ Category application failed:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n⚠️  Process interrupted. Exiting...'));
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
