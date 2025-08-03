# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Environment

**Project Type**: Chrome Extension (Manifest V3)
**No Build Process**: Extension runs directly from source files - no compilation required
**Package Manager**: None required for extension files

## Development Commands

**Testing & Debugging:**
```bash
# Load extension in Chrome
# 1. Navigate to chrome://extensions/
# 2. Enable Developer Mode
# 3. Click "Load unpacked" and select chrome-extension directory

# View background script logs
# chrome://extensions/ → Square Automation → Inspect views: background page

# View content script logs  
# F12 Developer Tools on Square Dashboard pages

# Inspect extension storage
# Background page console: chrome.storage.local.get(console.log)
```

## Architecture Overview

This is a **Chrome Extension for Square Dashboard automation** that integrates with the parent Square inventory management system. The extension provides browser-based automation capabilities for Square's web interface.

### Core Architecture Pattern

**Extension Components**:
- `background.js` - Service worker handling extension lifecycle, API calls, and cross-tab communication
- `content.js` - Square Dashboard automation, DOM manipulation, and page-specific functionality  
- `injected.js` - Advanced API interception injected into Square pages
- `popup.js` - Extension popup UI and user interaction handling
- `spocket-content.js` - Specialized content script for Spocket integration
- `data-connector.js` - Integration with parent project's catalog data

**Multi-Domain Support**:
- **Square Dashboard** (`app.squareup.com/*`) - Primary automation target
- **Spocket** (`app.spocket.co/*`) - Comprehensive product sourcing with rich data capture
- **CDN Domains** - High-resolution image downloading from various sources

### Key Integration Points  

**Parent Project Integration**: Seamlessly integrates with the main Node.js automation system by:
- Reading catalog data from `/data/active-items.json`
- Using existing image organization in `/assets/images/`
- Respecting the same category and data structures
- Complementing batch automation scripts with real-time browser actions

**Chrome Extension APIs**:
- `chrome.storage.local` - Persistent data storage for settings and catalog cache
- `chrome.downloads` - Automated image downloading with progress tracking
- `chrome.tabs` - Cross-tab communication and automation
- `chrome.scripting` - Dynamic script injection for advanced features

**Square Dashboard Automation**:
- Page type detection (`items-library`, `item-detail`, `dashboard`)
- SEO field automation and bulk updates
- Image attachment and management
- Real-time API call interception

**Spocket Product Intelligence**:
- Comprehensive product data extraction (pricing, supplier, shipping, etc.)
- Smart image detection using React Image Lightbox selectors
- Automatic profit margin calculation and business intelligence
- Product categorization and tagging system
- Real-time capture controls with data preview modals

### Development Patterns

**Message Passing Architecture**: All communication flows through the background script:
```javascript
// Content Script → Background → Action
chrome.runtime.sendMessage({action: 'updateSEO', data: seoData});

// Background → Content Script → DOM manipulation  
chrome.tabs.sendMessage(tabId, {action: 'executeTask', task: task});
```

**Storage Management**: Extension uses Chrome's local storage with structured data:
- `catalogData` - Synced from parent project's JSON files
- `spocketProducts` - Captured product data from Spocket
- `settings` - User preferences and automation toggles

**Error Handling**: Comprehensive async/await patterns with try-catch blocks and user feedback through console logging and popup notifications.

### File Structure & Responsibilities

**Core Files**:
- `manifest.json` - Extension configuration, permissions, and content script registration
- `background.js` - Central message hub, API operations, and automation orchestration
- `content.js` - Square page DOM manipulation and automation execution
- `popup.html/js` - User interface and manual operation triggers

**Integration Files**:
- `data-connector.js` - Bridge to parent project's data structures
- `spocket-content.js` - Specialized product sourcing automation
- `injected.js` - Advanced browser API interception

### Environment Configuration

**Required Permissions** (defined in manifest.json):
- `activeTab` - Access to current Square tab only
- `storage` - Local extension data persistence  
- `downloads` - Automated image downloading
- `scripting` - Dynamic script injection capabilities

**Host Permissions**: Restricted to Square domains, Spocket, and CDN domains for security

### Development Workflow

**Local Testing**:
1. Load extension via chrome://extensions/ (no build step required)
2. Navigate to Square Dashboard to activate content scripts
3. Use popup interface to test automation features
4. Monitor console logs in both background and content script contexts

**Debugging Strategy**:
- Background script errors: Extension inspection page
- Content script errors: Browser DevTools on Square pages  
- Message passing: Log all chrome.runtime messages
- Storage inspection: Query chrome.storage.local in background console

**Integration Testing**: Test alongside parent project's automation scripts to ensure data compatibility and workflow integration.