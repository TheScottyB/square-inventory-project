#!/usr/bin/env node

/**
 * Dual Categorization System Demo
 * 
 * Demonstrates the CategoryControlAgent's ability to:
 * - Preserve established customer-visible categories
 * - Add internal sorting categories with INTERNAL_ prefix
 * - Manage workflow, performance, and organizational categories
 * - Protect established categories from modification
 */

import { CategoryControlAgent } from '../../src/agents/categorization/CategoryControlAgent.js';
import chalk from 'chalk';
import ora from 'ora';

async function main() {
  console.log(chalk.blue('🏷️  Dual Categorization System Demo'));
  console.log(chalk.gray('Demonstrating internal sorting while preserving established categories\n'));

  try {
    // Initialize the category control agent
    const categoryAgent = new CategoryControlAgent({
      enableDryRun: true,
      suggestInternalCategories: true
    });

    // Sample catalog items with different scenarios
    const sampleItems = [
      {
        sku: 'RRV-VIN-001-CANDLE',
        itemName: 'Vintage French Brass Candle Holder',
        categories: 'Vintage & Antique, French Collections',
        description: 'Beautiful 19th century brass candle holder from French estate sale. Excellent condition.',
        price: 85,
        createdAt: '2025-07-28T10:00:00Z',
        images: ['holder1.jpg', 'holder2.jpg']
      },
      {
        sku: 'RRV-SPI-002-CRYSTAL',
        itemName: 'Healing Crystal Set - Amethyst & Rose Quartz',
        categories: 'Energy & Elements, Spiritual Items',
        description: 'Hand-selected crystal set for meditation and energy work',
        price: 0, // No price set yet
        createdAt: '2025-08-01T14:30:00Z',
        images: []
      },
      {
        sku: 'RRV-ART-003-HANDMADE',
        itemName: 'Artisan Carved Wooden Buddha',
        categories: 'Handmade & Artisan, Spiritual Items, INTERNAL_SOURCE_Artisan_Partner',
        description: 'Exquisite hand-carved Buddha statue by master craftsman',
        price: 125,
        createdAt: '2025-07-15T09:20:00Z',
        images: ['buddha1.jpg']
      },
      {
        sku: 'RRV-RAR-004-COLLECTION',
        itemName: 'Rare Victorian Mourning Locket',
        categories: 'The Real Rarities, Vintage & Antique, INTERNAL_CONDITION_Excellent, INTERNAL_PERFORMANCE_Featured_Item',
        description: 'Exceptional Victorian mourning locket with original photograph. Museum quality.',
        price: 450,
        createdAt: '2025-07-10T16:45:00Z',
        images: ['locket1.jpg', 'locket2.jpg', 'locket3.jpg']
      },
      {
        sku: 'RRV-DEC-005-NEW',
        itemName: 'Modern Zen Garden Set',
        categories: 'Space & Atmosphere, Mind & Clarity',
        description: '', // Incomplete description
        price: 75,
        createdAt: '2025-08-02T11:15:00Z',
        images: []
      }
    ];

    console.log(chalk.green('📋 Processing Sample Items'));
    console.log(chalk.white('━'.repeat(80)));

    // Process each item to demonstrate dual categorization
    for (const item of sampleItems) {
      const spinner = ora(`Processing ${item.itemName}...`).start();
      
      const result = await categoryAgent.processItemCategories(item, {
        suggestInternalCategories: true
      });
      
      spinner.succeed(`Processed ${item.itemName}`);
      
      // Display results
      console.log(chalk.yellow(`\n🏷️  ${result.itemName}`));
      console.log(chalk.gray(`   SKU: ${result.sku}`));
      
      if (result.customerVisibleCategories.length > 0) {
        console.log(chalk.green(`   👥 Customer Categories: ${result.customerVisibleCategories.join(', ')}`));
      }
      
      if (result.internalCategories.length > 0) {
        console.log(chalk.cyan(`   🔧 Internal Categories: ${result.internalCategories.join(', ')}`));
      }
      
      if (result.suggestedInternalCategories.length > 0) {
        console.log(chalk.magenta(`   💡 Suggested Internal: ${result.suggestedInternalCategories.join(', ')}`));
      }
      
      if (result.categoryValidation.protectedCategories.length > 0) {
        console.log(chalk.blue(`   🛡️  Protected Categories: ${result.categoryValidation.protectedCategories.join(', ')}`));
      }
      
      if (result.categoryValidation.warnings.length > 0) {
        result.categoryValidation.warnings.forEach(warning => {
          console.log(chalk.yellow(`   ⚠️  ${warning}`));
        });
      }
      
      if (result.processingNotes.length > 0) {
        result.processingNotes.forEach(note => {
          console.log(chalk.gray(`   📝 ${note}`));
        });
      }
    }

    // Demonstrate category management features
    console.log(chalk.green('\n🔧 Category Management Features'));
    console.log(chalk.white('━'.repeat(80)));

    // Show established categories
    const establishedCategories = categoryAgent.getEstablishedCategories();
    console.log(chalk.yellow('🛡️  Protected Established Categories:'));
    Object.keys(establishedCategories).forEach(category => {
      console.log(chalk.gray(`   • ${category} ✅ Protected`));
    });

    // Show internal category templates
    console.log(chalk.yellow('\n🏗️  Available Internal Category Templates:'));
    const templates = categoryAgent.getInternalCategoryTemplates();
    
    Object.entries(templates).forEach(([group, categories]) => {
      console.log(chalk.cyan(`\n   ${group.toUpperCase()} Categories:`));
      Object.entries(categories).forEach(([categoryName, description]) => {
        console.log(chalk.gray(`   • ${categoryName}: ${description}`));
      });
    });

    // Demonstrate category validation
    console.log(chalk.green('\n🔒 Category Protection Validation'));
    console.log(chalk.white('━'.repeat(80)));

    const protectionTests = [
      'Vintage & Antique',
      'Energy & Elements', 
      'INTERNAL_WORKFLOW_New_Item',
      'Custom Category'
    ];

    protectionTests.forEach(categoryName => {
      const validation = categoryAgent.validateCategoryModification(categoryName, 'delete');
      if (validation.allowed) {
        console.log(chalk.green(`   ✅ ${categoryName}: Modification allowed`));
      } else {
        console.log(chalk.red(`   ❌ ${categoryName}: ${validation.reason}`));
        if (validation.alternative) {
          console.log(chalk.gray(`      Alternative: ${validation.alternative}`));
        }
      }
    });

    // Show usage examples
    console.log(chalk.green('\n📖 Usage Examples'));
    console.log(chalk.white('━'.repeat(80)));

    console.log(chalk.yellow('Example 1: Customer-facing categories only'));
    const customerOnlyExample = ['Energy & Elements', 'Spiritual Items'];
    const customerOnly = categoryAgent.getCustomerVisibleCategories([
      ...customerOnlyExample,
      'INTERNAL_WORKFLOW_Photo_Ready',
      'INTERNAL_SOURCE_Estate_Sale'
    ]);
    console.log(chalk.gray(`   Input: ${customerOnlyExample.join(', ')}, INTERNAL_WORKFLOW_Photo_Ready, INTERNAL_SOURCE_Estate_Sale`));
    console.log(chalk.green(`   Customer View: ${customerOnly.join(', ')}`));

    console.log(chalk.yellow('\nExample 2: Internal categories only'));
    const allCategoriesExample = ['Vintage & Antique', 'INTERNAL_CONDITION_Mint', 'INTERNAL_PERFORMANCE_Bestseller'];
    const internalOnly = categoryAgent.getInternalCategories(allCategoriesExample);
    console.log(chalk.gray(`   Input: ${allCategoriesExample.join(', ')}`));
    console.log(chalk.cyan(`   Internal Only: ${internalOnly.join(', ')}`));

    console.log(chalk.yellow('\nExample 3: Creating custom internal category'));
    try {
      const newCategory = categoryAgent.createInternalCategory(
        'PROCESSING_Quality_Check',
        'Items undergoing quality assurance review',
        'workflow'
      );
      console.log(chalk.green(`   ✅ Created: ${newCategory.categoryName}`));
      console.log(chalk.gray(`   Description: ${newCategory.description}`));
      console.log(chalk.gray(`   Group: ${newCategory.group}`));
    } catch (error) {
      console.log(chalk.red(`   ❌ Error: ${error.message}`));
    }

    // Display processing statistics
    console.log(chalk.green('\n📊 Processing Statistics'));
    console.log(chalk.white('━'.repeat(80)));
    
    const stats = categoryAgent.getProcessingStats();
    console.log(chalk.gray(`Items Processed: ${stats.itemsProcessed}`));
    console.log(chalk.gray(`Protected Categories: ${stats.categoriesProtected}`));
    console.log(chalk.gray(`Internal Categories Created: ${stats.internalCategoriesCreated}`));
    console.log(chalk.gray(`Dual Categorization Applied: ${stats.dualCategorizationApplied}`));
    console.log(chalk.gray(`Category Violations: ${stats.categoryViolations}`));

    // Implementation guidance
    console.log(chalk.green('\n🚀 Implementation Guidance'));
    console.log(chalk.white('━'.repeat(80)));
    
    console.log(chalk.yellow('Key Benefits:'));
    console.log(chalk.gray('   • ✅ All 8 established categories preserved and protected'));
    console.log(chalk.gray('   • ✅ Internal sorting categories for workflow management'));
    console.log(chalk.gray('   • ✅ Customer experience remains clean and focused'));
    console.log(chalk.gray('   • ✅ Advanced inventory organization and tracking'));
    console.log(chalk.gray('   • ✅ Automated category suggestions based on item characteristics'));

    console.log(chalk.yellow('\nNext Steps:'));
    console.log(chalk.gray('   1. Integrate with Square catalog synchronization'));
    console.log(chalk.gray('   2. Build customer-facing filtering (hide INTERNAL_ categories)'));
    console.log(chalk.gray('   3. Create workflow automation rules'));
    console.log(chalk.gray('   4. Implement performance tracking and analytics'));
    console.log(chalk.gray('   5. Add batch category management operations'));

    console.log(chalk.green('\n✅ Dual Categorization Demo Completed Successfully!'));
    console.log(chalk.gray('The system successfully demonstrates internal sorting while preserving established categories.'));

  } catch (error) {
    console.error(chalk.red('\n❌ Demo failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});

// Run the demo
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});