# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Package Manager**: Use `pnpm` (required, project configured with pnpm workspace)

**Primary Commands:**
```bash
# Main workflow - production ready orchestrator
pnpm run manage-inventory assets/images
pnpm run manage-inventory:dry-run
pnpm run manage-inventory:auto-rename

# Square API operations  
pnpm run square:test                    # Test Square API connection
pnpm run square:direct-attach           # Direct image upload to catalog item
pnpm run square:download-and-attach     # JSON workflow with auto-matching

# AI-powered image processing
pnpm run ai:analyze-and-rename          # Analyze and rename images
pnpm run ai:analyze-and-rename:dry-run  # Dry run mode
pnpm run ai:organize-products           # Smart product organization
pnpm run ai:organize-by-source          # Organize by source provider

# SEO automation (Puppeteer-based)
pnpm run seo:enhance-data               # Enhance catalog SEO data
pnpm run seo:run-agent                  # Run Puppeteer SEO agent
pnpm run seo:run-agent:headless         # Headless mode

# Development
pnpm run test                          # Run Jest tests
pnpm run test:watch                    # Watch mode
pnpm run test:orchestrator             # Test orchestrator specifically
pnpm run lint                          # ESLint validation
pnpm run lint:fix                      # Auto-fix lint issues
pnpm run validate                      # Run lint + test
```

**Test Individual Components:**
```bash
pnpm run test:config                   # Test configuration
pnpm run test:upload                   # Test real image upload
```

## Architecture Overview

This is an **AI-powered Square inventory management system** built with Node.js ESM modules. The project orchestrates image processing, catalog synchronization, and SEO optimization workflows.

### Core Architecture Pattern

**Agent-Based System**: Each major function is implemented as a specialized agent:
- `ImageAnalysisAgent` - OpenAI vision API for image analysis
- `GroupingAgent` - Smart product categorization 
- `FileNamingAgent` - Intelligent filename generation
- `SquareCatalogAgent` - Square API integration with robust error handling
- `PuppeteerSEOAgent` - Browser automation for SEO tasks

**Orchestration Layer**: `InventoryAutomationOrchestrator` chains all agents together in an end-to-end workflow with error recovery, progress tracking, and observability.

### Key Integration Points

**Square SDK Integration**: Uses Square SDK v43.0.1 with API version 2025-07-16. The `SquareCatalogAgent` handles:
- Catalog item CRUD operations with optimistic concurrency control
- Image attachment with direct upload method (100% success rate)
- Version management and conflict resolution
- Comprehensive error handling and retries

**OpenAI Integration**: Uses OpenAI GPT-4o-mini for:
- Image analysis and description generation
- Product categorization and grouping
- Intelligent filename suggestions
- SEO content enhancement

**Observability System**: Advanced monitoring with:
- `CatalogObserver` for Square API operations
- `VersionDriftMonitor` for catalog version tracking
- OpenTelemetry integration for distributed tracing
- Prometheus metrics collection
- Structured logging with Pino

### Environment Configuration

Required environment variables (use `env.example.square` as template):
- `SQUARE_ACCESS_TOKEN` - Square API access token
- `SQUARE_ENVIRONMENT` - 'sandbox' or 'production'  
- `OPENAI_API_KEY` - OpenAI API key
- `SQUARE_APPLICATION_ID` - Square application ID
- `SQUARE_LOCATION_ID` - Square location ID

Optional performance settings:
- `ENABLE_DRY_RUN=true` - Global dry run mode
- `LOG_LEVEL` - Logging level (debug, info, warn, error)
- `CONCURRENCY_LIMIT` - Max concurrent operations (default: 5)

### Directory Structure Patterns

**Images**: `assets/images/` organized by category (jewelry, candles-holders, etc.)
**Catalog Images**: `catalog-images/` contains Square-synchronized product images
**Scripts**: Organized into `production/`, `utilities/`, `experimental/`, `archived/`
**Data**: JSON files in `data/` for catalog state, analysis results, and snapshots
**Logs**: Structured logs in `logs/` with separate subdirectories per service

### Development Patterns

**Error Handling**: All agents implement retry logic with exponential backoff
**Version Management**: Catalog operations use optimistic concurrency control
**Batch Processing**: Large operations are batched with configurable concurrency
**Dry Run Support**: All write operations support dry run mode via environment variable
**Observability**: Comprehensive logging and metrics for production debugging

### Common Development Tasks

**Adding New Agents**: Extend from EventEmitter, implement observability hooks, add to orchestrator
**Square API Changes**: Update version constants in SquareCatalogAgent, run integration tests  
**Image Processing**: Add new analysis features to ImageAnalysisAgent prompt templates
**Workflow Modifications**: Update InventoryAutomationOrchestrator step definitions

### Testing Strategy

**Integration Tests**: Real Square API testing with `test:upload` and `test:orchestrator`
**Unit Tests**: Agent-specific tests in `test/` directory
**Dry Run Testing**: Use dry run modes for safe workflow validation
**Production Validation**: Scripts include built-in validation and rollback capabilities