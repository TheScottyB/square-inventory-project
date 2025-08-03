# Square Inventory Automation Chrome Extension

A powerful Chrome extension for automating Square Dashboard operations, managing product images, and optimizing SEO content.

## Features

### 🤖 **Square Dashboard Automation**
- Auto-update SEO fields for catalog items
- Bulk process multiple items simultaneously
- Smart navigation between item pages
- Real-time operation monitoring

### 🖼️ **Image Management**
- Find and match product images to catalog items
- Auto-download images from various sources
- Organize images by category and item
- Smart image scoring and matching algorithms

### ⚡ **Advanced Capabilities**
- Intercept Square API calls for real-time data
- Advanced image processing and analysis
- Bulk operations with progress tracking
- Integration with existing catalog data

## Installation

1. **Load the Extension:**
   ```bash
   # Navigate to Chrome Extensions
   chrome://extensions/
   
   # Enable Developer Mode
   # Click "Load unpacked"
   # Select the chrome-extension folder
   ```

2. **Verify Installation:**
   - Extension icon appears in Chrome toolbar
   - Navigate to Square Dashboard
   - Green indicator shows "Square Automation Active"

## Usage

### Quick Start

1. **Navigate to Square Dashboard** (`https://app.squareup.com/dashboard`)
2. **Click the extension icon** to open the popup
3. **Sync your catalog data** using the "Sync Catalog Data" button
4. **Start automating** with quick actions

### Automation Features

#### **SEO Updates**
- Navigate to any item page
- Click "Update Current Item SEO" in the popup
- Extension automatically fills SEO fields
- Changes are saved automatically

#### **Image Management**
- Use "Find Images for Current Item" to locate product images
- Extension searches your local image directories
- Select and attach images directly to items
- Supports bulk image processing

#### **Bulk Operations**
- Process multiple items simultaneously
- Monitor progress in real-time
- Automatic error handling and retries
- Detailed operation logging

### Advanced Features

#### **API Interception**
- Monitors Square API calls in real-time
- Extracts catalog and image data automatically
- Provides insights into Square's internal operations

#### **Smart Image Matching**
- Analyzes image content and metadata
- Scores images based on relevance
- Suggests best matches for each item
- Supports multiple image sources

## Configuration

### Settings

Access settings via the extension popup → Settings tab:

- **Auto-mode**: Automatically process items as you browse
- **Image Search**: Enable/disable image searching
- **SEO Updates**: Enable/disable SEO optimizations

### Data Integration

The extension integrates with your existing Square inventory project:

```javascript
// Loads data from your project files
/data/active-items.json
/assets/images/
/catalog-images/
```

### Custom Data Sources

Configure additional data sources in `data-connector.js`:

```javascript
const endpoints = [
  'http://localhost:3000/api/catalog',
  '/data/active-items.json',
  // Add your custom endpoints
];
```

## API Reference

### Content Script API

```javascript
// Update SEO for current item
chrome.runtime.sendMessage({
  action: 'updateSEO',
  data: {
    title: 'SEO Title',
    description: 'SEO Description'
  }
});

// Find images for an item
chrome.runtime.sendMessage({
  action: 'findProductImages',
  itemId: 'ITEM_ID_HERE'
});
```

### Background Script API

```javascript
// Sync catalog data
chrome.runtime.sendMessage({
  action: 'syncCatalogData',
  data: catalogData
});

// Save image to item
chrome.runtime.sendMessage({
  action: 'saveImageToItem',
  itemId: 'ITEM_ID',
  imageUrl: 'IMAGE_URL'
});
```

## File Structure

```
chrome-extension/
├── manifest.json          # Extension configuration
├── background.js          # Background service worker
├── content.js             # Square Dashboard automation
├── injected.js            # Advanced API interception
├── popup.html             # Extension popup UI
├── popup.js               # Popup functionality
├── data-connector.js      # Catalog data integration
├── icons/                 # Extension icons
└── README.md             # This file
```

## Development

### Building

No build process required - the extension runs directly from source files.

### Debugging

1. **Console Logs:**
   ```bash
   # Background script logs
   chrome://extensions/ → Square Automation → Inspect views: background page
   
   # Content script logs
   F12 Developer Tools on Square pages
   ```

2. **Storage Inspection:**
   ```bash
   # View extension data
   chrome://extensions/ → Square Automation → Inspect views: background page
   # Console: chrome.storage.local.get(console.log)
   ```

### Testing

1. **Manual Testing:**
   - Load extension in Chrome
   - Navigate to Square Dashboard
   - Test each feature via popup

2. **API Testing:**
   ```javascript
   // Test content script communication
   chrome.tabs.query({active: true}, (tabs) => {
     chrome.tabs.sendMessage(tabs[0].id, {action: 'getPageInfo'});
   });
   ```

## Integration with Existing Project

The extension seamlessly integrates with your Square inventory automation project:

### **Data Sync**
- Reads from `/data/active-items.json`
- Uses existing image organization in `/assets/images/`
- Respects category structure

### **Workflow Integration**
- Complements existing Node.js automation scripts
- Can trigger existing batch operations
- Shares configuration and data formats

### **Native Messaging** (Future Enhancement)
```javascript
// Connect extension to Node.js scripts
const port = chrome.runtime.connectNative('com.square.automation');
port.postMessage({action: 'processItem', itemId: 'ABC123'});
```

## Security Considerations

### **Permissions**
- `activeTab`: Access current Square tab only
- `storage`: Store extension data locally
- `downloads`: Save images to local filesystem

### **Data Handling**
- All data stored locally in Chrome storage
- No external data transmission
- Respects Square's terms of service

### **Content Security**
- Scripts run only on Square domains
- No eval() or unsafe practices
- Sandboxed execution context

## Troubleshooting

### **Extension Not Working**

1. Check if you're on a Square page
2. Refresh the page after installing
3. Check browser console for errors

### **API Calls Failing**

1. Verify Square login status
2. Check network connectivity
3. Ensure proper permissions granted

### **Image Operations Failing**

1. Check file system permissions
2. Verify image URLs are accessible
3. Ensure sufficient disk space

## Support

For issues and feature requests:

1. Check browser console logs
2. Verify extension permissions
3. Test with minimal configuration
4. Report issues with detailed steps

## License

This extension is part of the Square Inventory Automation project and follows the same licensing terms.