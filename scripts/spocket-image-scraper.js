/**
 * Spocket.co Product Image Scraper for Chrome Dev Console
 * 
 * USAGE INSTRUCTIONS:
 * 1. Navigate to spocket.co and log in
 * 2. Go to any product listing page, search results, or individual product page
 * 3. Open Chrome Dev Tools (F12) and go to Console tab
 * 4. Copy and paste this entire script into the console
 * 5. Run one of these commands:
 *    - SpocketScraper.analyzePageStructure() - Analyze page structure first
 *    - SpocketScraper.scrapeImages() - Extract and download all product images
 *    - SpocketScraper.scrapeImages({ downloadMode: 'urls' }) - Just get URLs without downloading
 *    - SpocketScraper.scrapeImages({ maxImages: 10 }) - Limit to 10 images
 *    - SpocketScraper.scrapeImages({ confirmEach: true }) - Confirm each download
 * 
 * The script will:
 * - Find all product images on the page
 * - Filter out logos, icons, UI elements, and marketing content
 * - Extract product metadata (name, description, price)
 * - Download images or provide URLs for your Square inventory system
 * - Generate JSON output compatible with your existing Square catalog scripts
 */

window.SpocketScraper = (function() {
    'use strict';

    // Configuration based on your existing imageFilter.js patterns
    const FILTER_CONFIG = {
        // Spocket-specific UI/branding patterns to exclude
        spocketPatterns: [
            /spocket.*logo/i,
            /brand.*logo/i,
            /company.*logo/i,
            /supplier.*logo/i,
            /avatar/i,
            /profile/i,
            /header/i,
            /footer/i,
            /sidebar/i,
            /navigation/i,
            /menu/i,
            /search.*icon/i,
            /filter.*icon/i,
            /sort.*icon/i
        ],

        // URL patterns that indicate non-product images
        urlPatterns: [
            /logo/i,
            /icon/i,
            /sprite/i,
            /favicon/i,
            /banner/i,
            /ad/i,
            /advertisement/i,
            /promo/i,
            /marketing/i,
            /ui/i,
            /interface/i,
            /arrow/i,
            /button/i,
            /background/i,
            /bg/i,
            /placeholder/i,
            /loading/i,
            /spinner/i,
            /avatar/i,
            /profile/i,
            /thumb/i // Often low-res thumbnails
        ],

        // Filename patterns to exclude
        filenamePatterns: [
            /^(logo|icon|sprite|favicon|banner|ad|promo)/i,
            /\.(svg)$/i, // SVG files are usually UI elements
            /_icon\./i,
            /_logo\./i,
            /_banner\./i,
            /_bg\./i,
            /_button\./i
        ],

        // Alt text patterns that indicate non-product content
        altTextPatterns: [
            /logo/i,
            /icon/i,
            /button/i,
            /arrow/i,
            /loading/i,
            /spinner/i,
            /placeholder/i,
            /avatar/i,
            /profile/i
        ],

        // Minimum dimensions for product images
        minWidth: 100,
        minHeight: 100,

        // Maximum file size (10MB)
        maxFileSize: 10 * 1024 * 1024
    };

    // Category mapping based on your existing project structure
    const CATEGORY_MAPPING = {
        'jewelry': ['jewelry', 'bracelet', 'necklace', 'ring', 'earring', 'pendant', 'chain', 'crystal', 'gem', 'stone'],
        'candles-holders': ['candle', 'holder', 'incense', 'burner', 'scented', 'aromatherapy', 'wax', 'wick'],
        'first-aid-kits': ['first aid', 'medical', 'health', 'safety', 'emergency', 'kit', 'bandage', 'medicine'],
        'shoes-sneakers': ['shoe', 'sneaker', 'boot', 'sandal', 'heel', 'flat', 'athletic', 'running', 'walking'],
        'pet-products': ['pet', 'dog', 'cat', 'bowl', 'toy', 'collar', 'leash', 'bed', 'treat', 'food'],
        'crystal-bowls': ['crystal', 'singing bowl', 'meditation', 'healing', 'quartz', 'amethyst', 'bowl'],
        'holographic-purses': ['purse', 'bag', 'handbag', 'holographic', 'hologram', 'iridescent', 'metallic'],
        'miscellaneous-products': [] // Default fallback
    };

    /**
     * Analyze the current page structure to understand DOM patterns
     */
    function analyzePageStructure() {
        console.log('🔍 Analyzing Spocket page structure...');
        
        const analysis = {
            pageType: detectPageType(),
            imageElements: [],
            productCards: [],
            metadata: {}
        };

        // Find all images
        const images = document.querySelectorAll('img');
        console.log(`Found ${images.length} total images on page`);

        images.forEach((img, index) => {
            const rect = img.getBoundingClientRect();
            const imgAnalysis = {
                index,
                src: img.src,
                alt: img.alt,
                width: rect.width,
                height: rect.height,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight,
                className: img.className,
                parentElement: img.parentElement?.tagName,
                parentClass: img.parentElement?.className,
                isVisible: rect.width > 0 && rect.height > 0,
                isLikelyProduct: isLikelyProductImage(img)
            };
            analysis.imageElements.push(imgAnalysis);
        });

        // Try to identify product cards/containers
        const possibleProductSelectors = [
            '[class*="product"]',
            '[class*="item"]',
            '[class*="card"]',
            '[data-product]',
            '[data-item]'
        ];

        possibleProductSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                console.log(`Found ${elements.length} elements matching "${selector}"`);
                analysis.productCards.push({
                    selector,
                    count: elements.length,
                    examples: Array.from(elements).slice(0, 3).map(el => ({
                        className: el.className,
                        innerHTML: el.innerHTML.substring(0, 200) + '...'
                    }))
                });
            }
        });

        console.log('📊 Page Structure Analysis:', analysis);
        return analysis;
    }

    /**
     * Detect what type of Spocket page we're on
     */
    function detectPageType() {
        const url = window.location.href;
        const title = document.title.toLowerCase();
        
        if (url.includes('/product/') || title.includes('product')) {
            return 'product-detail';
        } else if (url.includes('/search') || title.includes('search')) {
            return 'search-results';
        } else if (url.includes('/catalog') || url.includes('/products')) {
            return 'product-listing';
        } else {
            return 'unknown';
        }
    }

    /**
     * Check if an image is likely a product image
     */
    function isLikelyProductImage(img) {
        const rect = img.getBoundingClientRect();
        const src = img.src.toLowerCase();
        const alt = (img.alt || '').toLowerCase();
        const className = (img.className || '').toLowerCase();

        // Size check
        if (rect.width < FILTER_CONFIG.minWidth || rect.height < FILTER_CONFIG.minHeight) {
            return false;
        }

        // URL pattern check
        if (FILTER_CONFIG.urlPatterns.some(pattern => pattern.test(src))) {
            return false;
        }

        // Filename pattern check
        const filename = src.split('/').pop() || '';
        if (FILTER_CONFIG.filenamePatterns.some(pattern => pattern.test(filename))) {
            return false;
        }

        // Alt text pattern check
        if (FILTER_CONFIG.altTextPatterns.some(pattern => pattern.test(alt))) {
            return false;
        }

        // Class name check for UI elements
        if (className.includes('icon') || className.includes('logo') || className.includes('button')) {
            return false;
        }

        return true;
    }

    /**
     * Extract product metadata from image context
     */
    function extractProductMetadata(img) {
        const metadata = {
            productName: '',
            description: '',
            price: '',
            category: 'miscellaneous-products',
            supplier: ''
        };

        // Try to find product name from various sources
        let productName = img.alt || '';
        
        // Look for product title in parent elements
        let parent = img.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
            const titleElement = parent.querySelector('[class*="title"], [class*="name"], h1, h2, h3, h4');
            if (titleElement && titleElement.textContent.trim()) {
                productName = titleElement.textContent.trim();
                break;
            }
            parent = parent.parentElement;
        }

        metadata.productName = productName;

        // Try to find price
        parent = img.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
            const priceElement = parent.querySelector('[class*="price"], [class*="cost"], .price, .cost');
            if (priceElement && priceElement.textContent.trim()) {
                const priceText = priceElement.textContent.trim();
                // Extract price using regex
                const priceMatch = priceText.match(/[\$€£¥][\d,]+\.?\d*/);
                if (priceMatch) {
                    metadata.price = priceMatch[0];
                }
                break;
            }
            parent = parent.parentElement;
        }

        // Try to find description
        parent = img.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
            const descElement = parent.querySelector('[class*="description"], [class*="desc"], p');
            if (descElement && descElement.textContent.trim() && !descElement.textContent.includes('$')) {
                metadata.description = descElement.textContent.trim().substring(0, 200);
                break;
            }
            parent = parent.parentElement;
        }

        // Determine category based on product name and description
        const textToAnalyze = (metadata.productName + ' ' + metadata.description).toLowerCase();
        for (const [category, keywords] of Object.entries(CATEGORY_MAPPING)) {
            if (keywords.some(keyword => textToAnalyze.includes(keyword))) {
                metadata.category = category;
                break;
            }
        }

        return metadata;
    }

    /**
     * Main function to scrape images
     */
    async function scrapeImages(options = {}) {
        const config = {
            downloadMode: 'download', // 'download', 'urls', 'json'
            maxImages: 50,
            confirmEach: false,
            minWidth: FILTER_CONFIG.minWidth,
            minHeight: FILTER_CONFIG.minHeight,
            ...options
        };

        console.log('🚀 Starting Spocket image scraping...', config);

        const results = {
            pageType: detectPageType(),
            totalImages: 0,
            filteredImages: 0,
            productImages: [],
            excludedImages: [],
            errors: []
        };

        try {
            // Find all images
            const allImages = document.querySelectorAll('img');
            results.totalImages = allImages.length;
            console.log(`Found ${allImages.length} total images`);

            // Filter images
            const candidateImages = Array.from(allImages)
                .filter(img => isLikelyProductImage(img))
                .slice(0, config.maxImages);

            results.filteredImages = candidateImages.length;
            console.log(`${candidateImages.length} images passed filtering`);

            // Process each image
            for (let i = 0; i < candidateImages.length; i++) {
                const img = candidateImages[i];
                
                try {
                    const metadata = extractProductMetadata(img);
                    const imageData = {
                        index: i + 1,
                        url: img.src,
                        originalUrl: img.src,
                        filename: generateFilename(metadata, img.src),
                        alt: img.alt || '',
                        dimensions: {
                            width: img.naturalWidth || img.width,
                            height: img.naturalHeight || img.height
                        },
                        ...metadata
                    };

                    // Ask for confirmation if required
                    if (config.confirmEach) {
                        const confirmed = confirm(
                            `Download image ${i + 1}/${candidateImages.length}?\n` +
                            `Product: ${metadata.productName}\n` +
                            `Price: ${metadata.price}\n` +
                            `Category: ${metadata.category}\n` +
                            `URL: ${img.src.substring(0, 60)}...`
                        );
                        if (!confirmed) {
                            continue;
                        }
                    }

                    results.productImages.push(imageData);

                    // Download image if requested
                    if (config.downloadMode === 'download') {
                        await downloadImage(imageData);
                        await sleep(500); // Rate limiting
                    }

                } catch (error) {
                    console.error(`Error processing image ${i + 1}:`, error);
                    results.errors.push({
                        index: i + 1,
                        url: img.src,
                        error: error.message
                    });
                }
            }

            // Output results
            console.log('✅ Scraping completed!', results);

            if (config.downloadMode === 'json' || config.downloadMode === 'urls') {
                downloadJSON(results, 'spocket-scraped-images.json');
            }

            // Generate integration instructions
            if (results.productImages.length > 0) {
                console.log('\n📋 Integration with Square Inventory System:');
                console.log('1. The scraped data is compatible with your existing scripts');
                console.log('2. Use the generated JSON with your SquareCatalogAgent');
                console.log('3. Images are categorized using your project structure');
                console.log(`4. Found images in categories: ${[...new Set(results.productImages.map(img => img.category))].join(', ')}`);
            }

            return results;

        } catch (error) {
            console.error('💥 Scraping failed:', error);
            results.errors.push({ general: error.message });
            return results;
        }
    }

    /**
     * Generate filename based on product metadata
     */
    function generateFilename(metadata, url) {
        const extension = url.split('.').pop()?.split('?')[0] || 'jpg';
        const productName = metadata.productName
            .replace(/[^a-zA-Z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase()
            .substring(0, 50);
        
        const timestamp = Date.now();
        return `${metadata.category}-${productName}-${timestamp}.${extension}`;
    }

    /**
     * Download an image
     */
    async function downloadImage(imageData) {
        try {
            console.log(`⬇️ Downloading: ${imageData.filename}`);
            
            const response = await fetch(imageData.url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const blob = await response.blob();
            
            // Check file size
            if (blob.size > FILTER_CONFIG.maxFileSize) {
                throw new Error(`File too large: ${Math.round(blob.size / 1024 / 1024)}MB`);
            }

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = imageData.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

            console.log(`✅ Downloaded: ${imageData.filename}`);
            
        } catch (error) {
            console.error(`❌ Failed to download ${imageData.filename}:`, error.message);
            throw error;
        }
    }

    /**
     * Download JSON data
     */
    function downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        console.log(`📄 Downloaded: ${filename}`);
    }

    /**
     * Sleep function for rate limiting
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Public API
    return {
        analyzePageStructure,
        scrapeImages,
        config: FILTER_CONFIG,
        categoryMapping: CATEGORY_MAPPING
    };
})();

// Auto-run analysis when script loads
console.log('🎉 Spocket Image Scraper loaded!');
console.log('📖 Usage:');
console.log('  SpocketScraper.analyzePageStructure() - Analyze current page');
console.log('  SpocketScraper.scrapeImages() - Scrape and download images');
console.log('  SpocketScraper.scrapeImages({ downloadMode: "urls" }) - Get URLs only');
console.log('  SpocketScraper.scrapeImages({ maxImages: 10, confirmEach: true }) - Interactive mode');
console.log('');

// Automatically analyze the page structure
SpocketScraper.analyzePageStructure();
