// Content script for Square Dashboard automation

class SquareAutomation {
  constructor() {
    this.isSquarePage = window.location.hostname.includes('squareup.com');
    this.currentPage = this.detectPageType();
    this.init();
  }

  init() {
    if (!this.isSquarePage) return;

    console.log('Square Automation initialized on:', this.currentPage);
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });
    
    // Initialize page-specific automation
    this.initPageAutomation();
    
    // Add visual indicators
    this.addAutomationIndicators();
    
    // Watch for page navigation
    this.watchForNavigation();
  }

  detectPageType() {
    const url = window.location.pathname;
    
    if (url.includes('/items/library')) {
      if (url.match(/\/items\/library\/[A-Z0-9]+$/)) {
        return 'item-detail';
      }
      return 'items-library';
    }
    
    if (url.includes('/dashboard')) return 'dashboard';
    if (url.includes('/items')) return 'items';
    
    return 'unknown';
  }

  handleMessage(message, sender, sendResponse) {
    console.log('Content script received:', message);

    switch (message.action) {
      case 'ping':
        sendResponse({ success: true, status: 'Content script active' });
        break;

      case 'executeTask':
        this.executeTask(message.task).then(sendResponse);
        return true; // Will respond asynchronously

      case 'getPageInfo':
        sendResponse({
          success: true,
          pageType: this.currentPage,
          url: window.location.href,
          title: document.title
        });
        break;

      case 'findImages':
        this.findImagesOnPage().then(sendResponse);
        return true;

      case 'updateSEO':
        this.updateSEOFields(message.data).then(result => {
          sendResponse(result);
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
        return true;

      case 'navigateToItem':
        this.navigateToItem(message.itemId).then(sendResponse);
        return true;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  }

  async executeTask(task) {
    try {
      switch (task.type) {
        case 'updateItemSEO':
          return await this.updateItemSEO(task.itemId, task.seoData);
        
        case 'attachImage':
          return await this.attachImageToItem(task.itemId, task.imageUrl);
        
        case 'bulkUpdateItems':
          return await this.bulkUpdateItems(task.items);
        
        case 'navigateToItem':
          return await this.navigateToItem(task.itemId);
        
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
    } catch (error) {
      console.error('Task execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  async updateSEOFields(seoData) {
    try {
      console.log('🔄 Starting SEO update with data:', seoData);

      // Simple field detection - look for common form fields
      const allInputs = document.querySelectorAll('input, textarea');
      console.log(`Found ${allInputs.length} form fields on page`);

      let updated = { description: false, title: false, fieldsFound: 0 };

      // Update any description-like fields
      if (seoData.description) {
        const descriptionFields = document.querySelectorAll('textarea, input[type="text"]');
        console.log(`Found ${descriptionFields.length} potential description fields`);
        
        for (const field of descriptionFields) {
          if (field.placeholder?.toLowerCase().includes('description') || 
              field.name?.toLowerCase().includes('description') ||
              field.getAttribute('aria-label')?.toLowerCase().includes('description')) {
            
            console.log('✓ Found description field:', field);
            await this.updateField(field, seoData.description);
            updated.description = true;
            updated.fieldsFound++;
            break;
          }
        }
      }

      // Update any title/name fields
      if (seoData.title) {
        const titleFields = document.querySelectorAll('input[type="text"]');
        
        for (const field of titleFields) {
          if (field.placeholder?.toLowerCase().includes('name') || 
              field.placeholder?.toLowerCase().includes('title') ||
              field.name?.toLowerCase().includes('name') ||
              field.name?.toLowerCase().includes('title')) {
            
            console.log('✓ Found title field:', field);
            await this.updateField(field, seoData.title);
            updated.title = true;
            updated.fieldsFound++;
            break;
          }
        }
      }

      // If no specific fields found, just update the first few text fields
      if (updated.fieldsFound === 0) {
        console.log('⚠️ No specific SEO fields found, updating first available fields');
        
        const textFields = document.querySelectorAll('input[type="text"], textarea');
        if (textFields.length > 0 && seoData.description) {
          await this.updateField(textFields[0], seoData.description);
          updated.description = true;
          updated.fieldsFound++;
        }
      }

      // Try to save changes
      await this.saveChanges();

      const message = updated.fieldsFound > 0 
        ? `Updated ${updated.fieldsFound} field(s) successfully`
        : 'No suitable fields found to update';

      console.log('✅ SEO update completed:', message);

      return { 
        success: true, 
        message: message,
        updated: updated
      };

    } catch (error) {
      console.error('❌ Failed to update SEO fields:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async updateItemSEO(itemId, seoData) {
    // Navigate to item if not already there
    if (this.currentPage !== 'item-detail' || !window.location.pathname.includes(itemId)) {
      await this.navigateToItem(itemId);
    }

    return await this.updateSEOFields(seoData);
  }

  async findSEODescriptionField() {
    const selectors = [
      'textarea[name*="description"]',
      'textarea[placeholder*="description"]',
      'textarea[aria-label*="description"]',
      'input[name*="description"]',
      '[data-testid*="description"] textarea',
      '[data-testid*="description"] input'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        return element;
      }
    }

    return null;
  }

  async findSEOTitleField() {
    const selectors = [
      'input[name*="title"]',
      'input[name*="name"]',
      'input[placeholder*="title"]',
      'input[placeholder*="name"]',
      '[data-testid*="title"] input',
      '[data-testid*="name"] input'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        return element;
      }
    }

    return null;
  }

  async updateField(field, value) {
    // Clear existing value
    field.focus();
    field.select();
    field.value = '';

    // Type new value with realistic delays
    for (let i = 0; i < value.length; i++) {
      field.value += value[i];
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await this.sleep(10 + Math.random() * 20); // 10-30ms delay
    }

    // Trigger change event
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.blur();
  }

  async saveChanges() {
    const saveSelectors = [
      'button[type="submit"]',
      'button:contains("Save")',
      'button:contains("Update")',
      '[data-testid*="save"]',
      '[data-testid*="submit"]',
      '.save-button',
      '.submit-button'
    ];

    for (const selector of saveSelectors) {
      const button = document.querySelector(selector);
      if (button && !button.disabled && button.offsetParent !== null) {
        button.click();
        await this.sleep(2000); // Wait for save
        return true;
      }
    }

    // Try keyboard shortcut as fallback
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true
    }));

    await this.sleep(2000);
    return true;
  }

  async attachImageToItem(itemId, imageUrl) {
    // Navigate to item if needed
    if (this.currentPage !== 'item-detail' || !window.location.pathname.includes(itemId)) {
      await this.navigateToItem(itemId);
    }

    try {
      // Look for image upload area
      const uploadArea = await this.findImageUploadArea();
      if (!uploadArea) {
        throw new Error('Image upload area not found');
      }

      // Download image and create file object
      const imageBlob = await this.downloadImage(imageUrl);
      const file = new File([imageBlob], `image-${Date.now()}.jpg`, { type: 'image/jpeg' });

      // Simulate file drop or input
      await this.uploadImageFile(uploadArea, file);

      return { 
        success: true, 
        message: `Image attached to item ${itemId}` 
      };

    } catch (error) {
      throw new Error(`Failed to attach image: ${error.message}`);
    }
  }

  async findImageUploadArea() {
    const selectors = [
      'input[type="file"][accept*="image"]',
      '[data-testid*="image-upload"]',
      '[data-testid*="photo-upload"]',
      '.image-upload',
      '.photo-upload',
      '.file-upload'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    return null;
  }

  async downloadImage(imageUrl) {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    return await response.blob();
  }

  async uploadImageFile(uploadElement, file) {
    if (uploadElement.type === 'file') {
      // Direct file input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      uploadElement.files = dataTransfer.files;
      uploadElement.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Drag and drop area
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        dataTransfer: dataTransfer
      });
      
      uploadElement.dispatchEvent(dropEvent);
    }

    // Wait for upload to process
    await this.sleep(3000);
  }

  async navigateToItem(itemId) {
    const targetUrl = `https://app.squareup.com/dashboard/items/library/${itemId}`;
    
    if (window.location.href !== targetUrl) {
      window.location.href = targetUrl;
      
      // Wait for navigation
      await new Promise(resolve => {
        const checkLoad = () => {
          if (window.location.href === targetUrl && document.readyState === 'complete') {
            resolve();
          } else {
            setTimeout(checkLoad, 100);
          }
        };
        checkLoad();
      });
    }

    this.currentPage = 'item-detail';
    return { success: true, url: window.location.href };
  }

  async findImagesOnPage() {
    const images = [];
    const imageElements = document.querySelectorAll('img[src]');

    imageElements.forEach((img, index) => {
      if (img.src && img.src.startsWith('http')) {
        images.push({
          index,
          src: img.src,
          alt: img.alt || '',
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          isProductImage: this.isProductImage(img)
        });
      }
    });

    return { success: true, images };
  }

  isProductImage(img) {
    // Detect if image is likely a product image
    const src = img.src.toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    
    // Check for Square CDN or common product image patterns
    return src.includes('squarecdn.com') || 
           src.includes('product') || 
           src.includes('item') ||
           alt.includes('product') ||
           alt.includes('item') ||
           (img.naturalWidth > 200 && img.naturalHeight > 200);
  }

  initPageAutomation() {
    // Add page-specific automation based on current page
    switch (this.currentPage) {
      case 'items-library':
        this.initItemsLibraryAutomation();
        break;
      case 'item-detail':
        this.initItemDetailAutomation();
        break;
    }
  }

  initItemsLibraryAutomation() {
    // Add bulk action buttons and item selection
    this.addBulkActionControls();
  }

  initItemDetailAutomation() {
    // Add quick action buttons for SEO updates
    this.addQuickActionButtons();
  }

  addAutomationIndicators() {
    // Add visual indicator that automation is active
    const indicator = document.createElement('div');
    indicator.id = 'square-automation-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #4CAF50;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    indicator.textContent = '🤖 Square Automation Active';
    document.body.appendChild(indicator);
  }

  addBulkActionControls() {
    // Add bulk action controls to items library
    const controls = document.createElement('div');
    controls.id = 'bulk-automation-controls';
    controls.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
    `;
    
    controls.innerHTML = `
      <h4 style="margin: 0 0 12px 0;">Bulk Actions</h4>
      <button id="bulk-update-seo" style="display: block; width: 100%; margin-bottom: 8px;">Update SEO</button>
      <button id="bulk-attach-images" style="display: block; width: 100%;">Attach Images</button>
    `;
    
    document.body.appendChild(controls);
    
    // Add event listeners
    document.getElementById('bulk-update-seo').addEventListener('click', () => {
      this.startBulkSEOUpdate();
    });
    
    document.getElementById('bulk-attach-images').addEventListener('click', () => {
      this.startBulkImageAttachment();
    });
  }

  addQuickActionButtons() {
    // Add quick action buttons to item detail page
    const quickActions = document.createElement('div');
    quickActions.id = 'quick-automation-actions';
    quickActions.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
    `;
    
    quickActions.innerHTML = `
      <h4 style="margin: 0 0 12px 0;">Quick Actions</h4>
      <button id="quick-seo-update" style="display: block; width: 100%; margin-bottom: 8px;">Auto SEO Update</button>
      <button id="find-images" style="display: block; width: 100%;">Find & Attach Images</button>
    `;
    
    document.body.appendChild(quickActions);
    
    // Add event listeners
    document.getElementById('quick-seo-update').addEventListener('click', () => {
      this.autoUpdateCurrentItemSEO();
    });
    
    document.getElementById('find-images').addEventListener('click', () => {
      this.findAndAttachImages();
    });
  }

  async startBulkSEOUpdate() {
    console.log('Starting bulk SEO update...');
    // Implementation for bulk SEO updates
  }

  async startBulkImageAttachment() {
    console.log('Starting bulk image attachment...');
    // Implementation for bulk image attachment
  }

  async autoUpdateCurrentItemSEO() {
    const itemId = this.extractItemIdFromUrl();
    if (!itemId) {
      alert('Could not determine current item ID');
      return;
    }

    // Get SEO data from background script or generate it
    const seoData = await this.generateSEOData(itemId);
    
    try {
      const result = await this.updateItemSEO(itemId, seoData);
      if (result.success) {
        alert('SEO updated successfully!');
      } else {
        alert('SEO update failed: ' + result.error);
      }
    } catch (error) {
      alert('Error updating SEO: ' + error.message);
    }
  }

  async findAndAttachImages() {
    const itemId = this.extractItemIdFromUrl();
    if (!itemId) {
      alert('Could not determine current item ID');
      return;
    }

    // Ask background script to find images for this item
    const response = await chrome.runtime.sendMessage({
      action: 'findProductImages',
      itemId: itemId
    });

    if (response.success && response.images.length > 0) {
      // Show image selection dialog
      this.showImageSelectionDialog(itemId, response.images);
    } else {
      alert('No images found for this item');
    }
  }

  showImageSelectionDialog(itemId, images) {
    // Create modal dialog for image selection
    const modal = document.createElement('div');
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
    `;

    dialog.innerHTML = `
      <h2>Select Images for Item</h2>
      <div id="image-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; margin: 16px 0;">
        ${images.map((img, index) => `
          <div style="border: 1px solid #ddd; border-radius: 4px; padding: 8px;">
            <img src="${img}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 4px;" />
            <button onclick="attachImage('${itemId}', '${img}')" style="width: 100%; margin-top: 8px;">Attach</button>
          </div>
        `).join('')}
      </div>
      <button onclick="closeImageDialog()" style="margin-top: 16px;">Close</button>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // Add global functions for dialog interaction
    window.attachImage = async (itemId, imageUrl) => {
      try {
        const result = await this.attachImageToItem(itemId, imageUrl);
        if (result.success) {
          alert('Image attached successfully!');
        } else {
          alert('Failed to attach image: ' + result.error);
        }
      } catch (error) {
        alert('Error attaching image: ' + error.message);
      }
    };

    window.closeImageDialog = () => {
      document.body.removeChild(modal);
      delete window.attachImage;
      delete window.closeImageDialog;
    };
  }

  extractItemIdFromUrl() {
    const match = window.location.pathname.match(/\/items\/library\/([A-Z0-9]+)/);
    return match ? match[1] : null;
  }

  async generateSEOData(itemId) {
    // Generate or retrieve SEO data for the item
    return {
      description: 'Auto-generated SEO description for improved search visibility',
      title: document.title.replace(' | Square Dashboard', '')
    };
  }

  watchForNavigation() {
    // Watch for URL changes to update page type
    let currentUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        this.currentPage = this.detectPageType();
        this.initPageAutomation();
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

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize automation when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SquareAutomation());
} else {
  new SquareAutomation();
}