// Spocket content script for product image capture

class SpocketImageCapture {
  constructor() {
    this.isSpocketPage = window.location.hostname.includes('spocket.co');
    this.currentPage = this.detectPageType();
    this.productData = null;
    this.capturedImages = [];
    
    this.init();
  }

  init() {
    if (!this.isSpocketPage) return;

    console.log('🔍 Spocket Image Capture initialized on:', this.currentPage);
    
    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });
    
    // Initialize page-specific capture
    if (this.currentPage === 'product-detail') {
      this.initProductCapture();
    }
    
    // Add visual indicators
    this.addCaptureIndicators();
    
    // Watch for dynamic content loading
    this.watchForImageLoading();
  }

  detectPageType() {
    const url = window.location.pathname;
    
    if (url.includes('/product/') && url.match(/\/product\/[a-f0-9-]+/)) {
      return 'product-detail';
    }
    
    if (url.includes('/products') || url.includes('/dashboard')) {
      return 'product-list';
    }
    
    return 'unknown';
  }

  handleMessage(message, sender, sendResponse) {
    console.log('Spocket content script received:', message);

    switch (message.action) {
      case 'ping':
        sendResponse({ success: true, status: 'Spocket content script active' });
        break;

      case 'getPageInfo':
        sendResponse({
          success: true,
          pageType: this.currentPage,
          url: window.location.href,
          title: document.title,
          productData: this.productData
        });
        break;

      case 'captureImages':
        this.captureAllImages().then(sendResponse);
        return true;

      case 'captureProductData':
        this.captureProductData().then(sendResponse);
        return true;

      case 'downloadImages':
        this.downloadImages(message.images || this.capturedImages).then(sendResponse);
        return true;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  }

  async initProductCapture() {
    // Wait for page to load
    await this.waitForElement('img, [data-testid*="image"], .ril__image', 10000);
    
    // Auto-capture product data
    this.productData = await this.captureProductData();
    
    // Auto-capture images with a slight delay to ensure page is fully loaded
    setTimeout(async () => {
      this.capturedImages = await this.captureAllImages();
      
      console.log('📦 Product data captured:', this.productData);
      console.log('🖼️ Images captured:', this.capturedImages.length);
      
      // Update UI if capture controls exist
      const countEl = document.getElementById('image-count');
      if (countEl) countEl.textContent = this.capturedImages.length;
      
      // Notify background script with the captured data
      chrome.runtime.sendMessage({
        action: 'spocketProductDetected',
        productData: this.productData,
        images: this.capturedImages
      });
    }, 2000);
  }

  async captureProductData() {
    try {
      const productData = {
        id: this.extractProductId(),
        url: window.location.href,
        timestamp: Date.now()
      };

      // Capture product title - Spocket specific selector
      const titleSelectors = [
        'h3[data-cy="listing-detail-modal-title"]', // Most specific - your exact element
        '[data-cy="listing-detail-modal-title"]',   // Fallback for any element with this attribute
        'h1',                                       // Generic fallback
        '[data-testid*="title"]',                  // Other possible title elements
        '.product-title'                           // CSS class fallback
      ];
      
      for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          productData.title = element.textContent.trim();
          console.log('📝 Title found:', productData.title);
          break;
        }
      }

      // Capture pricing information - You Pay / You Sell
      const priceContainer = document.querySelector('section.sc-gGTSdS.sc-kxZkPw, section.sc-gGTSdS.sc-cpYGdV');
      if (priceContainer) {
        console.log('🔍 Found price container, analyzing pricing structure...');
        
        // Get all h4 headers and h3 price elements
        const allHeaders = Array.from(priceContainer.querySelectorAll('h4')).map(h => h.textContent.trim());
        const allPrices = Array.from(priceContainer.querySelectorAll('h3.sc-eZkCL')).map(h => h.textContent.trim());
        
        console.log('📊 Headers found:', allHeaders);
        console.log('💲 Price elements found:', allPrices);
        
        // Method 1: Find prices directly after "You Pay" and "You Sell" headers
        const youPayHeaderIndex = allHeaders.findIndex(h => h.includes('You Pay'));
        const youSellHeaderIndex = allHeaders.findIndex(h => h.includes('You Sell'));
        
        console.log('📍 You Pay header at index:', youPayHeaderIndex);
        console.log('📍 You Sell header at index:', youSellHeaderIndex);
        
        // Method 1A: First try to find the exact price structure div
        const exactPriceDiv = priceContainer.querySelector('div[style*="justify-content: space-between"][style*="margin: 0px 0px 16px"]');
        if (exactPriceDiv) {
          const exactPrices = Array.from(exactPriceDiv.querySelectorAll('h3.sc-eZkCL.lmgIAS'))
            .map(h => h.textContent.trim())
            .filter(text => /\$\d+\.\d{2}/.test(text));
          
          console.log('🎯 Found exact price div with prices:', exactPrices);
          
          if (exactPrices.length === 2) {
            productData.costPrice = exactPrices[0];  // Left = wholesale/cost
            productData.sellPrice = exactPrices[1]; // Right = retail/sell
            console.log('💰 Exact match - Cost Price (You Pay):', productData.costPrice);
            console.log('💰 Exact match - Sell Price (You Sell):', productData.sellPrice);
          }
        }
        
        // Method 1B: If exact match didn't work, try the original method
        if (!productData.costPrice || !productData.sellPrice) {
          // Look for prices that contain $ and are valid currency
          const validPrices = allPrices.filter(price => price.includes('$') && /\$\d+\.\d{2}/.test(price));
          console.log('✅ Valid currency prices found:', validPrices);
          
          if (validPrices.length >= 2) {
            // Assume first price is cost, second is sell price based on typical layout
            productData.costPrice = validPrices[0];
            productData.sellPrice = validPrices[1];
            console.log('💰 Cost Price (You Pay):', productData.costPrice);
            console.log('💰 Sell Price (You Sell):', productData.sellPrice);
          } else if (validPrices.length === 1) {
            // If only one price found, try to determine which one it is
            const singlePrice = validPrices[0];
            if (youPayHeaderIndex >= 0 && youSellHeaderIndex < 0) {
              productData.costPrice = singlePrice;
              console.log('💰 Cost Price (You Pay):', productData.costPrice);
            } else if (youSellHeaderIndex >= 0 && youPayHeaderIndex < 0) {
              productData.sellPrice = singlePrice;
              console.log('💰 Sell Price (You Sell):', productData.sellPrice);
            }
          }
        }
        
        // Method 2: Look for the specific price div with space-between layout
        if (!productData.costPrice || !productData.sellPrice) {
          console.log('🔄 Trying alternative price detection method...');
          
          // Look for div with space-between that contains exactly 2 h3 price elements
          const priceDivs = Array.from(priceContainer.querySelectorAll('div[style*="justify-content: space-between"]'));
          console.log('📦 Found', priceDivs.length, 'space-between divs');
          
          for (const div of priceDivs) {
            const h3Elements = Array.from(div.querySelectorAll('h3.sc-eZkCL'));
            const prices = h3Elements.map(h => h.textContent.trim()).filter(text => /\$\d+\.\d{2}/.test(text));
            
            console.log('💲 Prices in this div:', prices);
            
            // If we find exactly 2 prices in a space-between div, assume left=wholesale, right=retail
            if (prices.length === 2) {
              productData.costPrice = prices[0];  // Left side = wholesale (You Pay)
              productData.sellPrice = prices[1]; // Right side = retail (You Sell)
              console.log('🎯 Found price pair in space-between div:');
              console.log('💰 Wholesale (You Pay):', productData.costPrice);
              console.log('💰 Retail (You Sell):', productData.sellPrice);
              break;
            }
          }
        }
        
        // Method 3: Last resort - look for any two consecutive h3 prices
        if (!productData.costPrice || !productData.sellPrice) {
          console.log('🔄 Trying last resort: any consecutive h3 prices...');
          
          const allH3Prices = Array.from(priceContainer.querySelectorAll('h3'))
            .map(h => h.textContent.trim())
            .filter(text => /\$\d+\.\d{2}/.test(text));
            
          console.log('🎯 All h3 prices found:', allH3Prices);
          
          if (allH3Prices.length >= 2) {
            productData.costPrice = allH3Prices[0];
            productData.sellPrice = allH3Prices[1];
            console.log('💰 Last resort - Cost Price:', productData.costPrice);
            console.log('💰 Last resort - Sell Price:', productData.sellPrice);
          }
        }
      } else {
        console.log('❌ No price container found');
      }

      // Capture supplier information
      const supplierLink = document.querySelector('.supplier-link');
      if (supplierLink) {
        productData.supplier = supplierLink.textContent.trim();
        productData.supplierUrl = supplierLink.href;
        console.log('🏪 Supplier:', productData.supplier);
      }

      // Capture country/origin
      const countryFlag = document.querySelector('.country-flag');
      if (countryFlag) {
        productData.origin = countryFlag.alt.replace(' flag', '');
        console.log('🌍 Origin:', productData.origin);
      }

      // Capture processing time
      const processingTimeHeaders = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Processing Time'));
      if (processingTimeHeaders) {
        const processingTimeElement = processingTimeHeaders.parentElement.querySelector('p.sc-cmaqmh.ihBHZO');
        if (processingTimeElement && processingTimeElement.textContent.includes('business days')) {
          productData.processingTime = processingTimeElement.textContent.trim();
          console.log('⏰ Processing Time:', productData.processingTime);
        }
      }

      // Capture shipping information
      const shippingElements = document.querySelectorAll('.sc-keYZnm .sc-fDpJdc');
      for (const element of shippingElements) {
        const countryEl = element.querySelector('p.sc-cmaqmh.sc-hiEoHn');
        const timeEl = element.querySelector('p.sc-cmaqmh.sc-ksJxCS');
        if (countryEl && timeEl) {
          if (!productData.shipping) productData.shipping = {};
          const country = countryEl.textContent.trim();
          const time = timeEl.textContent.trim().replace(/[()]/g, '');
          productData.shipping[country] = time;
          console.log(`🚚 Shipping to ${country}: ${time}`);
        }
      }

      // Capture shipping costs - improved detection
      const shippingCostSelectors = [
        '[data-tip*="ships for"] p.sc-cmaqmh.ihBHZO', // Original selector
        '[data-tip*="ships for"] p', // Broader version
        'p:contains("FREE")', // Free shipping
        'p:contains("USD")', // USD pricing
      ];
      
      const shippingCosts = [];
      
      // Look for FREE shipping
      const freeShippingEl = Array.from(document.querySelectorAll('p')).find(p => 
        p.textContent.trim() === 'FREE'
      );
      if (freeShippingEl) {
        // Get the country/region for free shipping
        const shippingContainer = freeShippingEl.closest('div');
        const countryEl = shippingContainer?.querySelector('p.sc-cmaqmh.sc-hiEoHn');
        const country = countryEl?.textContent.trim() || 'Unknown region';
        shippingCosts.push(`${country}: FREE`);
        console.log('🆓 Free shipping found for:', country);
      }
      
      // Look for paid shipping with tooltip information
      const shippingWithTooltip = document.querySelector('[data-tip*="This product ships for"]');
      if (shippingWithTooltip) {
        const tooltip = shippingWithTooltip.getAttribute('data-tip');
        // Extract shipping cost from tooltip like "This product ships for $45.00 USD, plus $15.00 USD for each additional"
        const costMatch = tooltip.match(/ships for \$([0-9.]+) USD.*plus \$([0-9.]+) USD/);
        if (costMatch) {
          const baseCost = costMatch[1];
          const additionalCost = costMatch[2];
          
          // Get the country/region for this shipping option
          const shippingContainer = shippingWithTooltip.closest('.sc-ixziMx');
          const countryEl = shippingContainer?.querySelector('p.sc-cmaqmh.sc-hiEoHn');
          const country = countryEl?.textContent.trim() || 'Unknown region';
          
          shippingCosts.push(`${country}: $${baseCost} USD (+ $${additionalCost} each additional)`);
          console.log('💸 Paid shipping found:', `${country}: $${baseCost} + $${additionalCost}`);
        }
      }
      
      if (shippingCosts.length > 0) {
        productData.shippingOptions = shippingCosts;
        productData.shippingCost = shippingCosts.join('; '); // Legacy field
        console.log('🚚 All shipping options:', productData.shippingOptions);
      }

      // Capture return policy
      const returnPolicyHeader = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Return Policy'));
      if (returnPolicyHeader) {
        const returnPolicyEl = returnPolicyHeader.parentElement.querySelector('p.sc-cmaqmh.kOUXxd');
        if (returnPolicyEl && returnPolicyEl.textContent.includes('returnable')) {
          productData.returnPolicy = returnPolicyEl.textContent.trim();
          console.log('🔄 Return Policy:', productData.returnPolicy);
        }
      }

      // Capture payment methods
      const paymentMethods = [];
      const paypalEl = document.querySelector('img[alt*="Paypal"]');
      if (paypalEl) paymentMethods.push('PayPal');
      
      const creditCardEl = document.querySelector('img[alt*="Stripe"]') || Array.from(document.querySelectorAll('p')).find(p => p.textContent.includes('Credit Card'));
      if (creditCardEl) paymentMethods.push('Credit Card');
      
      if (paymentMethods.length > 0) {
        productData.paymentMethods = paymentMethods;
        console.log('💳 Payment Methods:', paymentMethods.join(', '));
      }

      // Check if product is pushed to store - Spocket specific selectors
      const pushedToStoreIndicators = [
        // Direct element selectors
        '[data-cy="pushed-tag"]',
        'p.sc-jgtTJd', // Spocket's pushed to store paragraph class
        // Text-based searches
        { text: 'Pushed to Store', selector: 'p' },
        { text: 'In Store', selector: 'p' },
        { text: '🎉', selector: 'p' } // Party emoji indicator
      ];
      
      for (const indicator of pushedToStoreIndicators) {
        let element;
        
        if (typeof indicator === 'string') {
          // Direct selector
          element = document.querySelector(indicator);
        } else {
          // Text-based search
          element = Array.from(document.querySelectorAll(indicator.selector)).find(p => 
            p.textContent.includes(indicator.text)
          );
        }
        
        if (element) {
          productData.pushedToStore = true;
          // Extract clean status text (remove emoji and extra text)
          let statusText = element.textContent.trim();
          statusText = statusText.replace(/🎉\s*/, '').trim(); // Remove party emoji
          productData.storeStatus = statusText || 'Pushed to Store';
          console.log('✅ Product is pushed to store:', productData.storeStatus);
          break;
        }
      }

      // Capture product description
      const descriptionSelectors = [
        'h3:contains("Product Description") + p', // Description after "Product Description" heading
        'p.sc-cmaqmh.sc-fJKILO', // Specific Spocket description class
        '.product-description p',
        '[data-testid*="description"]'
      ];
      
      for (const selector of descriptionSelectors) {
        let element;
        if (selector.includes(':contains')) {
          // Find "Product Description" heading and get next paragraph
          const heading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Product Description'));
          if (heading) {
            element = heading.nextElementSibling;
            while (element && element.tagName !== 'P') {
              element = element.nextElementSibling;
            }
          }
        } else {
          element = document.querySelector(selector);
        }
        
        if (element && element.textContent.trim()) {
          let description = element.textContent.trim();
          
          // Clean up description - remove excessive whitespace and normalize
          description = description.replace(/\s+/g, ' ').trim();
          
          // Extract hashtags from description
          const hashtagMatch = description.match(/#\w+(?:\s#\w+)*/g);
          if (hashtagMatch) {
            productData.hashtags = hashtagMatch.join(' ').split(/\s+/).filter(tag => tag.startsWith('#'));
            // Remove hashtags from main description
            description = description.replace(/#\w+(?:\s#\w+)*/g, '').trim();
          }
          
          productData.description = description;
          console.log('📄 Description captured:', description.substring(0, 100) + '...');
          if (productData.hashtags) {
            console.log('🏷️ Hashtags found:', productData.hashtags.slice(0, 5).join(' ') + (productData.hashtags.length > 5 ? '...' : ''));
          }
          break;
        }
      }

      // Capture marketplace availability
      const marketplaceEl = document.querySelector('[alt="marketplaces"]') || 
                           Array.from(document.querySelectorAll('span')).find(s => s.textContent.includes('Available for marketplace'));
      if (marketplaceEl) {
        productData.marketplaceAvailable = true;
        console.log('🛒 Available for marketplace');
      }

      // Generate a clean filename-safe name
      if (productData.title) {
        productData.cleanName = productData.title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 50);
      }

      // Calculate profit margin if both prices available
      if (productData.costPrice && productData.sellPrice) {
        const cost = parseFloat(productData.costPrice.replace(/[$,]/g, ''));
        const sell = parseFloat(productData.sellPrice.replace(/[$,]/g, ''));
        if (!isNaN(cost) && !isNaN(sell)) {
          const profit = sell - cost;
          const margin = ((profit / sell) * 100).toFixed(1);
          productData.profitMargin = `${margin}%`;
          productData.profit = `$${profit.toFixed(2)}`;
          console.log(`💹 Profit: ${productData.profit} (${productData.profitMargin} margin)`);
        }
      }

      console.log('📋 Complete product data extracted:', productData);
      return productData;

    } catch (error) {
      console.error('Failed to capture product data:', error);
      return { error: error.message };
    }
  }

  async captureAllImages() {
    try {
      const images = [];
      const uniqueUrls = new Set();
      
      // Primary selectors for Spocket product images
      const productImageSelectors = [
        // Spocket-specific selectors based on your HTML structure
        'img[data-testid="feature-image"]',           // Main featured image
        'img[alt="thumbnail image"]',                 // Thumbnail images
        'img[alt="featured image"]',                  // Alternative featured image
        // React Image Lightbox (modal view)
        '.ril__image img, .ril-image img',
        '.ril__image',
        '.ril-image',
        // Generic product gallery selectors
        '[class*="product-image"] img',
        '[class*="gallery"] img',
        '[data-testid*="image"] img',
        '[data-testid*="gallery"] img',
        // CloudFront images (Spocket's CDN)
        'img[src*="listing_images"]',
        'img[src*="d2nxps5jx3f309.cloudfront.net"]',
        // Generic fallbacks
        'img[src*="product"]',
        'img[src*="gallery"]'
      ];
      
      console.log('🔍 Scanning for product images with specific selectors...');
      
      // Try each selector to find product images
      for (const selector of productImageSelectors) {
        const elements = document.querySelectorAll(selector);
        console.log(`Found ${elements.length} elements with selector: ${selector}`);
        
        for (const img of elements) {
          if (img.src && !uniqueUrls.has(img.src) && this.isProductImage(img)) {
            uniqueUrls.add(img.src);
            
            const imageData = {
              index: images.length,
              src: img.src,
              alt: img.alt || '',
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height,
              isMain: this.isMainProductImage(img),
              isVariant: this.isVariantImage(img),
              filename: this.generateImageFilename(img, images.length),
              selector: selector // Track which selector found this image
            };

            // Try to get high-resolution version
            imageData.originalSrc = this.getHighResVersion(img.src);
            
            images.push(imageData);
            console.log(`📸 Captured image ${images.length}:`, imageData.filename, `(${selector})`);
          }
        }
      }
      
      // If no images found with specific selectors, fall back to broader search
      if (images.length === 0) {
        console.log('🔍 No images found with specific selectors, trying broader search...');
        const allImages = document.querySelectorAll('img[src]');
        
        for (let i = 0; i < allImages.length; i++) {
          const img = allImages[i];
          
          if (!uniqueUrls.has(img.src) && this.isProductImage(img)) {
            uniqueUrls.add(img.src);
            
            const imageData = {
              index: images.length,
              src: img.src,
              alt: img.alt || '',
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height,
              isMain: this.isMainProductImage(img),
              isVariant: this.isVariantImage(img),
              filename: this.generateImageFilename(img, images.length),
              selector: 'fallback'
            };

            imageData.originalSrc = this.getHighResVersion(img.src);
            images.push(imageData);
            console.log(`📸 Captured image ${images.length}:`, imageData.filename, '(fallback)');
          }
        }
      }

      // Sort images - main images first, then by size
      images.sort((a, b) => {
        if (a.isMain && !b.isMain) return -1;
        if (!a.isMain && b.isMain) return 1;
        return (b.width * b.height) - (a.width * a.height);
      });
      
      console.log(`✅ Final count: ${images.length} unique product images captured`);
      return images;

    } catch (error) {
      console.error('Failed to capture images:', error);
      return [];
    }
  }

  isProductImage(img) {
    // Filter out UI elements, icons, logos
    const src = img.src.toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    const className = (img.className || '').toLowerCase();
    
    // Skip very small images (likely UI elements)
    if (img.naturalWidth < 50 || img.naturalHeight < 50) return false;
    
    // Skip common UI elements and non-product images
    const excludePatterns = [
      'logo', 'icon', 'avatar', 'favicon', 'sprite', 'background',
      'banner', 'header', 'footer', 'nav', 'menu', 'button',
      'arrow', 'close', 'search', 'filter', 'sort', 'flag'
    ];
    
    const shouldExclude = excludePatterns.some(pattern => 
      src.includes(pattern) || alt.includes(pattern) || className.includes(pattern)
    );
    
    if (shouldExclude) return false;
    
    // Positive indicators for product images
    const productIndicators = [
      // Spocket-specific patterns
      'listing_images', 'product', 'gallery', 'item', 'variant',
      // React Image Lightbox patterns
      'ril__image', 'ril-image',
      // Generic product patterns  
      'photo', 'image', 'picture', 'attachment'
    ];
    
    const hasProductIndicator = productIndicators.some(indicator => 
      src.includes(indicator) || alt.includes(indicator) || className.includes(indicator)
    );
    
    // Check if image is in a product-related container
    const inProductContainer = img.closest([
      '.ril__inner', '.ril-inner',
      '[class*="product"]', '[class*="gallery"]', 
      '[class*="carousel"]', '[class*="lightbox"]',
      '[data-testid*="image"]', '[data-testid*="gallery"]'
    ].join(','));
    
    // Accept if:
    // 1. Has clear product indicators, OR
    // 2. Is in a product container, OR  
    // 3. Is a reasonably large image (likely product) with no exclusion patterns
    return hasProductIndicator || 
           inProductContainer || 
           (img.naturalWidth >= 200 && img.naturalHeight >= 200);
  }

  isMainProductImage(img) {
    const src = img.src.toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    const className = (img.className || '').toLowerCase();
    
    // Spocket-specific main image indicators
    if (img.hasAttribute('data-testid') && img.getAttribute('data-testid') === 'feature-image') {
      return true;
    }
    
    if (alt.includes('featured image') || alt.includes('feature image')) {
      return true;
    }
    
    // Generic main image indicators
    return src.includes('main') || 
           alt.includes('main') || 
           className.includes('main') ||
           className.includes('primary') ||
           className.includes('feature') ||
           img.closest('[class*="main"]') !== null ||
           img.closest('[data-testid*="main"]') !== null ||
           img.closest('[data-testid*="feature"]') !== null;
  }

  isVariantImage(img) {
    const src = img.src.toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    
    return src.includes('variant') || 
           alt.includes('variant') ||
           src.includes('color') ||
           alt.includes('color');
  }

  getHighResVersion(src) {
    // Try to get higher resolution versions
    let highResSrc = src;
    
    // Spocket/CloudFront specific patterns
    if (src.includes('cloudfront.net')) {
      // Replace /normal/ with /large/ or /original/
      highResSrc = src.replace(/\/normal\//g, '/large/');
      if (highResSrc === src) { // If normal wasn't found, try other patterns
        highResSrc = src.replace(/\/small\//g, '/large/')
                       .replace(/\/thumb\//g, '/original/')
                       .replace(/_small\./, '_large.')
                       .replace(/_thumb\./, '_original.');
      }
    } else {
      // Generic high-res patterns
      const patterns = [
        src.replace(/\d+x\d+/, '1200x1200'),
        src.replace(/\/small\//g, '/large/'),
        src.replace(/\/thumb\//g, '/original/'),
        src.replace(/_small\./, '_large.'),
        src.replace(/_thumb\./, '_original.'),
        src + '?size=large',
        src + '&size=large'
      ];
      
      // Return the first pattern that's different from original
      highResSrc = patterns.find(pattern => pattern !== src) || src;
    }
    
    console.log(`🔍 Original: ${src.substring(src.lastIndexOf('/') + 1)}`);
    if (highResSrc !== src) {
      console.log(`📈 High-res: ${highResSrc.substring(highResSrc.lastIndexOf('/') + 1)}`);
    }
    
    return highResSrc;
  }

  generateImageFilename(img, index) {
    const productName = this.productData?.cleanName || 'spocket-product';
    const timestamp = Date.now();
    
    // Determine image type
    let suffix = '';
    if (this.isMainProductImage(img)) {
      suffix = '-main';
    } else if (this.isVariantImage(img)) {
      suffix = '-variant';
    } else {
      suffix = `-${index + 1}`;
    }
    
    return `${productName}${suffix}-${timestamp}.jpg`;
  }

  async downloadImages(images = this.capturedImages) {
    try {
      console.log(`📥 Starting download of ${images.length} images`);
      
      const results = [];
      
      for (const image of images) {
        try {
          const downloadUrl = image.originalSrc || image.src;
          
          const downloadId = await chrome.runtime.sendMessage({
            action: 'downloadImage',
            url: downloadUrl,
            filename: `spocket-images/${image.filename}`,
            productId: this.productData?.id
          });
          
          results.push({
            success: true,
            filename: image.filename,
            downloadId: downloadId,
            url: downloadUrl
          });
          
          console.log(`✅ Downloaded: ${image.filename}`);
          
        } catch (error) {
          console.error(`❌ Failed to download ${image.filename}:`, error);
          results.push({
            success: false,
            filename: image.filename,
            error: error.message
          });
        }
      }
      
      return {
        success: true,
        downloaded: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results: results
      };
      
    } catch (error) {
      console.error('Download process failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async downloadImagesAsZip(images = this.capturedImages) {
    try {
      console.log(`📦 Starting folder download of ${images.length} images`);
      
      if (!images || images.length === 0) {
        return {
          success: false,
          error: 'No images to download'
        };
      }
      
      // Add timeout to the message sending
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Download request timed out after 60 seconds'));
        }, 60000);
        
        chrome.runtime.sendMessage({
          action: 'downloadImagesAsZip',
          images: images,
          productData: this.productData
        }, (response) => {
          clearTimeout(timeout);
          
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response) {
            resolve(response);
          } else {
            reject(new Error('No response received from background script'));
          }
        });
      });
      
      if (result.success) {
        console.log(`✅ Folder download completed: ${result.message}`);
      } else {
        console.error(`❌ Folder download failed: ${result.error}`);
      }
      
      return result;
      
    } catch (error) {
      console.error('Folder download process failed:', error);
      return {
        success: false,
        error: `Download failed: ${error.message}`
      };
    }
  }

  extractProductId() {
    const match = window.location.pathname.match(/\/product\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  addCaptureIndicators() {
    // Add visual indicator that capture is active
    const indicator = document.createElement('div');
    indicator.id = 'spocket-capture-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: #FF6B35;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    indicator.textContent = '📸 Spocket Image Capture Active';
    document.body.appendChild(indicator);

    // Add capture controls if on product page
    if (this.currentPage === 'product-detail') {
      this.addCaptureControls();
    }
  }

  addCaptureControls() {
    const controls = document.createElement('div');
    controls.id = 'spocket-capture-controls';
    controls.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      min-width: 200px;
    `;
    
    const productTitle = this.productData?.title ? this.productData.title.substring(0, 30) + (this.productData.title.length > 30 ? '...' : '') : 'Unknown Product';
    const costPrice = this.productData?.costPrice || 'N/A';
    const sellPrice = this.productData?.sellPrice || 'N/A';
    const supplier = this.productData?.supplier || 'N/A';
    
    controls.innerHTML = `
      <h4 style="margin: 0 0 8px 0; color: #FF6B35;">📸 Spocket Capture</h4>
      <div style="font-size: 11px; margin-bottom: 8px; line-height: 1.3;">
        <strong>${productTitle}</strong><br>
        <span style="color: #666;">By ${supplier}</span><br>
        <span style="color: #4CAF50;">Cost: ${costPrice} → Sell: ${sellPrice}</span>
      </div>
      <div style="font-size: 12px; margin-bottom: 12px;">
        Images found: <span id="image-count">${this.capturedImages.length}</span>
      </div>
      <button id="capture-images" style="display: block; width: 100%; margin-bottom: 6px; padding: 6px; font-size: 11px;">🔄 Re-scan</button>
      <button id="download-zip" style="display: block; width: 100%; margin-bottom: 6px; padding: 6px; font-size: 11px; background: #4CAF50; color: white; border: none; border-radius: 3px; font-weight: bold;">📦 Download Folder</button>
      <button id="download-images" style="display: block; width: 100%; margin-bottom: 6px; padding: 6px; font-size: 11px;">💾 Download Individual</button>
      <button id="view-images" style="display: block; width: 100%; margin-bottom: 6px; padding: 6px; font-size: 11px;">👁️ Preview</button>
      <button id="view-data" style="display: block; width: 100%; padding: 6px; font-size: 11px;">📋 View Data</button>
    `;
    
    document.body.appendChild(controls);
    
    // Add event listeners
    document.getElementById('capture-images').addEventListener('click', async () => {
      console.log('🔄 Manual re-scan triggered...');
      this.capturedImages = await this.captureAllImages();
      document.getElementById('image-count').textContent = this.capturedImages.length;
      
      // Notify background script of updated images
      chrome.runtime.sendMessage({
        action: 'spocketProductDetected',
        productData: this.productData,
        images: this.capturedImages
      });
    });
    
    document.getElementById('download-zip').addEventListener('click', async () => {
      const button = document.getElementById('download-zip');
      const originalText = button.innerHTML;
      
      button.innerHTML = '📦 Creating folder...';
      button.disabled = true;
      
      try {
        const result = await this.downloadImagesAsZip();
        
        if (result.success) {
          button.innerHTML = '✅ Folder created!';
          alert(`✅ Successfully created product folder!\n\n📁 ${result.folderName}/\n📊 ${result.downloaded} files downloaded\n${result.failed > 0 ? `⚠️ ${result.failed} files failed` : ''}\n\nCheck your Downloads folder - it includes:\n• All product images (numbered)\n• Product data (JSON)\n• Image gallery (HTML)`);
        } else {
          button.innerHTML = '❌ Failed';
          alert(`❌ Failed to create folder: ${result.error}`);
        }
      } catch (error) {
        button.innerHTML = '❌ Error';
        alert(`❌ Error: ${error.message}`);
      }
      
      setTimeout(() => {
        button.innerHTML = originalText;
        button.disabled = false;
      }, 3000);
    });
    
    document.getElementById('download-images').addEventListener('click', async () => {
      const result = await this.downloadImages();
      alert(`Downloaded ${result.downloaded} images individually, ${result.failed} failed`);
    });
    
    document.getElementById('view-images').addEventListener('click', () => {
      this.showImagePreview();
    });
    
    document.getElementById('view-data').addEventListener('click', () => {
      this.showProductDataModal();
    });
  }

  showImagePreview() {
    // Clean up any existing modals first
    const existingModal = document.getElementById('spocket-image-preview');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal to preview captured images
    const modal = document.createElement('div');
    modal.id = 'spocket-image-preview';
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 24px;
      max-width: 800px;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
    `;

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: #f44336;
      color: white;
      border: none;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      cursor: pointer;
      font-size: 16px;
      z-index: 1;
    `;
    
    // Create download buttons
    const downloadFolderBtn = document.createElement('button');
    downloadFolderBtn.innerHTML = '📦 Download Folder';
    downloadFolderBtn.style.cssText = `
      background: #4CAF50;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      margin-right: 10px;
      font-weight: bold;
    `;
    
    const downloadBtn = document.createElement('button');
    downloadBtn.innerHTML = '💾 Individual Files';
    downloadBtn.style.cssText = `
      background: #2196F3;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      margin-right: 10px;
    `;

    // Create regular close button
    const closeTextBtn = document.createElement('button');
    closeTextBtn.innerHTML = 'Close';
    closeTextBtn.style.cssText = `
      background: #666;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
    `;

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 16px;
    `;
    
    buttonContainer.appendChild(downloadFolderBtn);
    buttonContainer.appendChild(downloadBtn);
    buttonContainer.appendChild(closeTextBtn);

    dialog.innerHTML = `
      <h2 style="margin-top: 0;">📸 Captured Images (${this.capturedImages.length})</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; margin: 16px 0;">
        ${this.capturedImages.map((img, index) => `
          <div style="border: 1px solid #ddd; border-radius: 4px; padding: 8px; text-align: center;">
            <img src="${img.src}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 4px;" />
            <div style="font-size: 11px; margin: 8px 0;">${img.filename}</div>
            <div style="font-size: 10px; color: #666;">${img.width}x${img.height}</div>
            ${img.selector ? `<div style="background: #2196F3; color: white; font-size: 8px; padding: 1px 3px; border-radius: 2px; margin: 1px;">${img.selector}</div>` : ''}
            ${img.isMain ? '<div style="background: #4CAF50; color: white; font-size: 9px; padding: 2px 4px; border-radius: 2px; margin: 2px;">MAIN</div>' : ''}
            ${img.isVariant ? '<div style="background: #FF9800; color: white; font-size: 9px; padding: 2px 4px; border-radius: 2px; margin: 2px;">VARIANT</div>' : ''}
          </div>
        `).join('')}
      </div>
    `;

    // Add buttons to dialog
    dialog.appendChild(closeBtn);
    dialog.appendChild(buttonContainer);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // Add event listeners directly (no global functions)
    const closeModal = () => {
      try {
        if (modal && modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      } catch (error) {
        console.error('Error closing modal:', error);
      }
    };

    const downloadFolder = async () => {
      try {
        console.log('📦 Starting folder creation...');
        downloadFolderBtn.innerHTML = '📦 Creating...';
        downloadFolderBtn.disabled = true;
        
        const result = await this.downloadImagesAsZip();
        
        if (result.success) {
          downloadFolderBtn.innerHTML = '✅ Created!';
          alert(`✅ Product folder created successfully!\n\n📁 ${result.folderName}/\n📊 ${result.downloaded} files\n\nIncludes: Images + JSON data + HTML gallery`);
          setTimeout(() => closeModal(), 1500);
        } else {
          downloadFolderBtn.innerHTML = '❌ Failed';
          alert(`❌ Folder creation failed: ${result.error}`);
        }
      } catch (error) {
        console.error('Folder creation error:', error);
        downloadFolderBtn.innerHTML = '❌ Error';
        alert(`❌ Folder creation error: ${error.message}`);
      }
    };

    const downloadAll = async () => {
      try {
        console.log('🔄 Starting individual download process...');
        downloadBtn.innerHTML = '💾 Downloading...';
        downloadBtn.disabled = true;
        
        const result = await this.downloadImages();
        
        if (result.success) {
          downloadBtn.innerHTML = '✅ Done!';
          alert(`✅ Downloaded ${result.downloaded} images individually!${result.failed > 0 ? ` (${result.failed} failed)` : ''}`);
        } else {
          downloadBtn.innerHTML = '❌ Failed';
          alert(`❌ Download failed: ${result.error}`);
        }
        
        setTimeout(() => closeModal(), 1500);
      } catch (error) {
        console.error('Download error:', error);
        downloadBtn.innerHTML = '❌ Error';
        alert(`❌ Download error: ${error.message}`);
      }
    };

    // Bind events
    closeBtn.addEventListener('click', closeModal);
    closeTextBtn.addEventListener('click', closeModal);
    downloadFolderBtn.addEventListener('click', downloadFolder);
    downloadBtn.addEventListener('click', downloadAll);

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // Close on Escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);

    console.log('🖼️ Image preview modal opened');
  }

  showProductDataModal() {
    // Clean up any existing modals first
    const existingModal = document.getElementById('spocket-data-preview');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal to display captured product data
    const modal = document.createElement('div');
    modal.id = 'spocket-data-preview';
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 24px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
    `;

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: #f44336;
      color: white;
      border: none;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      cursor: pointer;
      font-size: 14px;
      z-index: 1;
    `;

    // Format the product data for display
    const formatDataRow = (label, value, color = '#333') => {
      if (!value || value === 'N/A') return '';
      return `<tr><td style="padding: 4px 12px 4px 0; font-weight: bold; color: #666; vertical-align: top; white-space: nowrap;">${label}:</td><td style="padding: 4px 0; color: ${color};">${value}</td></tr>`;
    };

    const formatShipping = (shipping) => {
      if (!shipping) return 'N/A';
      return Object.entries(shipping).map(([country, time]) => `${country}: ${time}`).join('<br>');
    };

    dialog.innerHTML = `
      <h2 style="margin-top: 0; margin-bottom: 20px;">📋 Product Data</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${formatDataRow('Title', this.productData?.title)}
        ${formatDataRow('Supplier', this.productData?.supplier)}
        ${formatDataRow('Origin', this.productData?.origin)}
        ${formatDataRow('Cost Price', this.productData?.costPrice, '#e91e63')}
        ${formatDataRow('Sell Price', this.productData?.sellPrice, '#4CAF50')}
        ${formatDataRow('Profit', this.productData?.profit, '#4CAF50')}
        ${formatDataRow('Margin', this.productData?.profitMargin, '#4CAF50')}
        ${formatDataRow('Description', this.productData?.description ? this.productData.description.substring(0, 200) + (this.productData.description.length > 200 ? '...' : '') : '')}
        ${formatDataRow('Hashtags', this.productData?.hashtags?.join(' '))}
        ${formatDataRow('Processing Time', this.productData?.processingTime)}
        ${formatDataRow('Shipping Times', formatShipping(this.productData?.shipping))}
        ${formatDataRow('Shipping Options', this.productData?.shippingOptions ? this.productData.shippingOptions.join('<br>') : this.productData?.shippingCost)}
        ${formatDataRow('Return Policy', this.productData?.returnPolicy)}
        ${formatDataRow('Payment Methods', this.productData?.paymentMethods?.join(', '))}
        ${this.productData?.pushedToStore ? `<tr><td colspan="2" style="padding: 8px 0; color: #4CAF50; font-weight: bold;">✅ ${this.productData.storeStatus || 'Product is in store'}</td></tr>` : ''}
        ${this.productData?.marketplaceAvailable ? '<tr><td colspan="2" style="padding: 8px 0; color: #2196F3; font-weight: bold;">🛒 Available for marketplace</td></tr>' : ''}
      </table>
      
      <div style="margin-top: 20px; padding: 12px; background: #f5f5f5; border-radius: 4px; font-size: 12px;">
        <strong>URL:</strong> <a href="${this.productData?.url || '#'}" target="_blank" style="word-break: break-all;">${this.productData?.url || 'N/A'}</a><br>
        <strong>Captured:</strong> ${new Date(this.productData?.timestamp || Date.now()).toLocaleString()}<br>
        <strong>Images:</strong> ${this.capturedImages?.length || 0} found
      </div>
    `;

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 16px;
    `;

    // Create copy data button
    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = '📋 Copy Data';
    copyBtn.style.cssText = `
      background: #2196F3;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
    `;

    // Create close button
    const closeTextBtn = document.createElement('button');
    closeTextBtn.innerHTML = 'Close';
    closeTextBtn.style.cssText = `
      background: #666;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
    `;

    buttonContainer.appendChild(copyBtn);
    buttonContainer.appendChild(closeTextBtn);

    dialog.appendChild(closeBtn);
    dialog.appendChild(buttonContainer);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // Event handlers
    const closeModal = () => {
      try {
        if (modal && modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      } catch (error) {
        console.error('Error closing modal:', error);
      }
    };

    const copyData = async () => {
      try {
        const dataText = JSON.stringify(this.productData, null, 2);
        await navigator.clipboard.writeText(dataText);
        copyBtn.innerHTML = '✅ Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = '📋 Copy Data';
        }, 2000);
      } catch (error) {
        console.error('Failed to copy data:', error);
        alert('Failed to copy data to clipboard');
      }
    };

    // Bind events
    closeBtn.addEventListener('click', closeModal);
    closeTextBtn.addEventListener('click', closeModal);
    copyBtn.addEventListener('click', copyData);

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // Close on Escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);

    console.log('📋 Product data modal opened');
  }

  watchForImageLoading() {
    // Watch for dynamically loaded images
    const observer = new MutationObserver((mutations) => {
      let newImages = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          const addedImages = Array.from(mutation.addedNodes)
            .filter(node => node.tagName === 'IMG')
            .filter(img => this.isProductImage(img));
          
          if (addedImages.length > 0) {
            newImages = true;
          }
        }
      });
      
      if (newImages) {
        console.log('🔄 New images detected, re-scanning...');
        setTimeout(() => {
          this.captureAllImages().then(images => {
            this.capturedImages = images;
            const countEl = document.getElementById('image-count');
            if (countEl) countEl.textContent = images.length;
          });
        }, 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SpocketImageCapture());
} else {
  new SpocketImageCapture();
}