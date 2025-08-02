import fs from 'fs-extra';
import path from 'path';
import { config } from '../src/config/index.js';
import ImageAnalysisAgent from '../src/agents/ImageAnalysisAgent.js';
import GroupingAgent from '../src/agents/GroupingAgent.js';

(async function runWorkflow() {
  try {
    const imageAnalysisAgent = new ImageAnalysisAgent();
    const groupingAgent = new GroupingAgent();

    // Recursively find all image files in the source directory
    const sourceDir = config.filesystem.imageSourceDir;
    const imageFiles = (await fs.readdir(sourceDir, { withFileTypes: true }))
      .filter(dirent => dirent.isFile() && config.workflow.supportedImageExtensions.includes(path.extname(dirent.name).toLowerCase()))
      .map(dirent => path.join(sourceDir, dirent.name));

    // Map images to their directory-based category hints
    const categoryHints = {};

    // Analyze images
    const analysisResults = await imageAnalysisAgent.analyzeImages(imageFiles, categoryHints);

    // Group analyzed products
    const groupingResults = await groupingAgent.groupProducts(analysisResults);

    // Write results to the output directory
    const outputDir = config.filesystem.imageOutputDir;
    await fs.ensureDir(outputDir);
    const outputPath = path.join(outputDir, 'analysis_results.json');

    if (!config.app.enableDryRun) {
      await fs.writeJson(outputPath, { analysisResults, groupingResults }, { spaces: 2 });
      console.log(`Results written to ${outputPath}`);
    } else {
      console.log(`[DRY RUN] Would write results to ${outputPath}`);
    }

    console.log('✓ Workflow completed successfully.');
  } catch (error) {
    console.error('An error occurred during the workflow:', error);
  }
})();
