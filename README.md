# Square Inventory Project

AI-powered image processing workflow for Square inventory management using the OpenAI Agent SDK. This project analyzes product images and automatically generates detailed descriptions and groupings for inventory management.

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

## AI-Powered Workflow

### Configuration

Configuration is managed through environment variables. Copy `.env.example` to `.env` and set your values:

```bash
cp .env.example .env
```

**Required Environment Variables:**
- `OPENAI_API_KEY`: Your OpenAI API key
- `IMAGE_SOURCE_DIR`: Directory containing product images (default: `./`)
- `IMAGE_OUTPUT_DIR`: Output directory for results (default: `./output`)
- `MAX_DESCRIPTION_LENGTH`: Maximum length for product descriptions (default: 500)
- `GROUPING_SIMILARITY_THRESHOLD`: Similarity threshold for product grouping (default: 0.8)
- `ENABLE_DRY_RUN`: Set to `true` for testing without API calls (default: false)

### Architecture

- **ImageAnalysisAgent**: Analyzes individual product images using OpenAI's vision models
- **GroupingAgent**: Clusters analyzed products based on similarity
- **Centralized Configuration**: Manages all settings through `src/config/index.js`

### Running the Workflow

```bash
# Install dependencies
pnpm install

# Run the full workflow
pnpm run manage-images

# Run a dry-run (no API calls)
pnpm run manage-images:dry-run

# Run tests
pnpm test

# Lint code
pnpm run lint
```

### Output

The workflow generates a JSON file with:
- Individual product analysis results
- Product groupings based on similarity
- Metadata including timestamps and confidence scores

## Getting Started

1. Clone this repository
2. Copy `.env.example` to `.env` and configure your OpenAI API key
3. Install dependencies with `pnpm install`
4. Run `pnpm run manage-images:dry-run` to test the configuration
5. Run `pnpm run manage-images` to process your product images
