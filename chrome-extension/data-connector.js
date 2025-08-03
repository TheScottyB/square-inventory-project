// Data connector to integrate with existing Square catalog data

class SquareDataConnector {
  constructor() {
    this.catalogData = null;
    this.itemsMap = new Map();
    this.categoriesMap = new Map();
    this.init();
  }

  async init() {
    console.log('Square Data Connector initialized');
    
    // Try to load existing catalog data
    await this.loadCatalogData();
    
    // Set up periodic sync
    this.setupPeriodicSync();
  }

  async loadCatalogData() {
    try {
      // Try to load from extension storage first
      const stored = await chrome.storage.local.get(['catalogData']);
      
      if (stored.catalogData) {
        this.processCatalogData(stored.catalogData);
        console.log('Loaded catalog data from storage');
        return;
      }

      // If no stored data, try to fetch from local server/files
      await this.fetchLocalCatalogData();
      
    } catch (error) {
      console.error('Failed to load catalog data:', error);
    }
  }

  async fetchLocalCatalogData() {
    try {
      // This would connect to your local Node.js server or file system
      // For now, we'll simulate the data structure based on your project
      
      const endpoints = [
        'http://localhost:3000/api/catalog', // If you have a local server
        '/data/active-items.json', // Direct file access (if served)
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint);
          if (response.ok) {
            const data = await response.json();
            this.processCatalogData(data);
            
            // Store in extension storage
            await chrome.storage.local.set({ catalogData: data });
            console.log('Fetched and stored catalog data from:', endpoint);
            return;
          }
        } catch (e) {
          console.log('Failed to fetch from:', endpoint);
        }
      }

      // Fallback: Create sample data structure
      this.createSampleData();
      
    } catch (error) {
      console.error('Error fetching local catalog data:', error);
      this.createSampleData();
    }
  }

  processCatalogData(data) {
    this.catalogData = data;
    
    // Create lookup maps for fast access
    if (data.items) {
      data.items.forEach(item => {
        this.itemsMap.set(item.id, item);
      });
    }

    if (data.categories) {
      data.categories.forEach(category => {
        this.categoriesMap.set(category.id, category);
      });
    }

    console.log(`Processed ${this.itemsMap.size} items and ${this.categoriesMap.size} categories`);
  }

  createSampleData() {
    // Create sample data that matches your project structure
    const sampleData = {
      items: [
        {
          id: 'CWJOSY7V3QMW3B2KPMAU4BA6',
          name: 'AI Chatbot Brainstorming',
          category_data: { name: 'miscellaneous-products' },
          item_data: {
            name: 'AI Chatbot Brainstorming',
            description: 'Dig into your data with Square AI Beta'
          },
          present_at_all_locations: true,
          seo: {
            title: 'AI Chatbot Brainstorming Tool',
            description: 'Advanced AI-powered brainstorming tool for business innovation'
          }
        },
        {
          id: 'DOBJNEA7GSEOOELRM7V3HS2Z',
          name: 'Murano Hand Blown Glass Giraffe',
          category_data: { name: 'jewelry' },
          item_data: {
            name: 'Murano Hand Blown Glass Giraffe',
            description: 'Beautiful handcrafted glass giraffe sculpture'
          },
          present_at_all_locations: true,
          seo: {
            title: 'Murano Glass Giraffe Sculpture',
            description: 'Authentic Murano hand blown glass giraffe - perfect decorative piece'
          }
        }
      ],
      categories: [
        { id: 'CAT1', name: 'miscellaneous-products' },
        { id: 'CAT2', name: 'jewelry' },
        { id: 'CAT3', name: 'candles-holders' },
        { id: 'CAT4', name: 'pet-products' }
      ],
      lastUpdate: Date.now()
    };

    this.processCatalogData(sampleData);
    
    // Store sample data
    chrome.storage.local.set({ catalogData: sampleData });
  }

  setupPeriodicSync() {
    // Sync data every 5 minutes
    setInterval(() => {
      this.syncWithLocalData();
    }, 5 * 60 * 1000);
  }

  async syncWithLocalData() {
    try {
      console.log('Syncing with local data...');
      await this.fetchLocalCatalogData();
    } catch (error) {
      console.error('Periodic sync failed:', error);
    }
  }

  // Public API methods for other components
  getItem(itemId) {
    return this.itemsMap.get(itemId);
  }

  getCategory(categoryId) {
    return this.categoriesMap.get(categoryId);
  }

  getAllItems() {
    return Array.from(this.itemsMap.values());
  }

  getAllCategories() {
    return Array.from(this.categoriesMap.values());
  }

  searchItems(query) {
    const results = [];
    const queryLower = query.toLowerCase();

    for (const item of this.itemsMap.values()) {
      if (item.name?.toLowerCase().includes(queryLower) ||
          item.item_data?.description?.toLowerCase().includes(queryLower)) {
        results.push(item);
      }
    }

    return results;
  }

  getItemsByCategory(categoryName) {
    return this.getAllItems().filter(item => 
      item.category_data?.name === categoryName
    );
  }

  getItemsNeedingSEO() {
    return this.getAllItems().filter(item => 
      !item.seo || !item.seo.description || item.seo.description.length < 50
    );
  }

  getItemsNeedingImages() {
    return this.getAllItems().filter(item => 
      !item.images || item.images.length === 0
    );
  }

  // Image path generation based on your project structure
  generateImagePaths(item) {
    const category = item.category_data?.name || 'miscellaneous-products';
    const itemName = item.name?.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    
    return [
      `assets/images/${category}/${itemName}.jpg`,
      `assets/images/${category}/${itemName}.png`,
      `catalog-images/${item.id}/`,
      `downloaded-images/${item.id}/`
    ];
  }

  // SEO data generation
  generateSEOData(item) {
    const name = item.name || item.item_data?.name || 'Product';
    const category = item.category_data?.name || 'product';
    
    return {
      title: `${name} - Premium ${category} | Square Store`,
      description: `Discover our high-quality ${name}. Perfect ${category} for discerning customers. Shop now with fast shipping and excellent customer service.`,
      keywords: [name, category, 'premium', 'quality', 'shop'].join(', ')
    };
  }

  // Update item data
  async updateItem(itemId, updates) {
    const item = this.itemsMap.get(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    // Merge updates
    const updatedItem = { ...item, ...updates };
    this.itemsMap.set(itemId, updatedItem);

    // Update in storage
    const catalogData = {
      ...this.catalogData,
      items: Array.from(this.itemsMap.values())
    };

    await chrome.storage.local.set({ catalogData });
    
    return updatedItem;
  }

  // Bulk operations
  async bulkUpdateSEO(items) {
    const results = [];
    
    for (const item of items) {
      try {
        const seoData = this.generateSEOData(item);
        const updated = await this.updateItem(item.id, { seo: seoData });
        results.push({ id: item.id, success: true, seo: seoData });
      } catch (error) {
        results.push({ id: item.id, success: false, error: error.message });
      }
    }

    return results;
  }

  async exportData() {
    return {
      catalogData: this.catalogData,
      items: Array.from(this.itemsMap.values()),
      categories: Array.from(this.categoriesMap.values()),
      exportDate: new Date().toISOString()
    };
  }

  async importData(data) {
    if (data.catalogData) {
      this.processCatalogData(data.catalogData);
      await chrome.storage.local.set({ catalogData: data.catalogData });
      return true;
    }
    
    throw new Error('Invalid data format');
  }

  // Statistics and analytics
  getStatistics() {
    const items = this.getAllItems();
    
    return {
      totalItems: items.length,
      itemsWithSEO: items.filter(item => item.seo?.description).length,
      itemsWithImages: items.filter(item => item.images?.length > 0).length,
      categoriesCount: this.categoriesMap.size,
      lastUpdate: this.catalogData?.lastUpdate || null
    };
  }
}

// Create global instance
window.squareDataConnector = new SquareDataConnector();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SquareDataConnector;
}