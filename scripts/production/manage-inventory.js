#!/usr/bin/env node

import { InventoryAutomationOrchestrator } from '../../src/orchestration/InventoryAutomationOrchestrator.js';
import path from 'path';
import { config } from '../../src/config/index.js';

/**
 * Manage Inventory - CLI Entrypoint for Inventory Automation
 * 
 * Usage:
 *   node scripts/production/manage-inventory.js [directory] [options]
 * 
 * Examples:
 *   # Process all images in assets/images directory
 *   node scripts/production/manage-inventory.js assets/images
 *   
 *   # Dry run with custom settings
 *   node scripts/production/manage-inventory.js assets/images --dry-run --confidence-threshold 0.8
 *   
 *   # Auto-apply file renames and create backups
 *   node scripts/production/manage-inventory.js assets/images --auto-rename --enable-backups
 */

class InventoryManager {
  constructor() {
    this.orchestrator = null;
  }

  async main() {
    try {
      console.log('🤖 Inventory Automation Manager\n');

      // Parse command line arguments
      const options = this.parseArguments();
      
      if (options.help) {
        this.showHelp();
        return;
      }

      if (!options.directory) {
        console.error('❌ Error: Source directory is required');
        this.showHelp();
        process.exit(1);
      }

      // Initialize orchestrator with parsed options
      this.orchestrator = new InventoryAutomationOrchestrator(options);

      // Set up event listeners for progress tracking
      this.setupEventListeners();

      // Execute the full pipeline
      console.log(`Starting automated inventory management...`);
      console.log(`Source: ${options.directory}`);
      console.log(`Mode: ${options.enableDryRun ? 'DRY RUN' : 'LIVE'}\n`);

      const result = await this.orchestrator.executeFullPipeline(options.directory, options);

      // Display final summary
      this.displayFinalSummary(result);

    } catch (error) {
      console.error('\n💥 Pipeline execution failed:');
      console.error(error.message);
      
      if (process.env.NODE_ENV === 'development') {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
      
      process.exit(1);
    }
  }

  parseArguments() {
    const args = process.argv.slice(2);
    const options = {
      directory: null,
      enableDryRun: false,
      autoApplyFileRenames: false,
      confidenceThreshold: 0.7,
      matchingThreshold: 0.8,
      batchSize: 10,
      maxConcurrency: 3,
      enableBackups: true,
      maxRetries: 3,
      help: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg === '--help' || arg === '-h') {
        options.help = true;
      } else if (arg === '--dry-run') {
        options.enableDryRun = true;
      } else if (arg === '--auto-rename') {
        options.autoApplyFileRenames = true;
      } else if (arg === '--no-backups') {
        options.enableBackups = false;
      } else if (arg === '--confidence-threshold') {
        options.confidenceThreshold = parseFloat(args[++i]) || 0.7;
      } else if (arg === '--matching-threshold') {
        options.matchingThreshold = parseFloat(args[++i]) || 0.8;
      } else if (arg === '--batch-size') {
        options.batchSize = parseInt(args[++i]) || 10;
      } else if (arg === '--max-concurrency') {
        options.maxConcurrency = parseInt(args[++i]) || 3;
      } else if (arg === '--max-retries') {
        options.maxRetries = parseInt(args[++i]) || 3;
      } else if (!arg.startsWith('--') && !options.directory) {
        options.directory = path.resolve(arg);
      }
    }

    return options;
  }

  setupEventListeners() {
    this.orchestrator.on('step-completed', (step, result) => {
      console.log(`✅ Step completed: ${step}`);
    });

    this.orchestrator.on('progress', (progress) => {
      const percentage = progress.percentage;
      const progressBar = this.createProgressBar(percentage);
      process.stdout.write(`\r   ${progressBar} ${percentage}% (${progress.processed}/${progress.total})`);
      
      if (percentage === 100) {
        console.log(''); // New line after completion
      }
    });

    this.orchestrator.on('pipeline-completed', (report) => {
      console.log('\n🎉 Pipeline completed successfully!');
    });

    this.orchestrator.on('pipeline-failed', (errorReport) => {
      console.log('\n💥 Pipeline failed');
    });
  }

  createProgressBar(percentage) {
    const barLength = 20;
    const filledLength = Math.round((percentage / 100) * barLength);
    const emptyLength = barLength - filledLength;
    
    return '█'.repeat(filledLength) + '░'.repeat(emptyLength);
  }

  displayFinalSummary(result) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 INVENTORY AUTOMATION SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`🆔 Pipeline ID: ${result.pipelineId}`);
    console.log(`⏱️  Execution Time: ${(result.executionTime / 1000).toFixed(1)}s`);
    console.log(`📦 Total Items: ${result.summary.totalItems}`);
    console.log(`✅ Processed: ${result.summary.processedItems}`);
    console.log(`📈 Success Rate: ${result.summary.successRate.toFixed(1)}%`);
    
    if (result.summary.errors.length > 0) {
      console.log(`❌ Errors: ${result.summary.errors.length}`);
    }
    
    console.log('\n📋 Step Performance:');
    for (const [step, time] of Object.entries(result.performance.stepTimes)) {
      console.log(`   ${step}: ${(time / 1000).toFixed(1)}s`);
    }
    
    console.log(`\n📄 Detailed report saved to workflow reports`);
    console.log('='.repeat(60));
  }

  showHelp() {
    console.log(`
🤖 Inventory Automation Manager

USAGE:
  node scripts/production/manage-inventory.js [directory] [options]

ARGUMENTS:
  directory                 Source directory containing images to process

OPTIONS:
  --help, -h               Show this help message
  --dry-run                Run in preview mode without making changes
  --auto-rename            Automatically apply file renames
  --no-backups             Disable backup creation during file operations
  --confidence-threshold   Minimum confidence for image analysis (default: 0.7)
  --matching-threshold     Minimum score for catalog item matching (default: 0.8)
  --batch-size            Number of images per batch (default: 10)
  --max-concurrency       Maximum concurrent operations (default: 3)
  --max-retries           Maximum retry attempts for failed operations (default: 3)

EXAMPLES:
  # Basic usage - process all images in assets/images
  node scripts/production/manage-inventory.js assets/images

  # Dry run with custom confidence threshold
  node scripts/production/manage-inventory.js assets/images --dry-run --confidence-threshold 0.8

  # Auto-apply file renames with backups
  node scripts/production/manage-inventory.js assets/images --auto-rename

  # High-confidence mode with smaller batches
  node scripts/production/manage-inventory.js assets/images --confidence-threshold 0.9 --batch-size 5

PIPELINE STEPS:
  1. 📸 Image Discovery      - Find and validate image files
  2. 🔍 Image Analysis       - Extract product metadata using AI
  3. 🔗 Product Grouping     - Group similar products together
  4. 📝 Filename Generation  - Create SEO-friendly filenames
  5. 🏪 Catalog Integration  - Smart-match and upload to Square

REPORTS:
  Detailed execution reports are saved to the 'reports' directory with
  performance metrics, error details, and step-by-step results.

For more information, see the project documentation.
`);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new InventoryManager();
  manager.main().catch(console.error);
}

export { InventoryManager };
