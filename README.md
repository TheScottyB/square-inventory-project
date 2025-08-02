# Square Inventory Project

This repository contains Square inventory management data and reports for tracking catalog and error information.

## Directory Structure

```
├── catalogs/           # Square catalog exports with timestamps
├── error-reports/      # Error reports from inventory operations
└── sneaker-catalogs/   # Specialized sneaker inventory catalogs
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
