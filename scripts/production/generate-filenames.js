#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { config } from '../src/config/index.js';
import { FileNamingAgent } from '../src/agents/FileNamingAgent.js';

/**
 * Script to generate normalized filenames from existing analysis results
 * Usage: node scripts/generate-filenames.js [--apply] [--backup]
 */

(async function generateFilenames() {
  try {
    const args = process.argv.slice(2);
    const shouldApply = args.includes('--apply');
    const shouldBackup = args.includes('--backup') || true; // Default to backup
    const dryRun = !shouldApply;

    console.log('🏷️  File Naming Agent - Generate Normalized Filenames\n');

    // Initialize the FileNamingAgent
    const fileNamingAgent = new FileNamingAgent();

    // Load existing analysis results
    const resultsPath = path.join(config.filesystem.imageOutputDir, 'analysis_results.json');
    
    if (!await fs.pathExists(resultsPath)) {
      console.error(`❌ Analysis results not found at: ${resultsPath}`);
      console.log('💡 Run "pnpm run manage-images" first to generate analysis results.');
      process.exit(1);
    }

    console.log(`📂 Loading analysis results from: ${resultsPath}`);
    const data = await fs.readJson(resultsPath);
    const analysisResults = data.analysisResults || [];

    if (analysisResults.length === 0) {
      console.error('❌ No analysis results found in the file.');
      process.exit(1);
    }

    console.log(`📊 Found ${analysisResults.length} products to process\n`);

    // Generate normalized filenames
    const { results: filenameResults, errors } = await fileNamingAgent.generateFilenames(analysisResults);

    if (filenameResults.length === 0) {
      console.error('❌ No filenames were generated successfully.');
      process.exit(1);
    }

    console.log('\n📋 Generated Filenames Preview:');
    console.log(''.padEnd(80, '='));
    
    // Show sample of results
    const sampleSize = Math.min(10, filenameResults.length);
    for (let i = 0; i < sampleSize; i++) {
      const item = filenameResults[i];
      console.log(`${item.category.padEnd(15)} | ${item.originalFilename}`);
      console.log(`${' '.padEnd(15)} → ${item.newFilename}\n`);
    }

    if (filenameResults.length > sampleSize) {
      console.log(`... and ${filenameResults.length - sampleSize} more\n`);
    }

    // Save filename mapping to JSON file
    const outputDir = config.filesystem.imageOutputDir;
    const filenameMapPath = path.join(outputDir, 'filename_mapping.json');
    
    const filenameMapping = {
      generatedAt: new Date().toISOString(),
      totalProducts: analysisResults.length,
      successfulMappings: filenameResults.length,
      errors: errors.length,
      mappings: filenameResults,
      errorDetails: errors
    };

    await fs.writeJson(filenameMapPath, filenameMapping, { spaces: 2 });
    console.log(`💾 Filename mapping saved to: ${filenameMapPath}`);

    // Apply renaming if requested
    if (shouldApply && !dryRun) {
      console.log('\n🔄 Applying filename changes...');
      
      const sourceDir = config.filesystem.imageSourceDir;
      const renamingResults = await fileNamingAgent.applyRenaming(
        filenameResults, 
        sourceDir, 
        shouldBackup
      );

      // Update the filename mapping with actual results
      filenameMapping.renamingResults = renamingResults;
      filenameMapping.appliedAt = new Date().toISOString();
      await fs.writeJson(filenameMapPath, filenameMapping, { spaces: 2 });

      console.log('\n✅ Filename normalization completed!');
      
      if (renamingResults.backupPath) {
        console.log(`📦 Original files backed up to: ${renamingResults.backupPath}`);
      }
      
    } else {
      console.log('\n💡 Preview Mode - No files were renamed');
      console.log('💡 To apply changes, run: node scripts/generate-filenames.js --apply');
      console.log('💡 To apply with backup: node scripts/generate-filenames.js --apply --backup');
    }

    // Show summary statistics
    console.log('\n📊 Summary Statistics:');
    console.log(''.padEnd(50, '-'));
    console.log(`Total products analyzed: ${analysisResults.length}`);
    console.log(`Filenames generated: ${filenameResults.length}`);
    console.log(`Generation errors: ${errors.length}`);
    
    if (shouldApply && !dryRun) {
      const renamed = filenameMapping.renamingResults?.renamed?.length || 0;
      const renamingErrors = filenameMapping.renamingResults?.errors?.length || 0;
      console.log(`Files successfully renamed: ${renamed}`);
      console.log(`Renaming errors: ${renamingErrors}`);
    }

    console.log('\n🎉 Process completed successfully!');

  } catch (error) {
    console.error('\n❌ An error occurred during filename generation:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
