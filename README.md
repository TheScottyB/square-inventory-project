# Square Inventory Project

This repository contains Square inventory management data and reports for tracking catalog and error information.

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

## Getting Started

1. Clone this repository
2. Use the directory structure to organize new inventory exports
3. Follow the established naming conventions for consistency
4. Review error reports regularly to maintain data integrity
