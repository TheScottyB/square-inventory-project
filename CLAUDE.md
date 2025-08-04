# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Square Inventory Automation Project** - An AI-powered inventory management system for Square Online stores, featuring advanced automation agents, Chrome extension integration, and comprehensive observability. The project specializes in spiritual/metaphysical product catalogs with intelligent categorization, SEO optimization, and image management capabilities.

## Workspace Structure

```
square-inventory-project/
├── src/                          # Core application source code
│   ├── agents/                   # AI automation agents
│   ├── config/                   # Configuration management
│   ├── managers/                 # Business logic managers
│   ├── observability/            # Monitoring and metrics
│   ├── orchestration/            # Workflow orchestration
│   └── utils/                    # Shared utilities
├── chrome-extension/             # Browser automation extension
├── scripts/                      # Automation and utility scripts
├── data/                         # Catalog data and intelligence
├── assets/                       # Product images and media
├── docs/                         # Project documentation
├── tests/                        # Test suites
├── logs/                         # Application logs
└── exports/                      # Generated reports and catalogs
```

## Development Environment

### Package Managers & Node.js
- **Primary**: `pnpm` (version 10.14.0+)
- **Node.js**: Version 22.18.0+ (ES modules enabled)
- **Module System**: ESM (`"type": "module"` in package.json)

### Key Technologies
- **AI/ML**: OpenAI GPT models via `@openai/agents` SDK
- **E-commerce**: Square SDK v43.0.1 for catalog management
- **Automation**: Puppeteer & Playwright for browser automation
- **Image Processing**: Sharp for image analysis and optimization
- **Observability**: OpenTelemetry, Prometheus metrics, Pino logging
- **Data Processing**: XLSX for catalog imports/exports

## Development Commands

### Core Operations
```bash
# Install dependencies
pnpm install

# Run main automation pipeline
pnpm start

# Test Square API integration
pnpm run square:test

# Process current catalog
pnpm run process:current-catalog

# Generate SEO content
pnpm run seo:enhance-data

# Organize inventory files
pnpm run organize:inventory:execute
```

### AI Agent Operations
```bash
# Analyze and rename images
pnpm run ai:analyze-and-rename

# Organize products by analysis
pnpm run ai:organize-products

# Generate intelligent filenames
pnpm run generate-filenames:apply

# Run inventory intelligence analysis
pnpm run intelligence:analyze
```

### Testing & Quality
```bash
# Run test suite
pnpm test

# Lint code
pnpm run lint:fix

# Validate configuration
pnpm run validate

# Security audit
pnpm run audit:fix
```

### Chrome Extension Development
```bash
# Navigate to chrome-extension directory
cd chrome-extension

# Load extension in Chrome:
# 1. Go to chrome://extensions/
# 2. Enable Developer Mode
# 3. Click "Load unpacked" and select chrome-extension folder

# View logs:
# Background: chrome://extensions/ → Square Automation → Inspect views
# Content: F12 Developer Tools on Square Dashboard pages
```

## Architecture Overview

### Multi-Agent System
The project implements a sophisticated agent-based architecture:

**Core Agents**:
- `SquareCatalogAgent` - Square API integration and catalog management
- `ImageAnalysisAgent` - AI-powered image analysis and metadata extraction
- `SEOAgent` - Search engine optimization content generation
- `CorrectCategorizationAgent` - Intelligent product categorization
- `PuppeteerSEOAgent` - Browser automation for Square Dashboard

**Specialized Agents**:
- `InventoryIntelligenceAgent` - Advanced analytics and insights
- `FileNamingAgent` - SEO-friendly filename generation  
- `GroupingAgent` - Product similarity and grouping
- `NarrativeSpecialistAgent` - Content creation for spiritual/metaphysical products

### Orchestration System
```
IndividualizedEnhancementOrchestrator
├── Processes products individually
├── Manages agent coordination  
├── Handles error recovery
└── Provides progress tracking

InventoryAutomationOrchestrator  
├── Batch processing workflows
├── Multi-stage pipeline execution
├── Resource management
└── Performance optimization
```

### Chrome Extension Integration
**Multi-Domain Automation**:
- Square Dashboard (`app.squareup.com`) - Primary automation target
- Spocket (`app.spocket.co`) - Product sourcing and data capture
- CDN domains - High-resolution image downloading

**Extension Architecture**:
- `background.js` - Service worker, API calls, cross-tab communication
- `content.js` - Square Dashboard DOM manipulation
- `spocket-content.js` - Spocket product intelligence
- `injected.js` - Advanced API interception
- `popup.js` - User interface and manual controls

## Configuration Management

### Environment Variables
```bash
# Core Configuration (.env)
OPENAI_API_KEY=your_openai_api_key
SQUARE_ACCESS_TOKEN=your_square_token
SQUARE_ENVIRONMENT=production  # or sandbox

# Agent Settings
MAX_DESCRIPTION_LENGTH=500
GROUPING_SIMILARITY_THRESHOLD=0.8
CONCURRENCY_LIMIT=5

# Square Dashboard Automation (Keep Secure!)
SQUARE_EMAIL=your-email@domain.com
SQUARE_PASSWORD=your-secure-password

# Observability
LOG_LEVEL=info
ENABLE_DRY_RUN=false
```

### Configuration Structure
- `src/config/index.js` - Centralized configuration with validation
- Environment-specific overrides supported
- Runtime configuration validation with helpful error messages

## Key Workflows

### 1. Catalog Enhancement Pipeline
```bash
# Full automation pipeline
pnpm run pipeline:full

# Individual steps
pnpm run process:current-catalog        # Process raw catalog data
pnpm run enhance:individualized         # AI-powered enhancements
pnpm run categories:apply               # Apply categorization
pnpm run seo:enhance-data              # Generate SEO content
```

### 2. Image Management Workflow
```bash
# Analyze and organize images
pnpm run ai:analyze-and-rename
pnpm run ai:organize-products

# Download and attach images
pnpm run square:download-and-attach
pnpm run square:direct-attach
```

### 3. Content Approval System
```bash
# Review generated content
pnpm run content:review

# Approve content for publication
pnpm run content:approve

# Commit approved changes
pnpm run content:commit
```

## Data Structures

### Catalog Data Format
- **Active Items**: `/data/active-items.json` - Live catalog items
- **Intelligence**: `/data/intelligence/` - AI-generated insights
- **Categories**: `/data/categories/` - Categorization mappings
- **SEO Snapshots**: `/data/seo-snapshots/` - SEO content versions

### Image Organization
```
assets/
├── catalog-images/          # Product images linked to Square items
├── spocket-images/         # Sourced product images  
├── organized/              # AI-organized image collections
└── downloads/              # Temporary download staging
```

## Development Patterns

### Agent Development
```javascript
// Standard agent structure
export class CustomAgent {
  constructor(config = {}) {
    this.config = { ...defaultConfig, ...config };
    this.observer = new CatalogObserver();
  }

  async processItem(item) {
    try {
      this.observer.startOperation('processItem');
      // Agent logic here
      return result;
    } catch (error) {
      this.observer.recordError(error);
      throw error;
    } finally {
      this.observer.endOperation();
    }
  }
}
```

### Error Handling & Observability
- Comprehensive async/await with try-catch patterns
- Structured logging via Pino logger
- OpenTelemetry tracing for performance monitoring
- Prometheus metrics for operational insights
- Automatic error recovery and retry logic

### Testing Strategy
```bash
# Unit tests for agents
jest src/agents/*.test.js

# Integration tests  
jest test/integration/

# Real API testing (use cautiously)
pnpm run test:upload
```

## Security Considerations

### API Keys & Credentials
- Store all credentials in `.env` file (never commit)
- Use environment-specific configurations
- Square credentials for browser automation require extra security

### Chrome Extension Permissions
- Minimal required permissions (`activeTab`, `storage`, `downloads`)
- Host permissions restricted to Square and CDN domains
- Content Security Policy enforcement

## Business Logic

### Product Categories
The system specializes in spiritual/metaphysical products with categories:
- **Energy & Elements** (EE) - Crystals, energy tools
- **Apothecary Cabinet** (AC) - Herbs, potions, remedies  
- **Mind & Clarity** (MC) - Meditation, focus tools
- **DrDZB's Picks** - Curated selections

### SKU Generation
- Format: `RRV-[CATEGORY]-[SEQUENCE]` (e.g., `RRV-EE-001`)
- Automatic variation handling for product families
- Category-based prefixes for organization

### Content Generation
- GPT-powered descriptions (150-300 words)
- SEO-optimized titles (50-60 characters)
- Meta descriptions (150-160 characters)
- Spiritual/metaphysical tone maintained throughout

## Deployment & Operations

### Production Checklist
1. Configure environment variables in `.env`
2. Verify Square API credentials and permissions
3. Test Chrome extension installation
4. Run validation: `pnpm run validate`
5. Monitor logs during initial operations

### Monitoring & Observability
- Application logs: `./logs/application.log`
- Agent-specific logs: `./logs/[agent-name]/`
- Performance metrics: Prometheus format
- Error tracking: Structured JSON logs

## Common Issues & Troubleshooting

### Square API Issues
- Check API token validity and permissions
- Verify Square environment (sandbox vs production)
- Monitor rate limits and implement backoff

### Chrome Extension Issues
- Ensure extension is loaded and active on Square pages
- Check content script injection success
- Verify host permissions for target domains

### Image Processing Issues
- Confirm Sharp installation for image processing
- Check file system permissions for image directories
- Verify image URL accessibility and formats

## Best Practices

1. **Always use dry-run mode** for testing new workflows
2. **Monitor observability logs** during automation runs
3. **Backup data** before major catalog operations
4. **Test Chrome extension** in isolated browser profile
5. **Validate configurations** before production deployment
6. **Use agent orchestration** for complex multi-step processes

---

**Project Specialization**: Spiritual/metaphysical e-commerce automation  
**Primary Integrations**: Square Online, OpenAI, Chrome Extension APIs  
**Deployment Model**: Local development with cloud API integrations