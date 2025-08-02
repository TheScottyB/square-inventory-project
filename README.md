# Square Inventory Project

Square catalog management system with AI-powered product image processing using the OpenAI Agent SDK and Square API v43.0.1. This project provides comprehensive Square catalog integration for inventory management, including image uploads, catalog item creation, SKU generation, and batch processing capabilities.

## Directory Structure

```
├── catalogs/                # Square catalog exports with timestamps
├── error-reports/           # Error reports from inventory operations
├── sneaker-catalogs/        # Specialized sneaker inventory catalogs
├── jewelry/                 # Jewelry product images (bracelets, amethyst, etc.)
├── candles-holders/         # Candle and incense holder product images
├── first-aid-kits/          # First aid kit and medical storage product images
├── shoes-sneakers/          # Shoe and sneaker product images
├── pet-products/            # Pet bowls and pet-related product images
├── crystal-bowls/           # Crystal and singing bowl product images
├── holographic-purses/      # Holographic purse and bag product images
└── miscellaneous-products/  # Other uncategorized product images
```

## File Organization

### Catalogs
- Contains timestamped Square catalog exports in Excel format
- Naming convention: `7MM9AFJAD0XHW_catalog-YYYY-MM-DD-HHMM.xlsx`
- Used for tracking inventory items and variations

### Error Reports
- Contains error reports from inventory synchronization processes
- Naming convention: `error-report-YYYY-MM-DD-HHMM.xlsx`
- Helps identify and resolve inventory discrepancies

### Sneaker Catalogs
- Specialized catalogs focused on sneaker inventory
- Contains cleaned and sorted sneaker variations
- Final processed versions for specific inventory management

### Product Images
- **Jewelry**: Bracelets, amethyst crystals, and other jewelry items (8 files)
- **Candles & Holders**: Abundance candles, incense burners, and candle holders (8 files)
- **First Aid Kits**: Ambulance-style medical storage boxes and first aid kits (11 files)
- **Shoes & Sneakers**: Footwear products including Sofroniev brand items (4 files)
- **Pet Products**: Dog bowls, pet accessories, and crystal singing bowls (8 files)
- **Crystal Bowls**: Singing bowls and crystal products (0 files currently)
- **Holographic Purses**: Lumination holographic bags and purses (3 files)
- **Miscellaneous**: Various other product images and data files (70 files)

## Usage

This project tracks Square inventory data over time, allowing for:
- Historical catalog comparison
- Error pattern analysis
- Specialized product category management (sneakers)
- Inventory reconciliation workflows

## Data Management

**Note**: Excel files (`.xlsx`) are excluded from Git tracking via `.gitignore` to prevent repository bloat. Consider using Git LFS for large binary files if needed, or maintain only documentation and scripts in version control.

## Square Catalog Integration

### Configuration

Configuration is managed through environment variables. Copy `.env.example` to `.env` and set your values:

```bash
cp .env.example .env
```

**Required Environment Variables:**
- `SQUARE_ACCESS_TOKEN`: Your Square access token (sandbox or production)
- `SQUARE_APPLICATION_ID`: Your Square application ID
- `SQUARE_ENVIRONMENT`: `sandbox` or `production`
- `OPENAI_API_KEY`: Your OpenAI API key (for AI-powered features)
- `ENABLE_DRY_RUN`: Set to `true` for testing without API calls (default: false)

### Core Components

- **SquareCatalogAgent**: Main agent for Square API integration with catalog management, image uploads, and inventory operations
- **ImageAnalysisAgent**: Analyzes individual product images using OpenAI's vision models
- **GroupingAgent**: Clusters analyzed products based on similarity
- **FileNamingAgent**: Handles automated file naming and organization
- **Centralized Configuration**: Manages all settings through `src/config/index.js`

### Available Scripts

```bash
# Install dependencies
pnpm install

# Square Catalog Management
pnpm run square:test                    # Test Square API connection
pnpm run square:upload-images           # Upload all product images
pnpm run square:process-items           # Process all items (images + catalog)
pnpm run square:process-directory ./jewelry "jewelry"  # Process specific directory
pnpm run square:process-file ./jewelry/item.jpg "jewelry"  # Process single file

# AI Image Analysis Workflow
pnpm run manage-images                  # Run full AI analysis workflow
pnpm run manage-images:dry-run          # Run a dry-run (no API calls)

# File Management
pnpm run generate-filenames             # Generate organized filenames

# Testing & Quality
pnpm test                               # Run tests
pnpm run lint                           # Lint code
```

### Square Catalog Features

- **Image Upload**: Upload product images directly to Square catalog
- **Catalog Item Creation**: Create items with variations, SKUs, and inventory tracking
- **Category Management**: Automatic category creation and color coding
- **SKU Generation**: Intelligent SKU generation based on category and product name
- **Location Management**: Multi-location support with automatic location detection
- **Batch Processing**: Process multiple products in a single operation
- **Error Handling**: Comprehensive error handling with retry mechanisms
- **Dry-Run Mode**: Test operations without making actual API calls

## Getting Started

1. Clone this repository
2. Copy `.env.example` to `.env` and configure your Square and OpenAI credentials
3. Install dependencies with `pnpm install`
4. Test Square connection: `node scripts/test-square-catalog-agent.js`
5. Run `pnpm run manage-images:dry-run` to test the AI workflow
6. Use the SquareCatalogAgent to manage your Square inventory

### Quick Start with Square Integration

```javascript
import { SquareCatalogAgent } from './src/agents/SquareCatalogAgent.js';

const agent = new SquareCatalogAgent();

// Test connection
const isConnected = await agent.testConnection();

// Get locations
const locations = await agent.getLocations();

// Upload an image
const imageBuffer = await fs.readFile('product-image.jpg');
const uploadedImage = await agent.uploadImage(imageBuffer, 'Product Name');

// Create catalog item
const productData = {
  productName: 'My Product',
  description: 'Product description',
  category: 'jewelry'
};
const item = await agent.createCatalogItem(productData, uploadedImage.id);
```
