# Square Inventory Project - Folder Structure Analysis

## Current Structure Overview

### Top-Level Directories (15 total)
```
├── assets/                  # Product images and media files
├── chrome-extension/        # Chrome extension source code
├── data/                    # JSON data files and intelligence
├── docs/                    # Documentation files
├── exports/                 # Export files and processed catalogs
├── logs/                    # Application and process logs
├── output/                  # Analysis output files
├── reports/                 # Various report files
├── scripts/                 # JavaScript automation scripts
├── square-chrome-extension/ # Built extension files
├── src/                     # Main source code
├── Stackable Jewelry Box/   # Single product folder
├── test/                    # Test files
└── tests/                   # Unit tests
```

## Key Observations

### 1. **Loose Files at Root Level**
- **106 loose files** in the root directory including:
  - Product images (PNG, JPG)
  - Excel/CSV files for inventory
  - PDF documents
  - Python scripts
  - Configuration files
  - Product-specific files mixed with project files

### 2. **Assets Directory Structure**
The `assets/` directory shows some organization attempts:
```
assets/
├── archive/               # Old catalogs and enhancements
├── catalog-images/        # Multiple archive folders (needs cleanup)
├── downloaded-images/     # Downloaded product images
├── images/               # Organized by product categories
│   ├── candles-holders/
│   ├── first-aid-kits/
│   ├── jewelry/
│   └── ...
├── organized/            # Only has kitchen/flatware
└── Uncategorized/        # 250+ product folders
```

### 3. **Major Issues Identified**

1. **Root Directory Clutter**: Too many loose files that should be organized
2. **Uncategorized Products**: 250+ product folders in `assets/Uncategorized/`
3. **Inconsistent Naming**: Mix of naming conventions (underscores, hyphens, spaces)
4. **Duplicate Archive Folders**: Multiple "archive" folders in catalog-images
5. **Mixed Content Types**: Product files mixed with project/config files

### 4. **Product Categories Found**
Based on the Uncategorized folder, products include:
- Jewelry & Accessories
- Candles & Incense
- Crystal & Metaphysical Items
- Beauty & Personal Care
- Home Decor
- Tarot & Oracle Cards
- Clothing & Apparel
- Pet Products
- Office Supplies

## Recommended Organization Structure

```
square-inventory-project/
├── config/               # All configuration files
├── docs/                 # Keep existing documentation
├── scripts/              # Keep existing scripts
├── src/                  # Keep existing source code
├── tests/                # Consolidate test directories
├── logs/                 # Keep existing logs
├── data/                 # Keep existing data files
├── extensions/           # Consolidate chrome extensions
│   ├── source/
│   └── dist/
├── exports/              # Keep existing exports
├── reports/              # Keep existing reports
├── inventory/            # NEW - All product-related files
│   ├── imports/          # Import templates and files
│   ├── exports/          # Product export files
│   ├── documents/        # PDFs, invoices, statements
│   └── products/         # Organized product folders
│       ├── jewelry/
│       ├── candles/
│       ├── crystals/
│       ├── beauty/
│       ├── home-decor/
│       ├── tarot/
│       ├── apparel/
│       └── ...
└── assets/               # Reorganized media files
    ├── product-images/   # All product images
    ├── marketing/        # Marketing materials
    └── archive/          # Consolidated archives
```

## Next Steps

1. Create the new directory structure
2. Move and organize loose files from root
3. Categorize products from Uncategorized folder
4. Consolidate duplicate archive folders
5. Standardize naming conventions
6. Create index files for each category
