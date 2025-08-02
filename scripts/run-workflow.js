import fs from 'fs-extra';
import path from 'path';
import { config } from '../src/config/index.js';
import ImageAnalysisAgent from '../src/agents/ImageAnalysisAgent.js';
import GroupingAgent from '../src/agents/GroupingAgent.js';
import { filterImagePaths, filterAnalysisResults } from '../src/utils/imageFilter.js';

(async function runWorkflow() {
  try {
    const imageAnalysisAgent = new ImageAnalysisAgent();
    const groupingAgent = new GroupingAgent();

    // Recursively find all image files in the source directory
    const sourceDir = config.filesystem.imageSourceDir;
    const imageFiles = [];
    const categoryHints = {};
    
    async function findImagesRecursively(dir, categoryHint = null) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Use directory name as category hint
          const dirCategoryHint = entry.name.replace(/[-_]/g, ' ');
          await findImagesRecursively(fullPath, dirCategoryHint);
        } else if (entry.isFile() && config.workflow.supportedImageExtensions.includes(path.extname(entry.name).toLowerCase())) {
          imageFiles.push(fullPath);
          if (categoryHint) {
            categoryHints[fullPath] = categoryHint;
          }
        }
      }
    }
    
    await findImagesRecursively(sourceDir);

    // Filter out non-product images before analysis
    console.log(`Found ${imageFiles.length} image files, filtering non-product images...`);
    const imageFilterResult = filterImagePaths(imageFiles);
    
    if (imageFilterResult.excluded.length > 0) {
      console.log(`🔍 Filtered out ${imageFilterResult.excluded.length} non-product images:`);
      imageFilterResult.excluded.forEach(item => {
        console.log(`  - ${path.basename(item.path)}: ${item.reason}`);
      });
    }
    
    console.log(`📸 Processing ${imageFilterResult.filtered.length} product images...`);
    
    // Filter category hints to match filtered images
    const filteredCategoryHints = {};
    imageFilterResult.filtered.forEach(imagePath => {
      if (categoryHints[imagePath]) {
        filteredCategoryHints[imagePath] = categoryHints[imagePath];
      }
    });

    // Analyze images (only filtered product images)
    const rawAnalysisResults = await imageAnalysisAgent.analyzeImages(imageFilterResult.filtered, filteredCategoryHints);

    // Apply secondary filtering based on analysis results (catches AI-detected non-products)
    const analysisFilterResult = filterAnalysisResults(rawAnalysisResults);
    
    if (analysisFilterResult.excluded.length > 0) {
      console.log(`🤖 AI detected ${analysisFilterResult.excluded.length} additional non-product items:`);
      analysisFilterResult.excluded.forEach(item => {
        console.log(`  - ${item.productName}: ${item.filterReason}`);
      });
    }
    
    const analysisResults = analysisFilterResult.filtered;
    console.log(`✅ Final product count: ${analysisResults.length} items`);

    // Group analyzed products
    const groupingResults = await groupingAgent.groupProducts(analysisResults);

    // Write results to the output directory
    const outputDir = config.filesystem.imageOutputDir;
    await fs.ensureDir(outputDir);
    const outputPath = path.join(outputDir, 'analysis_results.json');

    if (!config.app.enableDryRun) {
      const outputData = {
        analysisResults,
        groupingResults,
        filteringMetadata: {
          totalImagesFound: imageFiles.length,
          imagesFiltered: imageFilterResult.excluded.length,
          analysisFiltered: analysisFilterResult.excluded.length,
          finalProductCount: analysisResults.length,
          excludedImages: imageFilterResult.excluded,
          excludedAnalysis: analysisFilterResult.excluded,
          processedAt: new Date().toISOString()
        }
      };
      
      await fs.writeJson(outputPath, outputData, { spaces: 2 });
      console.log(`Results written to ${outputPath}`);
    } else {
      console.log(`[DRY RUN] Would write results to ${outputPath}`);
    }

    console.log('✓ Workflow completed successfully.');
  } catch (error) {
    console.error('An error occurred during the workflow:', error);
  }
})();
