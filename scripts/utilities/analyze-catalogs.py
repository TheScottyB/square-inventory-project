#!/usr/bin/env python3

import pandas as pd
import os
from datetime import datetime
import re
from pathlib import Path

# Define paths
project_root = Path(__file__).parent.parent.parent
organized_exports = project_root / "organized-inventory/02-inventory/exports"
exports_dir = project_root / "exports"
root_dir = project_root

# Collect all Excel files
excel_files = []

# From organized exports
for file in organized_exports.glob("*.xlsx"):
    excel_files.append(("organized_exports", file))

# From exports directory
for file in exports_dir.glob("**/*.xlsx"):
    excel_files.append(("exports", file))

# From root directory
for file in root_dir.glob("*.xlsx"):
    if file.name not in ["pnpm-lock.yaml", "pnpm-workspace.yaml"]:
        excel_files.append(("root", file))

print("=" * 80)
print("SQUARE CATALOG ANALYSIS - COMPREHENSIVENESS & RECENCY")
print("=" * 80)

# Store analysis results
results = []

for location, file_path in excel_files:
    try:
        # Get file stats
        file_stat = os.stat(file_path)
        file_size_kb = file_stat.st_size / 1024
        modified_time = datetime.fromtimestamp(file_stat.st_mtime)
        
        # Try to extract date from filename
        date_pattern = r'(\d{4}-\d{2}-\d{2})'
        date_match = re.search(date_pattern, file_path.name)
        filename_date = date_match.group(1) if date_match else None
        
        # Read Excel file
        df = pd.read_excel(file_path)
        
        # Analyze content
        total_rows = len(df)
        
        # Count actual products (excluding empty rows)
        if 'Item Name' in df.columns:
            products_with_names = df['Item Name'].notna().sum()
        else:
            products_with_names = total_rows
            
        # Count variations
        unique_items = df['Reference Handle'].nunique() if 'Reference Handle' in df.columns else 0
        
        # Check for SEO data
        has_seo = 'SEO Title' in df.columns and df['SEO Title'].notna().sum() > 0
        seo_count = df['SEO Title'].notna().sum() if 'SEO Title' in df.columns else 0
        
        # Check for descriptions
        desc_count = df['Description'].notna().sum() if 'Description' in df.columns else 0
        
        # Check for categories
        cat_count = df['Categories'].notna().sum() if 'Categories' in df.columns else 0
        
        # Count locations enabled
        location_columns = [col for col in df.columns if 'Enabled' in col and 'Richmond' in col or 'McHenry' in col]
        
        results.append({
            'file': file_path.name,
            'location': location,
            'size_kb': file_size_kb,
            'modified': modified_time,
            'filename_date': filename_date,
            'total_rows': total_rows,
            'products': products_with_names,
            'unique_items': unique_items,
            'has_seo': has_seo,
            'seo_count': seo_count,
            'desc_count': desc_count,
            'cat_count': cat_count,
            'locations': len(location_columns),
            'path': str(file_path.relative_to(project_root))
        })
        
    except Exception as e:
        print(f"Error reading {file_path.name}: {e}")

# Sort by various criteria
print("\n1. MOST RECENT FILES (by modification date):")
print("-" * 60)
sorted_by_date = sorted(results, key=lambda x: x['modified'], reverse=True)[:10]
for r in sorted_by_date:
    print(f"{r['modified'].strftime('%Y-%m-%d %H:%M')} - {r['file'][:50]:50} | {r['products']:,} products")

print("\n2. LARGEST CATALOGS (by product count):")
print("-" * 60)
sorted_by_products = sorted(results, key=lambda x: x['products'], reverse=True)[:10]
for r in sorted_by_products:
    print(f"{r['products']:5,} products | {r['file'][:50]:50} | {r['size_kb']:.1f} KB")

print("\n3. MOST COMPREHENSIVE (products with SEO + descriptions):")
print("-" * 60)
# Calculate comprehensiveness score
for r in results:
    r['completeness'] = (
        (r['seo_count'] / r['products'] if r['products'] > 0 else 0) * 0.3 +
        (r['desc_count'] / r['products'] if r['products'] > 0 else 0) * 0.3 +
        (r['cat_count'] / r['products'] if r['products'] > 0 else 0) * 0.2 +
        (min(r['products'] / 1000, 1)) * 0.2  # Size factor
    )

sorted_by_completeness = sorted(results, key=lambda x: x['completeness'], reverse=True)[:10]
for r in sorted_by_completeness:
    print(f"Score: {r['completeness']:.2f} | {r['file'][:40]:40} | {r['products']:,} items | SEO: {r['seo_count']:,}")

print("\n4. CATALOG COMPARISON BY STORE:")
print("-" * 60)
# Group by store type
stores = {
    'TBDLabz': [],
    'Palka': [],
    'TRTR': [],
    'Square Exports': [],
    'Other': []
}

for r in results:
    if 'TBDLabz' in r['file'] or 'TBDL' in r['file']:
        stores['TBDLabz'].append(r)
    elif 'Palka' in r['file']:
        stores['Palka'].append(r)
    elif 'TRTR' in r['file']:
        stores['TRTR'].append(r)
    elif '7MM9AFJAD0XHW' in r['file']:
        stores['Square Exports'].append(r)
    else:
        stores['Other'].append(r)

for store, files in stores.items():
    if files:
        print(f"\n{store}:")
        sorted_files = sorted(files, key=lambda x: x['products'], reverse=True)[:3]
        for f in sorted_files:
            print(f"  - {f['file'][:45]:45} | {f['products']:,} products | {f['modified'].strftime('%Y-%m-%d')}")

print("\n5. RECOMMENDED MOST RECENT & COMPREHENSIVE CATALOGS:")
print("-" * 60)
# Find best catalog per store
for store, files in stores.items():
    if files:
        # Sort by completeness and recency
        best = sorted(files, key=lambda x: (x['completeness'], x['modified']), reverse=True)[0]
        print(f"\n{store}: {best['file']}")
        print(f"  - Products: {best['products']:,}")
        print(f"  - SEO Entries: {best['seo_count']:,}")
        print(f"  - Last Modified: {best['modified'].strftime('%Y-%m-%d %H:%M')}")
        print(f"  - Completeness Score: {best['completeness']:.2f}")

print("\n" + "=" * 80)
