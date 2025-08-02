#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Spocket Image Downloader - Server-side solution for CORS issues
 * 
 * This script downloads images from URLs extracted by the Spocket scraper.
 * It bypasses CORS restrictions by running server-side.
 */

class SpocketImageDownloader {
    constructor() {
        this.downloadDir = path.join(__dirname, '..', 'downloaded-images');
        this.maxRetries = 3;
        this.delayBetweenDownloads = 1000; // 1 second
    }

    /**
     * Download an image from URL
     * @param {Object} imageData - Image data from Spocket scraper
     * @param {string} targetDir - Target directory for download
     * @returns {Promise<Object>} Download result
     */
    async downloadImage(imageData, targetDir = null) {
        const targetDirectory = targetDir || path.join(this.downloadDir, imageData.category);
        await fs.ensureDir(targetDirectory);

        const filePath = path.join(targetDirectory, imageData.filename);
        
        console.log(`⬇️ Downloading: ${imageData.filename}`);
        console.log(`   URL: ${imageData.url}`);
        console.log(`   Target: ${filePath}`);

        return new Promise((resolve, reject) => {
            const protocol = imageData.url.startsWith('https:') ? https : http;
            
            const request = protocol.get(imageData.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            }, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    // Handle redirects
                    const redirectUrl = response.headers.location;
                    console.log(`   Redirecting to: ${redirectUrl}`);
                    
                    const redirectedImageData = { ...imageData, url: redirectUrl };
                    this.downloadImage(redirectedImageData, targetDir)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    return;
                }

                const fileSize = parseInt(response.headers['content-length'] || '0');
                const contentType = response.headers['content-type'] || '';

                // Validate content type
                if (!contentType.startsWith('image/')) {
                    reject(new Error(`Invalid content type: ${contentType}`));
                    return;
                }

                // Validate file size (max 10MB)
                if (fileSize > 10 * 1024 * 1024) {
                    reject(new Error(`File too large: ${Math.round(fileSize / 1024 / 1024)}MB`));
                    return;
                }

                const writeStream = fs.createWriteStream(filePath);
                let downloadedBytes = 0;

                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (fileSize > 0) {
                        const progress = Math.round((downloadedBytes / fileSize) * 100);
                        process.stdout.write(`\r   Progress: ${progress}% (${downloadedBytes}/${fileSize} bytes)`);
                    }
                });

                response.on('end', () => {
                    console.log(`\n   ✅ Downloaded: ${imageData.filename} (${downloadedBytes} bytes)`);
                    resolve({
                        success: true,
                        filename: imageData.filename,
                        filePath,
                        fileSize: downloadedBytes,
                        contentType,
                        originalUrl: imageData.url
                    });
                });

                response.on('error', (error) => {
                    reject(new Error(`Download error: ${error.message}`));
                });

                response.pipe(writeStream);

                writeStream.on('error', (error) => {
                    reject(new Error(`Write error: ${error.message}`));
                });
            });

            request.on('error', (error) => {
                reject(new Error(`Request error: ${error.message}`));
            });

            request.setTimeout(30000, () => {
                request.destroy();
                reject(new Error('Download timeout'));
            });
        });
    }

    /**
     * Download multiple images with retry logic
     * @param {Array} imageDataArray - Array of image data objects
     * @param {Object} options - Download options
     * @returns {Promise<Object>} Results summary
     */
    async downloadImages(imageDataArray, options = {}) {
        const config = {
            maxConcurrency: 3,
            retryCount: this.maxRetries,
            delayMs: this.delayBetweenDownloads,
            targetDir: null,
            ...options
        };

        console.log(`🚀 Starting download of ${imageDataArray.length} images...`);
        console.log(`   Download directory: ${config.targetDir || this.downloadDir}`);
        console.log(`   Max concurrent downloads: ${config.maxConcurrency}`);
        console.log(`   Retry attempts: ${config.retryCount}`);

        const results = {
            successful: [],
            failed: [],
            totalImages: imageDataArray.length,
            startTime: new Date()
        };

        // Process images in batches to avoid overwhelming the server
        for (let i = 0; i < imageDataArray.length; i += config.maxConcurrency) {
            const batch = imageDataArray.slice(i, i + config.maxConcurrency);
            
            console.log(`\n📦 Processing batch ${Math.floor(i / config.maxConcurrency) + 1} (${batch.length} images)...`);

            const batchPromises = batch.map(async (imageData, batchIndex) => {
                const globalIndex = i + batchIndex + 1;
                
                for (let attempt = 1; attempt <= config.retryCount; attempt++) {
                    try {
                        console.log(`\n[${globalIndex}/${imageDataArray.length}] ${attempt > 1 ? `Retry ${attempt}:` : ''}`);
                        
                        const result = await this.downloadImage(imageData, config.targetDir);
                        results.successful.push({
                            index: globalIndex,
                            ...result,
                            metadata: imageData
                        });
                        
                        return result;
                        
                    } catch (error) {
                        console.error(`   ❌ Attempt ${attempt} failed: ${error.message}`);
                        
                        if (attempt === config.retryCount) {
                            results.failed.push({
                                index: globalIndex,
                                filename: imageData.filename,
                                url: imageData.url,
                                error: error.message,
                                attempts: attempt
                            });
                        } else {
                            // Wait before retry
                            await this.sleep(config.delayMs);
                        }
                    }
                }
            });

            // Wait for batch to complete
            await Promise.allSettled(batchPromises);

            // Delay between batches
            if (i + config.maxConcurrency < imageDataArray.length) {
                console.log(`\n⏳ Waiting ${config.delayMs}ms before next batch...`);
                await this.sleep(config.delayMs);
            }
        }

        results.endTime = new Date();
        results.duration = results.endTime - results.startTime;

        this.printSummary(results);
        await this.saveResults(results);

        return results;
    }

    /**
     * Load image data from JSON file (exported from Spocket scraper)
     * @param {string} jsonFilePath - Path to JSON file
     * @returns {Promise<Array>} Array of image data objects
     */
    async loadImageDataFromJSON(jsonFilePath) {
        try {
            // Check if path is relative and make it absolute
            const fullPath = path.isAbsolute(jsonFilePath) 
                ? jsonFilePath 
                : path.resolve(process.cwd(), jsonFilePath);
            
            console.log(`📄 Loading image data from: ${fullPath}`);
            
            // Check if file exists
            if (!(await fs.pathExists(fullPath))) {
                throw new Error(`JSON file not found: ${fullPath}\n\n💡 To generate this file:\n1. Go to spocket.co in Chrome\n2. Run the browser scraper script\n3. It will download spocket-scraped-images.json\n4. Move it to your project directory`);
            }
            
            const jsonData = await fs.readJSON(fullPath);
            const images = jsonData.productImages || jsonData;
            
            if (!Array.isArray(images)) {
                throw new Error('Invalid JSON format: expected array of image objects');
            }
            
            console.log(`   Found ${images.length} images to download`);
            return images;
            
        } catch (error) {
            throw new Error(`Failed to load JSON: ${error.message}`);
        }
    }

    /**
     * Create image data from URLs (for quick testing)
     * @param {Array} urls - Array of image URLs
     * @returns {Array} Array of image data objects
     */
    createImageDataFromUrls(urls) {
        return urls.map((url, index) => {
            const filename = this.generateFilenameFromUrl(url, index);
            return {
                index: index + 1,
                url,
                originalUrl: url,
                filename,
                alt: '',
                category: 'miscellaneous-products',
                productName: `Product ${index + 1}`,
                description: '',
                price: '',
                dimensions: { width: 0, height: 0 }
            };
        });
    }

    /**
     * Generate filename from URL
     * @param {string} url - Image URL
     * @param {number} index - Image index
     * @returns {string} Generated filename
     */
    generateFilenameFromUrl(url, index) {
        const urlParts = url.split('/');
        const originalFilename = urlParts[urlParts.length - 1].split('?')[0];
        const extension = path.extname(originalFilename) || '.jpg';
        const timestamp = Date.now();
        
        return `spocket-image-${index + 1}-${timestamp}${extension}`;
    }

    /**
     * Print download summary
     * @param {Object} results - Download results
     */
    printSummary(results) {
        const successRate = results.totalImages > 0 
            ? (results.successful.length / results.totalImages * 100).toFixed(1)
            : 0;
        
        console.log(`\n\n📊 Download Summary:`);
        console.log(`   📦 Total Images: ${results.totalImages}`);
        console.log(`   ✅ Successful: ${results.successful.length}`);
        console.log(`   ❌ Failed: ${results.failed.length}`);
        console.log(`   📈 Success Rate: ${successRate}%`);
        console.log(`   ⏱️ Duration: ${Math.round(results.duration / 1000)}s`);
        
        if (results.successful.length > 0) {
            const totalSize = results.successful.reduce((sum, item) => sum + item.fileSize, 0);
            console.log(`   💾 Total Downloaded: ${Math.round(totalSize / 1024)}KB`);
        }
        
        if (results.failed.length > 0) {
            console.log(`\n❌ Failed Downloads:`);
            results.failed.forEach(failure => {
                console.log(`   - ${failure.filename}: ${failure.error}`);
            });
        }
    }

    /**
     * Save results to JSON file
     * @param {Object} results - Download results
     */
    async saveResults(results) {
        try {
            await fs.ensureDir('./logs');
            const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
            const logFile = `./logs/spocket-download-${timestamp}.json`;
            
            await fs.writeJSON(logFile, results, { spaces: 2 });
            console.log(`\n💾 Results saved to: ${logFile}`);
            
        } catch (error) {
            console.error(`❌ Failed to save results: ${error.message}`);
        }
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI interface
async function main() {
    const downloader = new SpocketImageDownloader();
    
    try {
        const args = process.argv.slice(2);
        
        if (args.length === 0 || args[0] === '--help') {
            console.log('Spocket Image Downloader');
            console.log('');
            console.log('Usage:');
            console.log('  node scripts/download-spocket-images.js --json <file>     # Download from JSON file');
            console.log('  node scripts/download-spocket-images.js --urls <url1> <url2> ...  # Download from URLs');
            console.log('');
            console.log('Options:');
            console.log('  --json <file>         JSON file from Spocket scraper');
            console.log('  --urls <url1> <url2>  Space-separated list of URLs');
            console.log('  --dir <directory>     Custom download directory');
            console.log('  --concurrent <n>      Max concurrent downloads (default: 3)');
            console.log('');
            console.log('Examples:');
            console.log('  node scripts/download-spocket-images.js --json spocket-scraped-images.json');
            console.log('  node scripts/download-spocket-images.js --urls "https://example.com/img1.jpg" "https://example.com/img2.jpg"');
            process.exit(0);
        }

        let imageData = [];
        let targetDir = null;
        let maxConcurrency = 3;

        // Parse arguments
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--json' && i + 1 < args.length) {
                const jsonFile = args[i + 1];
                imageData = await downloader.loadImageDataFromJSON(jsonFile);
                i++; // Skip next argument
                
            } else if (args[i] === '--urls') {
                const urls = args.slice(i + 1);
                if (urls.length === 0) {
                    throw new Error('No URLs provided after --urls');
                }
                imageData = downloader.createImageDataFromUrls(urls);
                break; // URLs are the last arguments
                
            } else if (args[i] === '--dir' && i + 1 < args.length) {
                targetDir = args[i + 1];
                i++; // Skip next argument
                
            } else if (args[i] === '--concurrent' && i + 1 < args.length) {
                maxConcurrency = parseInt(args[i + 1]);
                if (isNaN(maxConcurrency) || maxConcurrency < 1) {
                    throw new Error('Invalid concurrency value');
                }
                i++; // Skip next argument
            }
        }

        if (imageData.length === 0) {
            throw new Error('No image data provided. Use --json or --urls');
        }

        // Start downloads
        const results = await downloader.downloadImages(imageData, {
            targetDir,
            maxConcurrency
        });

        if (results.successful.length > 0) {
            console.log('\n🎉 Downloads completed!');
            console.log(`📁 Images saved to: ${targetDir || downloader.downloadDir}`);
        } else {
            console.log('\n💥 All downloads failed!');
            process.exit(1);
        }

    } catch (error) {
        console.error('💥 Error:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { SpocketImageDownloader };
