// Injected script for advanced Square automation capabilities

class SquareAdvancedAutomation {
  constructor() {
    this.apiEndpoints = this.discoverAPIEndpoints();
    this.init();
  }

  init() {
    console.log('Advanced Square automation injected');
    
    // Hook into Square's API calls to monitor data flow
    this.interceptNetworkRequests();
    
    // Add advanced image processing capabilities
    this.initImageProcessing();
    
    // Monitor for real-time updates
    this.monitorSquareUpdates();
  }

  discoverAPIEndpoints() {
    // Discover Square's internal API endpoints by analyzing network requests
    const endpoints = {
      catalog: '/v2/catalog',
      items: '/v2/catalog/list',
      images: '/v2/catalog/images',
      upload: '/v2/catalog/images'
    };

    return endpoints;
  }

  interceptNetworkRequests() {
    // Intercept XMLHttpRequest and fetch to monitor Square API calls
    const originalFetch = window.fetch;
    const originalXHR = window.XMLHttpRequest.prototype.open;

    // Override fetch
    window.fetch = async (...args) => {
      const response = await originalFetch.apply(this, args);
      
      if (args[0].includes('catalog') || args[0].includes('items')) {
        console.log('Square API call intercepted:', args[0]);
        this.handleAPIResponse(response.clone(), args[0]);
      }

      return response;
    };

    // Override XMLHttpRequest
    window.XMLHttpRequest.prototype.open = function(method, url) {
      if (url.includes('catalog') || url.includes('items')) {
        console.log('Square XHR intercepted:', url);
        
        this.addEventListener('load', () => {
          if (this.responseText) {
            try {
              const data = JSON.parse(this.responseText);
              window.squareAutomation?.handleAPIData(data, url);
            } catch (e) {
              // Not JSON, ignore
            }
          }
        });
      }
      
      return originalXHR.apply(this, arguments);
    };
  }

  async handleAPIResponse(response, url) {
    try {
      const data = await response.json();
      this.handleAPIData(data, url);
    } catch (e) {
      // Not JSON response
    }
  }

  handleAPIData(data, url) {
    // Process intercepted Square API data
    if (url.includes('/catalog/list') && data.objects) {
      // Catalog items data
      this.processCatalogData(data.objects);
    } else if (url.includes('/catalog/images') && data.objects) {
      // Image data
      this.processImageData(data.objects);
    }

    // Send data to content script
    window.postMessage({
      type: 'SQUARE_API_DATA',
      url: url,
      data: data
    }, '*');
  }

  processCatalogData(catalogObjects) {
    // Extract and organize catalog data
    const items = catalogObjects.filter(obj => obj.type === 'ITEM');
    const categories = catalogObjects.filter(obj => obj.type === 'CATEGORY');
    
    console.log(`Processed ${items.length} items and ${categories.length} categories`);
    
    // Store for extension use
    this.catalogItems = items;
    this.categories = categories;
  }

  processImageData(imageObjects) {
    // Process image objects from Square API
    console.log(`Processed ${imageObjects.length} images`);
    this.catalogImages = imageObjects;
  }

  initImageProcessing() {
    // Advanced image processing and matching capabilities
    this.imageProcessor = {
      // Find images that match item characteristics
      findMatchingImages: async (item) => {
        const candidates = await this.searchForItemImages(item);
        const scored = await this.scoreImageMatches(item, candidates);
        return scored.sort((a, b) => b.score - a.score);
      },

      // Score how well an image matches an item
      scoreImageMatches: async (item, images) => {
        return images.map(img => ({
          ...img,
          score: this.calculateImageScore(item, img)
        }));
      },

      // Calculate match score between item and image
      calculateImageScore: (item, image) => {
        let score = 0;
        
        // Name similarity
        if (this.textSimilarity(item.item_data?.name || '', image.name || '')) {
          score += 50;
        }
        
        // Category match
        if (item.category_data?.name && image.path?.includes(item.category_data.name)) {
          score += 30;
        }
        
        // Image quality factors
        if (image.width > 500 && image.height > 500) score += 10;
        if (image.format === 'jpg' || image.format === 'jpeg') score += 5;
        
        return score;
      },

      // Extract images from current page
      extractPageImages: () => {
        const images = [];
        document.querySelectorAll('img[src]').forEach(img => {
          if (img.src.startsWith('http') && img.naturalWidth > 100) {
            images.push({
              src: img.src,
              width: img.naturalWidth,
              height: img.naturalHeight,
              alt: img.alt,
              element: img
            });
          }
        });
        return images;
      }
    };
  }

  async searchForItemImages(item) {
    // Search for images that could belong to this item
    const searchTerms = this.generateSearchTerms(item);
    const candidates = [];

    // Search in page images
    const pageImages = this.imageProcessor.extractPageImages();
    candidates.push(...pageImages);

    // Search in Square CDN (if accessible)
    try {
      const cdnImages = await this.searchSquareCDN(searchTerms);
      candidates.push(...cdnImages);
    } catch (e) {
      console.log('CDN search failed:', e.message);
    }

    return candidates;
  }

  generateSearchTerms(item) {
    const terms = [];
    
    if (item.item_data?.name) {
      terms.push(item.item_data.name);
      // Add variations
      terms.push(item.item_data.name.toLowerCase());
      terms.push(item.item_data.name.replace(/[^a-zA-Z0-9]/g, ''));
    }
    
    if (item.category_data?.name) {
      terms.push(item.category_data.name);
    }
    
    return terms;
  }

  async searchSquareCDN(searchTerms) {
    // Attempt to search Square's CDN for images
    // This would depend on Square's CDN structure
    const images = [];
    
    for (const term of searchTerms) {
      try {
        // Try common Square CDN patterns
        const cdnUrls = [
          `https://square-catalog-items.s3.amazonaws.com/${term}.jpg`,
          `https://items-images.squarecdn.com/${term}.jpg`,
          `https://catalog.squarecdn.com/images/${term}.jpg`
        ];
        
        for (const url of cdnUrls) {
          if (await this.imageExists(url)) {
            images.push({
              src: url,
              name: term,
              source: 'square-cdn'
            });
          }
        }
      } catch (e) {
        // URL not accessible
      }
    }
    
    return images;
  }

  async imageExists(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  textSimilarity(str1, str2) {
    // Simple text similarity check
    const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (s1.includes(s2) || s2.includes(s1)) return true;
    
    // Calculate Levenshtein distance for closer matching
    return this.levenshteinDistance(s1, s2) < Math.min(s1.length, s2.length) * 0.3;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  monitorSquareUpdates() {
    // Monitor for real-time Square updates and changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Check for new items or images added to the page
          const newImages = mutation.addedNodes.length > 0 ? 
            Array.from(mutation.addedNodes)
              .filter(node => node.tagName === 'IMG')
              .filter(img => img.src && img.src.startsWith('http')) : [];
          
          if (newImages.length > 0) {
            this.handleNewImages(newImages);
          }
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  handleNewImages(images) {
    // Process newly detected images
    console.log(`Detected ${images.length} new images`);
    
    images.forEach(img => {
      // Analyze if this is a product image
      if (this.isProductImage(img)) {
        console.log('New product image detected:', img.src);
        
        // Notify content script
        window.postMessage({
          type: 'NEW_PRODUCT_IMAGE',
          image: {
            src: img.src,
            width: img.naturalWidth,
            height: img.naturalHeight,
            alt: img.alt
          }
        }, '*');
      }
    });
  }

  isProductImage(img) {
    // Determine if image is likely a product image
    const src = img.src.toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    
    // Check for Square CDN patterns
    if (src.includes('squarecdn.com') || src.includes('square-catalog')) {
      return true;
    }
    
    // Check dimensions and content hints
    const minSize = 200;
    const hasGoodDimensions = img.naturalWidth >= minSize && img.naturalHeight >= minSize;
    
    const hasProductHints = alt.includes('product') || 
                           alt.includes('item') || 
                           src.includes('product') || 
                           src.includes('item');
    
    return hasGoodDimensions && hasProductHints;
  }

  // Expose methods for content script communication
  getAPI() {
    return {
      findImagesForItem: async (itemId) => {
        const item = this.catalogItems?.find(i => i.id === itemId);
        if (!item) throw new Error('Item not found');
        
        return await this.imageProcessor.findMatchingImages(item);
      },
      
      getCatalogData: () => ({
        items: this.catalogItems || [],
        categories: this.categories || [],
        images: this.catalogImages || []
      }),
      
      searchImages: async (query) => {
        return await this.searchForItemImages({ item_data: { name: query } });
      }
    };
  }
}

// Initialize and expose to global scope
window.squareAutomation = new SquareAdvancedAutomation();

// Listen for messages from content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'SQUARE_AUTOMATION_REQUEST') {
    const { method, params, id } = event.data;
    
    try {
      const api = window.squareAutomation.getAPI();
      if (api[method]) {
        api[method](...params).then(result => {
          window.postMessage({
            type: 'SQUARE_AUTOMATION_RESPONSE',
            id: id,
            result: result
          }, '*');
        }).catch(error => {
          window.postMessage({
            type: 'SQUARE_AUTOMATION_ERROR',
            id: id,
            error: error.message
          }, '*');
        });
      }
    } catch (error) {
      window.postMessage({
        type: 'SQUARE_AUTOMATION_ERROR',
        id: id,
        error: error.message
      }, '*');
    }
  }
});