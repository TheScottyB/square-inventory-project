# Excel Files Summary - Square Inventory Project

## Overview
Total Excel/CSV files found across the project, organized by location and purpose.

## Files in `organized-inventory/02-inventory/exports/` (11 files)

### Inventory History
- `inventory-history-2025-05-13.xlsx` (20.7 KB) - May 13 inventory snapshot
- `inventory-history-2025-06-09.xlsx` (10.4 KB) - June 9 inventory snapshot

### TBDLabz Catalogs (Updated Versions)
- `TBDLabz_Catalog_All_Updated_Final.xlsx` (62.5 KB) - Complete final catalog
- `TBDLabz_Catalog_With_Candle_Updated.xlsx` (71.1 KB) - Catalog with candle products
- `TBDLabz_Catalog_With_Cap_Updated.xlsx` (62.3 KB) - Catalog with cap products
- `TBDLabz_Catalog_With_Dock_Updated.xlsx` (62.1 KB) - Catalog with dock products
- `TBDLabz_Catalog_With_Grouse_Adjusted.xlsx` (62.3 KB) - Catalog with grouse plate
- `TBDLabz_Catalog_With_Poster_Updated.xlsx` (62.3 KB) - Catalog with poster products

### Other Catalogs
- `Survival_Kit_Catalog_Corrected_Final.xlsx` (23.7 KB) - Final survival kit catalog
- `Survival_Kit_Catalog_With_SEO_Metadata.xlsx` (19.9 KB) - SEO-enhanced version
- `sneaker_test_catalog_FIXED.xlsx` (10.7 KB) - Fixed sneaker catalog

## Files in Root Directory (14 files - need review/organization)

### TRTR (River Ridge Vintage) Files
- `Enriched_TRTR_Items_FullBatch.xlsx` (10.3 KB)
- `Enriched_TRTR_Items_Round1.xlsx` (6.1 KB)

### Palka Store Files (Large catalog files ~170KB each)
- `Palka_Store_With_French_Flag_Categories.xlsx` (171.3 KB)
- `Palka_Store_TVM_Categories_Final_Cleaned.xlsx` (171.0 KB)
- `Palka_Store_Final_Categorized_Enriched.xlsx` (170.7 KB)
- `Palka_Store_Final_Visible_Categories_Cleaned.xlsx` (170.5 KB)
- `Palka_Store_Categories_Flag_Synced.xlsx` (170.4 KB)
- `Palka_Store_SEO_Enriched_Final.xlsx` (169.8 KB)
- `Labz_Store_With_Flagged_Categories_Sorted.xlsx` (170.0 KB)

### TBDLabz Files (not yet moved)
- `TBDLabz_CuratedLabz_Categories_Updated.xlsx` (62.0 KB)
- `TBDLabz_Updated_All_Descriptions.xlsx` (23.1 KB)

### Product-Specific Files
- `HYDRATION_PATCH_visible_items_ready.xlsx` (10.1 KB)
- `petes_dragon_square_rich_upsert.xlsx` (9.2 KB)
- `petes_dragon_square_upsert.xlsx` (8.5 KB)

## Files in `exports/` Directory (Original location)

### Square Catalog Exports (by date)
- Multiple versions of `7MM9AFJAD0XHW_catalog-*.xlsx/csv` files
- Date range: May 11, 2025 to Aug 3, 2025
- Includes SEO-enhanced versions

### Subdirectories:
- `corrupted-templates/` - Failed enhancement attempts
- `processed-catalog/` - Processed versions
- `sku-categorization/` - SKU organization files
- `enhanced/` - Enhanced catalog versions

## Key Observations

1. **Multiple Catalog Versions**: Many files appear to be different versions of the same catalog with incremental updates
2. **Store-Specific Catalogs**: Palka Store files are significantly larger (~170KB) suggesting more products
3. **SEO Enhancement**: Several files show SEO metadata additions
4. **Date-Based Versioning**: Files use dates in filenames for version control
5. **Business Entities**: Files are associated with different entities (TBDLabz, TRTR, Palka Store)

## Recommendations

1. **Move remaining root files** to appropriate folders:
   - Palka Store files → Create `organized-inventory/02-inventory/exports/palka-store/`
   - TRTR files → Create `organized-inventory/02-inventory/exports/river-ridge-vintage/`
   - Remaining TBDLabz files → Move to exports with other TBDLabz files

2. **Create a catalog versioning system** to track which files are:
   - Current/active versions
   - Historical snapshots
   - Work-in-progress versions

3. **Consider consolidating** multiple partial catalogs into comprehensive versions

4. **Archive older versions** to reduce clutter while maintaining history
