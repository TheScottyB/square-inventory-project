#!/usr/bin/env node

import { IndividualizedEnhancementOrchestrator } from '../../src/orchestration/IndividualizedEnhancementOrchestrator.js';
import path from 'path';

/**
 * Individualized Enhancement Script
 * 
 * Execute the complete individualized enhancement pipeline using specialized AI agents.
 * Preserves all authentic content while creating unique narratives for items needing enhancement.
 */

async function main() {
  const args = process.argv.slice(2);
  
  // Default clean source file (verified authentic content)
  const defaultCatalogFile = '/Users/scottybe/Development/tools/Workspace/square-inventory-project/exports/processed-catalog/processed-catalog-2025-08-03T18-32-59-886Z.xlsx';
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🎨 Individualized Catalog Enhancement

USAGE:
  pnpm run enhance:individualized [catalog-file] [options]

COMMANDS:
  pnpm run enhance:individualized                    # Full enhancement with default catalog
  pnpm run enhance:individualized:dry-run            # Test run without changes
  pnpm run enhance:full-pipeline                     # Complete pipeline with all agents
  pnpm run enhance:vision-only                       # Vision analysis only
  pnpm run enhance:research-only                     # Research analysis only

OPTIONS:
  --dry-run                    Run without making changes
  --no-vision                  Skip vision analysis (faster)
  --no-research               Skip research phase (faster)
  --no-monitoring             Skip monitoring setup
  --batch-size <n>            Items per batch (default: 10)
  --target-words <n>          Target word count for narratives (default: 150)
  --preserve-authentic        Always preserve existing authentic content (default: true)

EXAMPLES:
  # Full enhancement with clean catalog
  pnpm run enhance:individualized

  # Custom catalog file with dry run
  pnpm run enhance:individualized /path/to/catalog.xlsx --dry-run

  # Quick enhancement without research
  pnpm run enhance:individualized --no-research --batch-size 15

  # Vision analysis only for testing
  pnpm run enhance:vision-only

REQUIREMENTS:
  - OpenAI API key in environment (OPENAI_API_KEY)
  - Clean catalog file (no template contamination)
  - At least 4GB RAM for processing large catalogs

ENHANCEMENT PROCESS:
  1. 📊 Load and analyze catalog (preserve vs enhance decisions)
  2. 🔍 Vision analysis using GPT-4 Vision (for items with images)
  3. 📚 Deep research for historical/cultural context
  4. ✍️  Create individualized narratives (unique stories for each item)
  5. 🔍 Quality assurance and optimization
  6. 📦 Assemble final enhanced catalog

IMPORTANT:
  - All authentic content is PRESERVED (never replaced with templates)
  - Only empty/generic descriptions get enhanced with unique narratives
  - Each product gets a completely individualized story
  - Cultural authenticity and SEO optimization maintained
`);
    process.exit(0);
  }
  
  try {
    // Parse arguments
    const catalogFile = args.find(arg => !arg.startsWith('--')) || defaultCatalogFile;
    
    const options = {
      enableDryRun: args.includes('--dry-run'),
      enableVisionAnalysis: !args.includes('--no-vision'),
      enableResearch: !args.includes('--no-research'),
      enableMonitoring: !args.includes('--no-monitoring'),
      preserveAuthentic: !args.includes('--no-preserve-authentic'), // Should always be true
      batchSize: parseInt(args.find(arg => arg.startsWith('--batch-size'))?.split('=')[1]) || 10,
      targetWordCount: parseInt(args.find(arg => arg.startsWith('--target-words'))?.split('=')[1]) || 150
    };
    
    // Special command modes
    if (args.includes('--vision-only')) {
      options.enableResearch = false;
      options.enableMonitoring = false;
      console.log('🔍 Running vision analysis only mode\n');
    } else if (args.includes('--research-only')) {
      options.enableVisionAnalysis = false;
      options.enableMonitoring = false;
      console.log('📚 Running research analysis only mode\n');
    } else if (args.includes('--full-pipeline')) {
      options.enableVisionAnalysis = true;
      options.enableResearch = true;
      options.enableMonitoring = true;
      console.log('🚀 Running full enhancement pipeline\n');
    }
    
    // Validate input file
    if (!catalogFile.endsWith('.xlsx')) {
      throw new Error('Catalog file must be an Excel (.xlsx) file');
    }
    
    // Initialize orchestrator
    const orchestrator = new IndividualizedEnhancementOrchestrator(options);
    
    // Execute enhancement pipeline
    console.log('🎨 Starting Individualized Enhancement Pipeline');
    console.log('=' .repeat(60));
    
    const results = await orchestrator.executeIndividualizedEnhancement(catalogFile, options);
    
    console.log('=' .repeat(60));
    console.log('✅ Enhancement Pipeline Completed Successfully!');
    console.log('');
    console.log('📊 RESULTS SUMMARY:');
    console.log(`   • Total Items: ${results.summary.totalItems}`);
    console.log(`   • Authentic Content Preserved: ${results.summary.authenticContentPreserved}`);
    console.log(`   • New Narratives Created: ${results.summary.newNarrativesCreated}`);
    console.log(`   • Overall Quality Score: ${(results.summary.overallQualityScore * 100).toFixed(1)}%`);
    console.log(`   • Cultural Accuracy: ${(results.summary.culturalAccuracyScore * 100).toFixed(1)}%`);
    console.log('');
    
    if (!options.enableDryRun) {
      console.log('📁 OUTPUT FILES:');
      console.log(`   • Enhanced Catalog: ${results.outputs.enhancedCatalogPath}`);
      console.log(`   • Enhancement Report: ${results.reportPath}`);
      console.log('');
      console.log('🎯 NEXT STEPS:');
      console.log('   1. Review the enhancement report for quality metrics');
      console.log('   2. Spot-check a few enhanced product descriptions');
      console.log('   3. Import the enhanced catalog to Square when ready');
      console.log('   4. Monitor catalog performance with CatalogMonitoringAgent');
    } else {
      console.log('🧪 DRY RUN COMPLETED - No files were modified');
      console.log('   Remove --dry-run flag to execute actual enhancement');
    }
    
    console.log('');
    console.log('🎉 Your catalog now features individualized, authentic storytelling!');
    
  } catch (error) {
    console.error('');
    console.error('💥 Enhancement Failed:');
    console.error(`   ${error.message}`);
    console.error('');
    
    if (error.message.includes('OPENAI_API_KEY')) {
      console.error('🔑 Make sure your OpenAI API key is set:');
      console.error('   export OPENAI_API_KEY="your-api-key-here"');
    } else if (error.message.includes('file not found')) {
      console.error('📁 Check that your catalog file path is correct:');
      console.error(`   Default: ${defaultCatalogFile}`);
    } else if (error.message.includes('rate limit')) {
      console.error('⏱️  Try reducing batch size or adding delays:');
      console.error('   pnpm run enhance:individualized --batch-size 5');
    }
    
    console.error('');
    console.error('💡 For help: pnpm run enhance:individualized --help');
    
    process.exit(1);
  }
}

// Export for programmatic use
export { IndividualizedEnhancementOrchestrator };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}