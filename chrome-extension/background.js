// Background script for Square Inventory Automation Extension

class SquareAutomationBackground {
  constructor() {
    this.init();
  }

  init() {
    // Listen for extension installation
    chrome.runtime.onInstalled.addListener(() => {
      console.log('Square Automation Extension installed');
      this.initializeStorage();
    });

    // Listen for messages from content scripts and popup
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

    // Listen for tab updates to inject automation when needed
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
  }

  async initializeStorage() {
    // Initialize default settings
    const defaultSettings = {
      autoMode: false,
      imageSearchEnabled: true,
      catalogData: null,
      lastSync: null
    };

    const stored = await chrome.storage.local.get(defaultSettings);
    await chrome.storage.local.set(stored);
  }

  handleMessage(message, sender, sendResponse) {
    console.log('Background received message:', message);

    // Handle synchronous responses immediately
    if (message.action === 'getSettings') {
      chrome.storage.local.get().then(sendResponse).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    const handleAsync = async () => {
      try {
        let result;
        
        // Add timeout wrapper for long operations
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Operation timed out after 30 seconds')), 30000);
        });

        switch (message.action) {
          case 'syncCatalogData':
            result = await Promise.race([
              this.syncCatalogData(message.data),
              timeoutPromise
            ]);
            break;
          
          case 'findProductImages':
            result = await Promise.race([
              this.findProductImages(message.itemId),
              timeoutPromise
            ]);
            break;
          
          case 'saveImageToItem':
            result = await Promise.race([
              this.saveImageToItem(message.itemId, message.imageUrl),
              timeoutPromise
            ]);
            break;
          
          case 'automateSquareTask':
            result = await Promise.race([
              this.automateSquareTask(message.task, sender.tab.id),
              timeoutPromise
            ]);
            break;
          
          case 'spocketProductDetected':
            result = await this.handleSpocketProduct(message.productData, message.images);
            break;
          
          case 'downloadImage':
            result = await Promise.race([
              this.downloadImage(message.url, message.filename, message.productId),
              timeoutPromise
            ]);
            break;
          
          case 'downloadImagesAsZip':
            console.log('🚀 Starting zip download process...');
            result = await this.downloadImagesAsZip(message.images, message.productData);
            console.log('🎯 Zip download process completed:', result);
            break;
          
          case 'updateSettings':
            await chrome.storage.local.set(message.settings);
            result = { success: true };
            break;
          
          default:
            console.warn('Unknown action:', message.action);
            result = { success: false, error: 'Unknown action' };
        }
        
        sendResponse(result);
      } catch (error) {
        console.error('Background script error:', error);
        const errorResult = { success: false, error: error.message };
        sendResponse(errorResult);
      }
    };

    handleAsync();
    return true; // Will respond asynchronously
  }

  async handleTabUpdate(tabId, changeInfo, tab) {
    // Auto-inject functionality when Square pages load
    if (changeInfo.status === 'complete' && 
        tab.url && 
        tab.url.includes('app.squareup.com')) {
      
      const settings = await chrome.storage.local.get(['autoMode']);
      if (settings.autoMode) {
        // Inject automation capabilities
        await this.injectAutomation(tabId);
      }
    }
  }

  async injectAutomation(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['injected.js']
      });
      console.log('Automation injected into tab:', tabId);
    } catch (error) {
      console.error('Failed to inject automation:', error);
    }
  }

  async syncCatalogData(catalogData) {
    try {
      await chrome.storage.local.set({
        catalogData: catalogData,
        lastSync: Date.now()
      });
      
      console.log('Catalog data synced:', catalogData?.items?.length || 0, 'items');
      return { success: true, itemCount: catalogData?.items?.length || 0 };
    } catch (error) {
      console.error('Failed to sync catalog data:', error);
      return { success: false, error: error.message };
    }
  }

  async findProductImages(itemId) {
    try {
      // Get catalog data from storage
      const { catalogData } = await chrome.storage.local.get(['catalogData']);
      
      if (!catalogData || !catalogData.items) {
        return { success: false, error: 'No catalog data available' };
      }

      // Find the specific item
      const item = catalogData.items.find(i => i.id === itemId);
      if (!item) {
        return { success: false, error: 'Item not found in catalog' };
      }

      // Search for images in the project's image directories
      const imagePaths = await this.searchForItemImages(item);
      
      return { 
        success: true, 
        item: item,
        images: imagePaths 
      };
    } catch (error) {
      console.error('Failed to find product images:', error);
      return { success: false, error: error.message };
    }
  }

  async searchForItemImages(item) {
    // This would typically interface with your local file system
    // For now, we'll simulate finding images based on item name/category
    const possiblePaths = [
      `assets/images/${item.category_data?.name || 'miscellaneous'}/${item.name}.jpg`,
      `assets/images/${item.category_data?.name || 'miscellaneous'}/${item.name}.png`,
      `catalog-images/${item.name}/`,
      `downloaded-images/${item.id}/`
    ];

    // In a real implementation, this would check actual file existence
    return possiblePaths;
  }

  async saveImageToItem(itemId, imageUrl) {
    try {
      // Download the image
      const downloadId = await chrome.downloads.download({
        url: imageUrl,
        filename: `square-items/${itemId}/image-${Date.now()}.jpg`,
        conflictAction: 'uniquify'
      });

      // Track the download
      return new Promise((resolve) => {
        chrome.downloads.onChanged.addListener(function onChanged(downloadDelta) {
          if (downloadDelta.id === downloadId && downloadDelta.state?.current === 'complete') {
            chrome.downloads.onChanged.removeListener(onChanged);
            resolve({ 
              success: true, 
              downloadId: downloadId,
              message: 'Image saved successfully' 
            });
          } else if (downloadDelta.id === downloadId && downloadDelta.state?.current === 'interrupted') {
            chrome.downloads.onChanged.removeListener(onChanged);
            resolve({ 
              success: false, 
              error: 'Download interrupted' 
            });
          }
        });
      });
    } catch (error) {
      console.error('Failed to save image:', error);
      return { success: false, error: error.message };
    }
  }

  async automateSquareTask(task, tabId) {
    try {
      // Send task to content script for execution
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'executeTask',
        task: task
      });

      return response;
    } catch (error) {
      console.error('Failed to automate Square task:', error);
      return { success: false, error: error.message };
    }
  }

  async handleSpocketProduct(productData, images) {
    try {
      console.log('📦 Spocket product detected:', productData.title || 'Unknown');
      console.log('🖼️ Images found:', images.length);
      console.log('💰 Pricing:', { cost: productData.costPrice, sell: productData.sellPrice, profit: productData.profit });
      console.log('🏪 Supplier:', productData.supplier, 'from', productData.origin);

      // Store Spocket product data
      const spocketData = await chrome.storage.local.get(['spocketProducts']) || { spocketProducts: [] };
      const products = spocketData.spocketProducts || [];
      
      // Add comprehensive product information
      const enrichedProductData = {
        ...productData,
        images: images,
        lastUpdated: Date.now(),
        captureComplete: true,
        // Add computed fields for easier searching/filtering
        hasImages: images.length > 0,
        hasPricing: !!(productData.costPrice && productData.sellPrice),
        profitAmount: productData.profit ? parseFloat(productData.profit.replace(/[$,]/g, '')) : null,
        marginPercent: productData.profitMargin ? parseFloat(productData.profitMargin.replace('%', '')) : null,
        // Add categorization hints
        category: this.inferCategory(productData.title, images),
        tags: this.generateTags(productData)
      };
      
      // Add or update product
      const existingIndex = products.findIndex(p => p.id === productData.id);
      if (existingIndex >= 0) {
        products[existingIndex] = enrichedProductData;
        console.log('🔄 Updated existing product:', productData.title);
      } else {
        products.push(enrichedProductData);
        console.log('✨ Added new product:', productData.title);
      }

      await chrome.storage.local.set({ spocketProducts: products });

      // Also update statistics
      const stats = await this.updateSpocketStats(products);

      return {
        success: true,
        message: `Spocket product captured: ${productData.title || 'Unknown'}`,
        productCount: products.length,
        imageCount: images.length,
        pricing: {
          cost: productData.costPrice,
          sell: productData.sellPrice,
          profit: productData.profit,
          margin: productData.profitMargin
        },
        stats: stats
      };

    } catch (error) {
      console.error('Failed to handle Spocket product:', error);
      return { success: false, error: error.message };
    }
  }

  inferCategory(title, images) {
    if (!title) return 'uncategorized';
    
    const titleLower = title.toLowerCase();
    const categoryMap = {
      jewelry: ['ring', 'necklace', 'bracelet', 'earring', 'jewelry', 'pendant', 'chain'],
      home: ['candle', 'holder', 'decor', 'home', 'lamp', 'vase', 'pillow'],
      kitchen: ['spoon', 'bowl', 'plate', 'cup', 'mug', 'utensil', 'cooking', 'kitchen'],
      clothing: ['shirt', 'dress', 'pants', 'jacket', 'coat', 'clothing', 'apparel'],
      accessories: ['bag', 'wallet', 'watch', 'sunglasses', 'accessory', 'keychain'],
      beauty: ['cream', 'serum', 'makeup', 'beauty', 'skincare', 'cosmetic'],
      electronics: ['phone', 'tablet', 'computer', 'electronic', 'gadget', 'device'],
      toys: ['toy', 'game', 'puzzle', 'doll', 'action figure', 'educational']
    };
    
    for (const [category, keywords] of Object.entries(categoryMap)) {
      if (keywords.some(keyword => titleLower.includes(keyword))) {
        return category;
      }
    }
    
    return 'general';
  }

  generateTags(productData) {
    const tags = [];
    
    if (productData.origin) tags.push(`from-${productData.origin.toLowerCase().replace(/\s+/g, '-')}`);
    if (productData.supplier) tags.push(`supplier-${productData.supplier.toLowerCase().replace(/\s+/g, '-')}`);
    if (productData.pushedToStore) tags.push('pushed-to-store');
    
    // Price-based tags
    if (productData.costPrice) {
      const cost = parseFloat(productData.costPrice.replace(/[$,]/g, ''));
      if (cost < 5) tags.push('low-cost');
      else if (cost < 20) tags.push('medium-cost');
      else tags.push('high-cost');
    }
    
    // Margin-based tags
    if (productData.profitMargin) {
      const margin = parseFloat(productData.profitMargin.replace('%', ''));
      if (margin > 70) tags.push('high-margin');
      else if (margin > 50) tags.push('good-margin');
      else tags.push('low-margin');
    }
    
    return tags;
  }

  async updateSpocketStats(products) {
    const stats = {
      totalProducts: products.length,
      withImages: products.filter(p => p.hasImages).length,
      withPricing: products.filter(p => p.hasPricing).length,
      pushedToStore: products.filter(p => p.pushedToStore).length,
      categories: {},
      avgMargin: 0,
      totalProfit: 0
    };
    
    // Calculate category distribution
    products.forEach(product => {
      const category = product.category || 'uncategorized';
      stats.categories[category] = (stats.categories[category] || 0) + 1;
    });
    
    // Calculate average margin and total profit
    const productsWithMargin = products.filter(p => p.marginPercent);
    if (productsWithMargin.length > 0) {
      stats.avgMargin = (productsWithMargin.reduce((sum, p) => sum + p.marginPercent, 0) / productsWithMargin.length).toFixed(1);
    }
    
    const productsWithProfit = products.filter(p => p.profitAmount);
    if (productsWithProfit.length > 0) {
      stats.totalProfit = productsWithProfit.reduce((sum, p) => sum + p.profitAmount, 0).toFixed(2);
    }
    
    await chrome.storage.local.set({ spocketStats: stats });
    return stats;
  }

  async downloadImage(url, filename, productId = null) {
    try {
      console.log('📥 Downloading image:', filename);

      const downloadId = await chrome.downloads.download({
        url: url,
        filename: filename,
        conflictAction: 'uniquify'
      });

      // Track the download
      return new Promise((resolve) => {
        chrome.downloads.onChanged.addListener(function onChanged(downloadDelta) {
          if (downloadDelta.id === downloadId) {
            if (downloadDelta.state?.current === 'complete') {
              chrome.downloads.onChanged.removeListener(onChanged);
              console.log('✅ Download completed:', filename);
              resolve({
                success: true,
                downloadId: downloadId,
                filename: filename,
                productId: productId
              });
            } else if (downloadDelta.state?.current === 'interrupted') {
              chrome.downloads.onChanged.removeListener(onChanged);
              console.error('❌ Download interrupted:', filename);
              resolve({
                success: false,
                error: 'Download interrupted',
                filename: filename
              });
            }
          }
        });
      });

    } catch (error) {
      console.error('Failed to download image:', error);
      return { success: false, error: error.message };
    }
  }

  async downloadImagesAsZip(images, productData) {
    try {
      console.log(`📦 Creating folder download for ${images.length} images`);
      
      if (!images || images.length === 0) {
        return {
          success: false,
          error: 'No images to download'
        };
      }
      
      // Create a clean product name for the folder
      const productName = (productData?.cleanName || productData?.title || 'spocket-product')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);
      
      const timestamp = Date.now();
      const folderName = `spocket-products/${productName}-${timestamp}`;
      
      console.log(`📁 Creating folder: ${folderName}`);
      
      const results = [];
      
      // Step 1: Create and download manifest file
      try {
        console.log('📋 Creating product data manifest...');
        const manifest = {
          productData: productData,
          downloadDate: new Date().toISOString(),
          imageCount: images.length,
          images: images.map((img, index) => ({
            filename: img.filename,
            originalUrl: img.originalSrc || img.src,
            index: index,
            isMain: img.isMain || false,
            isVariant: img.isVariant || false,
            dimensions: `${img.width || 0}x${img.height || 0}`
          }))
        };
        
        const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
        const manifestUrl = URL.createObjectURL(manifestBlob);
        
        const manifestDownloadId = await chrome.downloads.download({
          url: manifestUrl,
          filename: `${folderName}/product-data.json`,
          conflictAction: 'uniquify'
        });
        
        results.push({
          success: true,
          filename: 'product-data.json',
          downloadId: manifestDownloadId,
          type: 'manifest'
        });
        
        // Clean up blob URL
        setTimeout(() => URL.revokeObjectURL(manifestUrl), 5000);
        console.log('✅ Manifest created');
        
      } catch (error) {
        console.error('❌ Failed to create manifest:', error);
        results.push({
          success: false,
          filename: 'product-data.json',
          error: error.message,
          type: 'manifest'
        });
      }
      
      // Step 2: Download images with small delay between downloads
      console.log(`🖼️ Downloading ${images.length} images...`);
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        
        // Small delay to prevent overwhelming the download system
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        try {
          const downloadUrl = image.originalSrc || image.src;
          if (!downloadUrl) {
            throw new Error('No valid image URL');
          }
          
          // Add index prefix for better organization
          const indexedFilename = `${String(i + 1).padStart(2, '0')}-${image.filename}`;
          
          const downloadId = await chrome.downloads.download({
            url: downloadUrl,
            filename: `${folderName}/${indexedFilename}`,
            conflictAction: 'uniquify'
          });
          
          results.push({
            success: true,
            filename: indexedFilename,
            downloadId: downloadId,
            url: downloadUrl,
            type: 'image'
          });
          
          console.log(`✅ Downloaded ${i + 1}/${images.length}: ${indexedFilename}`);
          
        } catch (error) {
          console.error(`❌ Failed to download image ${i + 1}:`, error);
          results.push({
            success: false,
            filename: image.filename || `image-${i + 1}`,
            error: error.message,
            type: 'image'
          });
        }
      }
      
      // Step 3: Create HTML index file
      try {
        console.log('🌐 Creating HTML gallery...');
        const htmlContent = this.generateImageIndexHtml(productData, images);
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const htmlUrl = URL.createObjectURL(htmlBlob);
        
        const htmlDownloadId = await chrome.downloads.download({
          url: htmlUrl,
          filename: `${folderName}/index.html`,
          conflictAction: 'uniquify'
        });
        
        results.push({
          success: true,
          filename: 'index.html',
          downloadId: htmlDownloadId,
          type: 'index'
        });
        
        setTimeout(() => URL.revokeObjectURL(htmlUrl), 5000);
        console.log('✅ HTML gallery created');
        
      } catch (error) {
        console.error('❌ Failed to create HTML index:', error);
        results.push({
          success: false,
          filename: 'index.html',
          error: error.message,
          type: 'index'
        });
      }
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      console.log(`🎯 Folder creation completed: ${successCount} success, ${failCount} failed`);
      
      return {
        success: true,
        folderName: folderName,
        downloaded: successCount,
        failed: failCount,
        results: results,
        message: `Created folder with ${successCount} files (${failCount} failed)`
      };
      
    } catch (error) {
      console.error('🔥 Folder download process failed:', error);
      return {
        success: false,
        error: `Folder creation failed: ${error.message}`
      };
    }
  }

  generateImageIndexHtml(productData, images) {
    const title = productData?.title || 'Spocket Product';
    const supplier = productData?.supplier || 'Unknown';
    const costPrice = productData?.costPrice || 'N/A';
    const sellPrice = productData?.sellPrice || 'N/A';
    const profit = productData?.profit || 'N/A';
    const margin = productData?.profitMargin || 'N/A';
    
    const imagesList = images.map((img, index) => {
      const indexedFilename = `${String(index + 1).padStart(2, '0')}-${img.filename}`;
      const badge = img.isMain ? '<span style="background: #4CAF50; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">MAIN</span>' : '';
      return `
        <div style="border: 1px solid #ddd; border-radius: 8px; padding: 12px; text-align: center; background: white;">
          <img src="${indexedFilename}" style="width: 100%; max-width: 200px; height: 150px; object-fit: cover; border-radius: 4px;" />
          <div style="margin-top: 8px; font-size: 12px; color: #666;">${indexedFilename}</div>
          <div style="margin-top: 4px; font-size: 11px; color: #999;">${img.width}x${img.height}</div>
          ${badge}
        </div>
      `;
    }).join('');
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Product Images</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: #f5f5f5; 
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: white; 
            padding: 30px; 
            border-radius: 12px; 
            box-shadow: 0 2px 12px rgba(0,0,0,0.1); 
        }
        .header { 
            border-bottom: 2px solid #eee; 
            padding-bottom: 20px; 
            margin-bottom: 30px; 
        }
        .product-info { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px; 
        }
        .info-card { 
            background: #f8f9fa; 
            padding: 16px; 
            border-radius: 8px; 
        }
        .info-label { 
            font-weight: bold; 
            color: #666; 
            font-size: 12px; 
            text-transform: uppercase; 
            margin-bottom: 4px; 
        }
        .info-value { 
            font-size: 16px; 
            color: #333; 
        }
        .images-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); 
            gap: 20px; 
        }
        .profit { color: #4CAF50; font-weight: bold; }
        .cost { color: #e91e63; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; color: #333;">${title}</h1>
            <p style="margin: 8px 0 0 0; color: #666; font-size: 16px;">Supplier: ${supplier}</p>
        </div>
        
        <div class="product-info">
            <div class="info-card">
                <div class="info-label">Cost Price</div>
                <div class="info-value cost">${costPrice}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Sell Price</div>
                <div class="info-value profit">${sellPrice}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Profit</div>
                <div class="info-value profit">${profit}</div>
            </div>
            <div class="info-card">
                <div class="info-label">Margin</div>
                <div class="info-value profit">${margin}</div>
            </div>
        </div>
        
        <h2 style="color: #333; margin-bottom: 20px;">Product Images (${images.length})</h2>
        <div class="images-grid">
            ${imagesList}
        </div>
        
        <div style="margin-top: 40px; padding: 20px; background: #f8f9fa; border-radius: 8px; font-size: 14px; color: #666;">
            <strong>📋 Files in this folder:</strong><br>
            • <code>product-data.json</code> - Complete product data in JSON format<br>
            • <code>index.html</code> - This file (image gallery)<br>
            • <code>01-*, 02-*, etc.</code> - Product images (numbered for easy organization)<br><br>
            <strong>📅 Downloaded:</strong> ${new Date().toLocaleString()}<br>
            <strong>🔗 Original URL:</strong> <a href="${productData?.url || '#'}" target="_blank">${productData?.url || 'N/A'}</a>
        </div>
    </div>
</body>
</html>
    `;
  }
}

// Initialize the background script
new SquareAutomationBackground();