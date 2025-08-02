import { SquareClient, SquareEnvironment } from 'square';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../src/config/index.js';

/**
 * Script to integrate with Square POS for uploading product images and managing items
 * Uses the latest Square SDK version 43.0.1
 */

(async function integrateSquare() {
    try {
        // Initialize Square Client
        const client = new SquareClient({
            environment: SquareEnvironment.Production,
            accessToken: process.env.SQUARE_ACCESS_TOKEN,
            version: "2025-07-16",
            timeout: 5000,
        });

        const { catalogApi } = client;

        // Load processed analysis results
        const resultsPath = path.join(config.filesystem.imageOutputDir, 'analysis_results.json');
        if (!await fs.pathExists(resultsPath)) {
            console.error(`❌ Analysis results not found at: ${resultsPath}`);
            process.exit(1);
        }

        console.log(`📂 Loading analysis results from: ${resultsPath}`);
        const data = await fs.readJson(resultsPath);
        const analysisResults = data.analysisResults || [];

        console.log(`🔄 Integrating ${analysisResults.length} products with Square...`);

        // Iterate over the analysis results and upload images/create items
        for (const product of analysisResults) {
            const { productName: name, category, productData, metadata } = product;
            if (!name || !metadata?.imagePath) continue;

            try {
                // Load the image file
                const imagePath = path.join(config.filesystem.imageSourceDir, metadata.imagePath);
                if (!await fs.pathExists(imagePath)) {
                    console.warn(`⚠ Image file not found at: ${imagePath}`);
                    continue;
                }
                const imageBuffer = await fs.readFile(imagePath);

                // Upload the image to Square Catalog
                const uploadImageResponse = await catalogApi.createCatalogImage({
                    image: imageBuffer,
                    name,
                    idempotencyKey: new Date().toISOString(),
                });
                const imageObject = uploadImageResponse.image;
                console.log(`🖼️ Uploaded image for ${name}: ${imageObject.id}`);

                // Create the item in the Square catalog
                const catalogObjectResponse = await catalogApi.upsertCatalogObject({
                    idempotencyKey: new Date().toISOString(),
                    object: {
                        type: 'ITEM',
                        id: `#${name.replace(/\s+/g, '-')}`,
                        itemData: {
                            name,
                            description: productData?.description,
                            categoryId: category,
                            imageId: imageObject.id,
                            variations: [],
                        },
                    },
                });
                console.log(`✅ Item created/updated in catalog: ${catalogObjectResponse.object.id}`);

            } catch (error) {
                console.warn(`⚠ Failed to upload item or image for ${name}: ${error.message}`);
            }
        }

        console.log('🎉 Square POS integration completed successfully!');

    } catch (error) {
        console.error('❌ An error occurred during integration:', error.message);
        process.exit(1);
    }
})();
