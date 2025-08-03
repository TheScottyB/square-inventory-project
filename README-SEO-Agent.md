# 🤖 PuppeteerSEOAgent - Square Dashboard SEO Automation

## Overview

The **PuppeteerSEOAgent** is a production-ready automation tool that bridges the gap between Square's API limitations and the need for proper SEO optimization. While Square's Catalog API doesn't expose SEO fields like `pageTitle`, `pageDescription`, and `permalink`, these fields are available in the Square Dashboard UI. This agent uses Puppeteer to automate the process of updating these fields directly through the browser interface.

## 🎯 Key Features

### ✅ Core Capabilities
- **🔐 Secure Authentication**: Environment-based credentials with session persistence
- **🔄 2FA Support**: Handles two-factor authentication automatically
- **📱 Robust Selectors**: Multiple fallback selectors for dynamic UI elements
- **🔁 Retry Logic**: Configurable retry attempts with exponential backoff
- **📊 Batch Processing**: Process multiple items with rate limiting
- **📸 Screenshot Logging**: Automatic error screenshots for debugging
- **📝 Comprehensive Logging**: Detailed audit trail of all updates

### 🛡️ Production-Ready Features
- **Session Management**: Saves and reuses login cookies
- **Rate Limiting**: Prevents API abuse with configurable delays
- **Error Handling**: Graceful failure handling with detailed error reporting
- **Progress Tracking**: Real-time progress indicators with colored output
- **Headless Mode**: Runs with or without browser UI

## 🏗️ Architecture

### Problem Statement
Square's API provides these limitations:
- ❌ `pageTitle` (SEO title) - Read-only via API
- ❌ `pageDescription` (SEO meta description) - Read-only via API  
- ❌ `permalink` (URL slug) - Read-only via API
- ✅ `name` (product name) - Editable but used for UX, not SEO
- ✅ `description` (product description) - Editable but used for UX, not SEO

### Solution
The PuppeteerSEOAgent:
1. **Separates Concerns**: Keeps UX content clean in `name`/`description` fields
2. **Automates UI**: Updates SEO-specific fields via Dashboard automation
3. **Maintains Data Integrity**: Uses structured SEO data separate from UX content

## 📋 Prerequisites

1. **Node.js** (v22.18.0 or higher)
2. **Square Dashboard Account** with appropriate permissions
3. **Chrome/Chromium** (automatically installed by Puppeteer)

## 🚀 Installation

### 1. Install Dependencies
```bash
pnpm add puppeteer chalk ora dotenv
```

### 2. Set Up Environment Variables
Copy `.env.example` to `.env` and configure:

```bash
# Square Dashboard Credentials
SQUARE_EMAIL=your-square-email@example.com
SQUARE_PASSWORD=your-secure-password

# Environment
NODE_ENV=development
HEADLESS=false

# SEO Agent Settings
SEO_RETRIES=3
SEO_TIMEOUT=30000
SEO_CONCURRENCY=1
```

### 3. Prepare SEO Data
Run the enhancement script to add SEO structure to your items:

```bash
node scripts/enhance-seo-data.js
```

This will:
- ✅ Add SEO data to items marked as `ecomAvailable: true` and `ecomVisibility: 'VISIBLE'`
- ✅ Generate SEO titles, descriptions, permalinks, and keywords
- ✅ Preserve existing item data

## 🎮 Usage

### Basic Usage
```bash
node runPuppeteerAgent.js
```

### With Custom Options
```javascript
import PuppeteerSEOAgent from './src/agents/PuppeteerSEOAgent.js';

const agent = new PuppeteerSEOAgent({
  headless: false,        // Show browser UI
  retries: 5,            // Max retry attempts
  timeout: 60000         // Timeout in milliseconds
});

await agent.initialize();
await agent.loginToSquare();
await agent.processBatch(seoEnabledItems);
await agent.cleanup();
```

## 📊 SEO Data Structure

The agent expects items with this structure:

```javascript
{
  "id": "ITEM_ID_123",
  "name": "Beautiful Product Name",           // UX-focused name
  "ecomAvailable": true,
  "ecomVisibility": "VISIBLE",
  "seo": {
    "title": "SEO-Optimized Title | Brand Name",
    "description": "SEO-focused meta description with keywords...",
    "permalink": "beautiful-product-name",
    "keywords": "keyword1, keyword2, keyword3"
  }
}
```

## 🔧 Configuration Options

### Agent Options
```javascript
{
  headless: false,         // Run in headless mode
  timeout: 30000,         // Default timeout (ms)
  retries: 3,             // Max retry attempts
  concurrency: 1          // Items processed simultaneously
}
```

### Environment Variables
- `SQUARE_EMAIL` - Your Square account email
- `SQUARE_PASSWORD` - Your Square account password  
- `NODE_ENV` - Environment (`development`/`production`)
- `HEADLESS` - Run browser in headless mode (`true`/`false`)
- `SEO_RETRIES` - Number of retry attempts
- `SEO_TIMEOUT` - Timeout for operations
- `SEO_CONCURRENCY` - Concurrent processing limit

## 📁 File Structure

```
├── src/agents/PuppeteerSEOAgent.js    # Main agent class
├── scripts/enhance-seo-data.js        # SEO data enhancement script
├── runPuppeteerAgent.js               # Execution script
├── data/
│   ├── active-items.json              # Items with SEO data
│   └── square-session.json            # Saved login session
└── logs/
    ├── seo-updates.log                # Update audit log
    └── screenshots/                   # Error screenshots
```

## 🔍 Logging & Debugging

### Log Files
- **`logs/seo-updates.log`**: JSON log of all update attempts
- **`logs/screenshots/`**: PNG screenshots of errors

### Log Entry Format
```json
{
  "timestamp": "2025-08-03T03:18:56.789Z",
  "itemId": "ITEM_ID_123",
  "itemName": "Product Name",
  "status": "SUCCESS",
  "seoData": { ... },
  "error": null
}
```

### Debug Mode
Run with visible browser for debugging:
```bash
HEADLESS=false node runPuppeteerAgent.js
```

## ⚠️ Important Notes

### Security
- **Never commit `.env` files** to version control
- **Use environment variables** for all credentials
- **Regularly rotate passwords** and API keys

### Rate Limiting
- Default: 1 second delay between items
- Square may rate limit aggressive automation
- Monitor for `429` responses or blocking

### Browser Compatibility
- Tested with Chrome/Chromium 120+
- Uses latest Puppeteer with auto-detection
- Handles dynamic UI changes with multiple selectors

## 🐛 Troubleshooting

### Common Issues

#### 1. Login Failures
```bash
# Check credentials
echo $SQUARE_EMAIL
echo $SQUARE_PASSWORD

# Clear saved session
rm data/square-session.json
```

#### 2. Selector Not Found
- UI elements may have changed
- Check `logs/screenshots/` for visual debugging
- Update selectors in `navigateToItemSEO()` or `updateSEOFields()`

#### 3. 2FA Required
- Agent will pause and wait for manual 2FA completion
- Complete 2FA in the browser window
- Session will be saved for future runs

#### 4. Timeout Errors
```javascript
// Increase timeout
const agent = new PuppeteerSEOAgent({
  timeout: 60000  // 60 seconds
});
```

## 🎯 Success Metrics

The agent provides detailed success reporting:

```bash
🚀 Processing 96 items...

[1/96] Processing: Murano Hand Blown Glass Giraffe
✓ [1/96] DOBJNEA7GSEOOELRM7V3HS2Z updated successfully

[2/96] Processing: Vitamin E Oil Face & Body Moisturizer 4oz  
✓ [2/96] YM4VEQNOR7QB7SSFKXUPDZSY updated successfully

Processing completed: [
  { success: true, item: "DOBJNEA7GSEOOELRM7V3HS2Z" },
  { success: true, item: "YM4VEQNOR7QB7SSFKXUPDZSY" },
  // ...
]
```

## 🚀 Next Steps

1. **Test with Small Batch**: Start with 5-10 items to verify functionality
2. **Monitor Performance**: Check logs for failures and optimize selectors
3. **Scale Gradually**: Increase batch sizes while monitoring rate limits
4. **Schedule Automation**: Set up cron jobs for regular SEO updates
5. **Enhance SEO Content**: Integrate with AI services for better SEO copy

---

## 🤝 Support

This agent represents a robust solution to Square's API limitations around SEO field management. The combination of secure authentication, comprehensive error handling, and detailed logging makes it suitable for production environments where SEO optimization is critical for e-commerce success.

**Perfect for**: E-commerce stores using Square that need proper SEO control without compromising UX content quality.
