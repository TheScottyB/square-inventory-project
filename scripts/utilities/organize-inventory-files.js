#!/usr/bin/env node

/**
 * Organize Inventory Files
 * 
 * This script uses the FileOrganizationAgent to analyze and organize
 * all inventory-related files into a logical folder structure.
 * 
 * Features:
 * - Groups files by type (catalogs, images, documents, etc.)
 * - Organizes by business entity (RRV, TBDL, TVM, DrDZB)
 * - Creates date-based folders for versioning
 * - Dry run mode for safety
 * 
 * Usage:
 *   pnpm run organize:inventory           # Dry run (preview changes)
 *   pnpm run organize:inventory:execute   # Actually move files
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { FileOrganizationAgent } from '../../src/agents/FileOrganizationAgent.js';
import { logger } from '../../src/utils/logger.js';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

async function main() {
  const isDryRun = !process.argv.includes('--execute');
  
  logger.info('🗂️  Starting Inventory File Organization', {
    mode: isDryRun ? 'DRY RUN' : 'EXECUTE',
    projectRoot
  });
  
  try {
    // Initialize the agent
    const agent = new FileOrganizationAgent({
      rootDir: projectRoot,
      targetDir: 'organized-inventory',
      dryRun: isDryRun
    });
    
    // Listen to events
    agent.on('analysis:complete', (analysis) => {
      logger.info('📊 File Analysis Complete:', {
        totalFiles: analysis.totalFiles,
        categories: Object.keys(analysis.categorizedFiles).map(cat => ({
          category: cat,
          count: analysis.categorizedFiles[cat].length
        })),
        uncategorized: analysis.uncategorizedFiles.length,
        businessEntities: Object.keys(analysis.businessEntityFiles).map(entity => ({
          entity,
          count: analysis.businessEntityFiles[entity].length
        }))
      });
    });
    
    agent.on('organization:complete', async (report) => {
      logger.info('✅ Organization Complete:', report.summary);
      
      // Save report
      const reportPath = join(projectRoot, 'reports', `file-organization-${Date.now()}.json`);
      await fs.mkdir(join(projectRoot, 'reports'), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      
      logger.info('📄 Report saved to:', reportPath);
      
      // Show category summary
      console.log('\n📁 Files Organized by Category:');
      for (const [category, count] of Object.entries(report.categorySummary)) {
        console.log(`  ${category}: ${count} files`);
      }
      
      // Show business entity summary
      if (Object.keys(report.businessEntitySummary).length > 0) {
        console.log('\n🏢 Files by Business Entity:');
        for (const [entity, count] of Object.entries(report.businessEntitySummary)) {
          console.log(`  ${entity}: ${count} files`);
        }
      }
      
      if (isDryRun) {
        console.log('\n⚠️  This was a DRY RUN - no files were actually moved');
        console.log('To execute the organization, run: pnpm run organize:inventory:execute');
      } else {
        console.log('\n✅ Files have been organized successfully!');
      }
    });
    
    agent.on('analysis:error', (error) => {
      logger.error('Analysis failed:', error);
    });
    
    agent.on('organization:error', (error) => {
      logger.error('Organization failed:', error);
    });
    
    // Step 1: Analyze current structure
    logger.info('🔍 Analyzing current file structure...');
    const analysis = await agent.analyzeFileStructure();
    
    // Show recommended structure
    console.log('\n📋 Recommended Folder Structure:');
    printStructure(analysis.recommendedStructure);
    
    // Step 2: Organize files
    if (analysis.totalFiles === 0) {
      logger.warn('No files found to organize');
      return;
    }
    
    if (isDryRun || await confirmProceed(analysis)) {
      logger.info('🚀 Starting file organization...');
      await agent.organizeFiles(analysis);
    } else {
      logger.info('❌ Organization cancelled by user');
    }
    
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Print folder structure recursively
 */
function printStructure(obj, indent = '') {
  for (const [key, value] of Object.entries(obj)) {
    console.log(`${indent}├── ${key}`);
    if (typeof value === 'object') {
      printStructure(value, indent + '│   ');
    } else if (typeof value === 'string') {
      console.log(`${indent}│   └── (${value})`);
    }
  }
}

/**
 * Confirm with user before proceeding
 */
async function confirmProceed(analysis) {
  if (process.env.CI || process.env.NON_INTERACTIVE) {
    return true;
  }
  
  console.log(`\n⚠️  This will organize ${analysis.totalFiles} files`);
  console.log('Continue? (y/N): ');
  
  return new Promise((resolve) => {
    process.stdin.once('data', (data) => {
      const answer = data.toString().trim().toLowerCase();
      resolve(answer === 'y' || answer === 'yes');
    });
  });
}

// Run the script
main().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});