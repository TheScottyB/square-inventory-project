# Script Audit and Cleanup Plan

## Current Script Analysis (18 scripts)

### ✅ **Production Ready / Working Scripts**
- `direct-attach-to-guitar.js` - ✅ **WORKING** - Successfully uploads images with direct attachment
- `download-and-attach-from-json.js` - ✅ **WORKING** - Complete workflow for JSON-based image management  
- `test-square-catalog-agent.js` - ✅ **WORKING** - Core Square API testing
- `generate-filenames.js` - ✅ **WORKING** - File management utilities

### ⚠️ **Experimental / Needs Review**
- `download-spocket-images.js` - ⚠️ **EXPERIMENTAL** - Image downloading utility, may need node-fetch
- `enhanced-find-and-attach-images.js` - ⚠️ **EXPERIMENTAL** - Enhanced version, not tested recently
- `spocket-image-scraper.js` - ⚠️ **EXPERIMENTAL** - Web scraping functionality
- `test-core-version-features.js` - ⚠️ **TESTING** - Version management testing
- `test-version-safe-integration.js` - ⚠️ **TESTING** - Integration testing
- `test-version-safe-upsert.js` - ⚠️ **TESTING** - Upsert testing

### ❌ **Broken / Deprecated Scripts**
- `find-by-price-append-images.js` - ❌ **BROKEN** - Catalog consistency errors
- `find-and-update-item-images.js` - ❌ **DEPRECATED** - Older approach, replaced
- `process-items.js` - ❌ **DEPRECATED** - Original workflow, superseded
- `run-workflow.js` - ❌ **DEPRECATED** - AI-agent based workflow, not maintained
- `square-integration.js` - ❌ **DEPRECATED** - Early integration attempt
- `setup-square-integration.js` - ❌ **DEPRECATED** - Setup script, functionality moved
- `upload-images.js` - ❌ **DEPRECATED** - Basic upload, replaced by better versions
- `debug-square-sdk.js` - ❌ **DEBUG ONLY** - Development debugging script
- `run-tests.js` - ❌ **DEPRECATED** - Custom test runner, use Jest instead

### 📝 **Test Scripts Analysis**
- `tests/testRealImageUpload.js` - ✅ **WORKING** - Real upload testing
- `tests/testUploadImage.js` - ⚠️ **NEEDS REVIEW** - May be duplicate
- `tests/unit/SquareCatalogAgent.test.js` - ✅ **WORKING** - Unit tests

## Recommended Actions

### 1. Immediate Cleanup
- **DELETE**: 9 broken/deprecated scripts
- **ARCHIVE**: 1 debug script for reference
- **REVIEW**: 6 experimental scripts
- **KEEP**: 4 production-ready scripts

### 2. Folder Reorganization
```
scripts/
├── production/           # Ready-to-use scripts
│   ├── direct-attach-to-guitar.js
│   ├── download-and-attach-from-json.js
│   └── generate-filenames.js
├── utilities/           # Helper scripts
│   ├── test-square-catalog-agent.js
│   └── download-spocket-images.js
├── experimental/        # Under development
│   ├── enhanced-find-and-attach-images.js
│   ├── spocket-image-scraper.js
│   └── version-testing/
└── archived/           # Deprecated but kept for reference
    └── debug-square-sdk.js
```

### 3. Asset Organization
```
assets/
├── images/
│   ├── candles-holders/
│   ├── first-aid-kits/
│   ├── holographic-purses/
│   ├── jewelry/
│   ├── miscellaneous-products/
│   ├── pet-products/
│   └── shoes-sneakers/
└── downloads/
    └── miscellaneous-products/
```

### 4. Package.json Updates
- Remove scripts pointing to deleted files
- Add new production script shortcuts
- Update descriptions with current functionality

### 5. Documentation Updates
- Update README.md with current working state
- Remove references to broken workflows
- Add troubleshooting section for catalog consistency issues
- Document successful direct attachment method
