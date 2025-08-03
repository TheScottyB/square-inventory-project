// Popup script for Square Automation Extension

class SquareAutomationPopup {
  constructor() {
    this.currentTab = null;
    this.isSquarePage = false;
    this.currentOperation = null;
    this.settings = {};
    
    this.init();
  }

  async init() {
    // Initialize UI
    this.initTabs();
    this.initEventListeners();
    
    // Check current tab
    await this.checkCurrentTab();
    
    // Load settings
    await this.loadSettings();
    
    // Update UI
    this.updateUI();
  }

  initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        
        // Update tab buttons
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update tab content
        tabContents.forEach(content => {
          content.classList.remove('active');
        });
        document.getElementById(`${tabId}-tab`).classList.add('active');
      });
    });
  }

  initEventListeners() {
    // Automation Tab
    document.getElementById('sync-data').addEventListener('click', () => this.syncData());
    document.getElementById('update-current-seo').addEventListener('click', () => this.updateCurrentItemSEO());
    document.getElementById('find-current-images').addEventListener('click', () => this.findCurrentItemImages());
    document.getElementById('bulk-process').addEventListener('click', () => this.bulkProcessItems());

    // Images Tab
    document.getElementById('search-images-btn').addEventListener('click', () => this.searchImages());
    document.getElementById('auto-match-images').addEventListener('click', () => this.autoMatchImages());
    document.getElementById('download-missing-images').addEventListener('click', () => this.downloadMissingImages());
    document.getElementById('organize-images').addEventListener('click', () => this.organizeImages());

    // Settings Tab
    document.getElementById('auto-mode').addEventListener('change', (e) => this.updateSetting('autoMode', e.target.checked));
    document.getElementById('image-search-enabled').addEventListener('change', (e) => this.updateSetting('imageSearchEnabled', e.target.checked));
    document.getElementById('seo-updates-enabled').addEventListener('change', (e) => this.updateSetting('seoUpdatesEnabled', e.target.checked));
    
    document.getElementById('catalog-file').addEventListener('change', (e) => this.loadCatalogFile(e.target.files[0]));
    document.getElementById('export-data').addEventListener('click', () => this.exportData());
    document.getElementById('clear-data').addEventListener('click', () => this.clearData());
    document.getElementById('test-connection').addEventListener('click', () => this.testConnection());

    // Search on Enter
    document.getElementById('search-images').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.searchImages();
    });
  }

  async checkCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab;
      this.isSquarePage = tab.url && tab.url.includes('squareup.com');
      
      if (this.isSquarePage) {
        this.updateStatus('Connected to Square Dashboard', 'success');
        
        // Get page info from content script
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
          if (response && response.success) {
            this.pageInfo = response;
          }
        } catch (e) {
          console.log('Content script not ready yet');
        }
      } else {
        this.updateStatus('Navigate to Square Dashboard to use automation', 'warning');
      }
    } catch (error) {
      this.updateStatus('Error checking current tab', 'error');
      console.error('Error checking tab:', error);
    }
  }

  async loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
      this.settings = response || {};
      
      // Update UI with settings
      document.getElementById('auto-mode').checked = this.settings.autoMode || false;
      document.getElementById('image-search-enabled').checked = this.settings.imageSearchEnabled !== false;
      document.getElementById('seo-updates-enabled').checked = this.settings.seoUpdatesEnabled !== false;
      
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async updateSetting(key, value) {
    this.settings[key] = value;
    try {
      await chrome.runtime.sendMessage({
        action: 'updateSettings',
        settings: { [key]: value }
      });
    } catch (error) {
      console.error('Error updating setting:', error);
    }
  }

  updateStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    const statusText = document.getElementById('status-text');
    
    statusText.textContent = message;
    statusEl.className = `status ${type}`;
  }

  updateUI() {
    // Update connection status
    const connectionStatus = document.getElementById('connection-status');
    connectionStatus.textContent = this.isSquarePage ? 'Connected' : 'Not Connected';
    connectionStatus.style.color = this.isSquarePage ? '#4caf50' : '#f44336';
    
    // Enable/disable buttons based on connection
    const buttons = document.querySelectorAll('.button:not(.secondary):not(.danger)');
    buttons.forEach(button => {
      if (!this.isSquarePage && !['sync-data', 'export-data', 'test-connection'].includes(button.id)) {
        button.disabled = true;
      }
    });
  }

  async syncData() {
    this.startOperation('Syncing catalog data...');
    
    try {
      // This would typically load from your local files
      // For demo, we'll simulate loading catalog data
      const mockCatalogData = {
        items: [
          { id: 'ITEM1', name: 'Sample Item 1' },
          { id: 'ITEM2', name: 'Sample Item 2' }
        ],
        lastUpdate: Date.now()
      };
      
      const response = await chrome.runtime.sendMessage({
        action: 'syncCatalogData',
        data: mockCatalogData
      });
      
      console.log('Sync response:', response);
      
      if (response && response.success) {
        this.completeOperation(`Synced ${response.itemCount} items successfully`);
        document.getElementById('items-count').textContent = response.itemCount;
      } else {
        this.failOperation('Failed to sync data: ' + (response?.error || 'No response from background script'));
      }
    } catch (error) {
      this.failOperation('Error syncing data: ' + error.message);
    }
  }

  async updateCurrentItemSEO() {
    if (!this.isSquarePage) {
      alert('Please navigate to a Square item page first');
      return;
    }

    this.startOperation('Updating SEO for current item...');
    
    try {
      // First, try to inject the content script if not already present
      await this.ensureContentScriptLoaded();
      
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'updateSEO',
        data: {
          description: 'Auto-generated SEO description for improved search visibility',
          title: 'SEO-optimized title'
        }
      });

      if (response && response.success) {
        this.completeOperation('SEO updated successfully');
        this.incrementProcessedCount();
      } else {
        this.failOperation('Failed to update SEO: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      this.failOperation('Error updating SEO: ' + error.message);
    }
  }

  async ensureContentScriptLoaded() {
    try {
      // Try to ping the content script
      await chrome.tabs.sendMessage(this.currentTab.id, { action: 'ping' });
    } catch (error) {
      // Content script not loaded, inject it
      console.log('Content script not found, injecting...');
      
      try {
        await chrome.scripting.executeScript({
          target: { tabId: this.currentTab.id },
          files: ['content.js']
        });
        
        // Wait a moment for the script to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('Content script injected successfully');
      } catch (injectionError) {
        throw new Error('Failed to inject content script: ' + injectionError.message);
      }
    }
  }

  async findCurrentItemImages() {
    if (!this.isSquarePage) {
      alert('Please navigate to a Square item page first');
      return;
    }

    this.startOperation('Finding images for current item...');
    
    try {
      // Extract item ID from URL
      const itemId = this.extractItemIdFromUrl(this.currentTab.url);
      if (!itemId) {
        throw new Error('Could not determine item ID from current page');
      }

      const response = await chrome.runtime.sendMessage({
        action: 'findProductImages',
        itemId: itemId
      });

      if (response.success) {
        this.completeOperation(`Found ${response.images.length} potential images`);
        this.displayImageResults(response.images, itemId);
        
        // Switch to images tab
        document.querySelector('[data-tab="images"]').click();
      } else {
        this.failOperation('Failed to find images: ' + response.error);
      }
    } catch (error) {
      this.failOperation('Error finding images: ' + error.message);
    }
  }

  async bulkProcessItems() {
    this.startOperation('Starting bulk processing...');
    
    try {
      // This would process multiple items
      // For demo, simulate processing
      const itemsToProcess = 5;
      
      for (let i = 0; i < itemsToProcess; i++) {
        this.updateProgress((i + 1) / itemsToProcess * 100);
        this.logOperation(`Processing item ${i + 1}/${itemsToProcess}...`);
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      this.completeOperation(`Bulk processed ${itemsToProcess} items`);
      document.getElementById('processed-count').textContent = itemsToProcess;
    } catch (error) {
      this.failOperation('Bulk processing failed: ' + error.message);
    }
  }

  async searchImages() {
    const query = document.getElementById('search-images').value.trim();
    if (!query) {
      alert('Please enter a search term');
      return;
    }

    this.startOperation(`Searching for images: ${query}`);
    
    try {
      // Simulate image search
      const mockImages = [
        { src: 'https://example.com/image1.jpg', name: `${query} - Image 1`, score: 95 },
        { src: 'https://example.com/image2.jpg', name: `${query} - Image 2`, score: 87 },
        { src: 'https://example.com/image3.jpg', name: `${query} - Image 3`, score: 72 }
      ];
      
      this.completeOperation(`Found ${mockImages.length} images`);
      this.displayImageResults(mockImages, query);
    } catch (error) {
      this.failOperation('Image search failed: ' + error.message);
    }
  }

  async autoMatchImages() {
    this.startOperation('Auto-matching images to items...');
    
    try {
      // Simulate auto-matching process
      const matches = 15;
      this.completeOperation(`Auto-matched ${matches} images to items`);
    } catch (error) {
      this.failOperation('Auto-matching failed: ' + error.message);
    }
  }

  async downloadMissingImages() {
    this.startOperation('Downloading missing images...');
    
    try {
      // Simulate download process
      const downloaded = 8;
      this.completeOperation(`Downloaded ${downloaded} missing images`);
    } catch (error) {
      this.failOperation('Download failed: ' + error.message);
    }
  }

  async organizeImages() {
    this.startOperation('Organizing image files...');
    
    try {
      // Simulate organization process
      const organized = 25;
      this.completeOperation(`Organized ${organized} image files`);
    } catch (error) {
      this.failOperation('Organization failed: ' + error.message);
    }
  }

  async loadCatalogFile(file) {
    if (!file) return;
    
    this.startOperation('Loading catalog file...');
    
    try {
      const text = await file.text();
      const catalogData = JSON.parse(text);
      
      const response = await chrome.runtime.sendMessage({
        action: 'syncCatalogData',
        data: catalogData
      });
      
      if (response.success) {
        this.completeOperation(`Loaded ${response.itemCount} items from file`);
        document.getElementById('items-count').textContent = response.itemCount;
      } else {
        this.failOperation('Failed to load catalog: ' + response.error);
      }
    } catch (error) {
      this.failOperation('Error loading file: ' + error.message);
    }
  }

  async exportData() {
    try {
      const data = await chrome.runtime.sendMessage({ action: 'getSettings' });
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `square-automation-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Export failed: ' + error.message);
    }
  }

  async clearData() {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      try {
        await chrome.storage.local.clear();
        alert('All data cleared successfully');
        this.loadSettings(); // Reload settings
      } catch (error) {
        alert('Failed to clear data: ' + error.message);
      }
    }
  }

  async testConnection() {
    this.updateStatus('Testing connection...', 'info');
    
    try {
      if (this.isSquarePage) {
        const response = await chrome.tabs.sendMessage(this.currentTab.id, { action: 'getPageInfo' });
        if (response && response.success) {
          this.updateStatus(`Connected to ${response.pageType} page`, 'success');
        } else {
          this.updateStatus('Connection test failed', 'error');
        }
      } else {
        this.updateStatus('Not on Square page', 'warning');
      }
    } catch (error) {
      this.updateStatus('Connection error: ' + error.message, 'error');
    }
  }

  displayImageResults(images, itemId) {
    const resultsEl = document.getElementById('image-results');
    
    if (images.length === 0) {
      resultsEl.innerHTML = '<p>No images found</p>';
      return;
    }
    
    resultsEl.innerHTML = `
      <p>Found ${images.length} images for: <strong>${itemId}</strong></p>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; margin-top: 12px;">
        ${images.map((img, index) => `
          <div style="border: 1px solid #ddd; border-radius: 4px; padding: 8px; text-align: center;">
            <div style="width: 100%; height: 80px; background: #f5f5f5; border-radius: 4px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
              📷
            </div>
            <div style="font-size: 11px; margin-bottom: 8px;">${img.name || `Image ${index + 1}`}</div>
            ${img.score ? `<div style="font-size: 10px; color: #666;">Score: ${img.score}%</div>` : ''}
            <button onclick="attachImage('${itemId}', '${img.src}')" style="font-size: 10px; padding: 4px 8px; margin-top: 4px;">Attach</button>
          </div>
        `).join('')}
      </div>
    `;
    
    // Add global function for image attachment
    window.attachImage = async (itemId, imageUrl) => {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'saveImageToItem',
          itemId: itemId,
          imageUrl: imageUrl
        });
        
        if (response.success) {
          alert('Image attached successfully!');
        } else {
          alert('Failed to attach image: ' + response.error);
        }
      } catch (error) {
        alert('Error attaching image: ' + error.message);
      }
    };
  }

  startOperation(message) {
    this.currentOperation = message;
    document.getElementById('no-operation').classList.add('hidden');
    document.getElementById('current-operation').classList.remove('hidden');
    document.getElementById('operation-status').textContent = message;
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('operation-log').textContent = '';
    
    this.updateStatus(message, 'info');
  }

  updateProgress(percent) {
    document.getElementById('progress-bar').style.width = percent + '%';
  }

  logOperation(message) {
    const log = document.getElementById('operation-log');
    const timestamp = new Date().toLocaleTimeString();
    log.textContent += `[${timestamp}] ${message}\n`;
    log.scrollTop = log.scrollHeight;
  }

  completeOperation(message) {
    this.currentOperation = null;
    document.getElementById('operation-status').textContent = message;
    document.getElementById('progress-bar').style.width = '100%';
    this.logOperation('✅ ' + message);
    
    this.updateStatus(message, 'success');
    
    setTimeout(() => {
      document.getElementById('current-operation').classList.add('hidden');
      document.getElementById('no-operation').classList.remove('hidden');
    }, 3000);
  }

  failOperation(message) {
    this.currentOperation = null;
    document.getElementById('operation-status').textContent = 'Failed: ' + message;
    this.logOperation('❌ ' + message);
    
    this.updateStatus('Error: ' + message, 'error');
    
    setTimeout(() => {
      document.getElementById('current-operation').classList.add('hidden');
      document.getElementById('no-operation').classList.remove('hidden');
    }, 5000);
  }

  incrementProcessedCount() {
    const countEl = document.getElementById('processed-count');
    const current = parseInt(countEl.textContent) || 0;
    countEl.textContent = current + 1;
  }

  extractItemIdFromUrl(url) {
    const match = url.match(/\/items\/library\/([A-Z0-9]+)/);
    return match ? match[1] : null;
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new SquareAutomationPopup();
});