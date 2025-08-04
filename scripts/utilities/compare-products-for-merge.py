#!/usr/bin/env python3

import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')

# Load all catalogs
print("Loading catalogs...")
square_df = pd.read_excel('exports/7MM9AFJAD0XHW_catalog-2025-08-03-1627.xlsx', header=1)
palka_df = pd.read_excel('Palka_Store_SEO_Enriched_Final.xlsx')
tbd_df = pd.read_excel('organized-inventory/02-inventory/exports/TBDLabz_Catalog_All_Updated_Final.xlsx')

# Create a comprehensive product list
all_products = {}

# Function to clean and standardize product names for matching
def clean_name(name):
    if pd.isna(name):
        return ""
    return str(name).lower().strip()

# First, collect all unique products
print("\nCollecting all unique products...")

# Add Square products
for idx, row in square_df.iterrows():
    name = clean_name(row.get('Item Name', ''))
    if name:
        if name not in all_products:
            all_products[name] = {
                'sources': [],
                'square': None,
                'palka': None,
                'tbd': None
            }
        all_products[name]['square'] = row
        all_products[name]['sources'].append('square')

# Add Palka products
for idx, row in palka_df.iterrows():
    name = clean_name(row.get('Item Name', ''))
    if name:
        if name not in all_products:
            all_products[name] = {
                'sources': [],
                'square': None,
                'palka': None,
                'tbd': None
            }
        all_products[name]['palka'] = row
        if 'palka' not in all_products[name]['sources']:
            all_products[name]['sources'].append('palka')

# Add TBD products
for idx, row in tbd_df.iterrows():
    name = clean_name(row.get('Item Name', ''))
    if name:
        if name not in all_products:
            all_products[name] = {
                'sources': [],
                'square': None,
                'palka': None,
                'tbd': None
            }
        all_products[name]['tbd'] = row
        if 'tbd' not in all_products[name]['sources']:
            all_products[name]['sources'].append('tbd')

# Count products by source overlap
single_source = sum(1 for p in all_products.values() if len(p['sources']) == 1)
double_source = sum(1 for p in all_products.values() if len(p['sources']) == 2)
triple_source = sum(1 for p in all_products.values() if len(p['sources']) == 3)

print(f"\nProduct Distribution:")
print(f"- Single source only: {single_source}")
print(f"- Two sources: {double_source}")
print(f"- All three sources: {triple_source}")
print(f"- Total unique products: {len(all_products)}")

# Save comparison data for manual review
# Focus on products that appear in multiple sources
multi_source_products = [(name, data) for name, data in all_products.items() if len(data['sources']) > 1]

print(f"\n\nComparing {len(multi_source_products)} products that appear in multiple catalogs...")

# Create a comparison file
comparison_data = []

for product_name, product_data in multi_source_products[:20]:  # Start with first 20
    comparison = {
        'product_name': product_name,
        'sources': ', '.join(product_data['sources'])
    }
    
    # Compare descriptions
    if product_data['square'] is not None:
        comparison['square_desc'] = str(product_data['square'].get('Description', ''))[:200]
        comparison['square_seo_title'] = str(product_data['square'].get('SEO Title', ''))
        comparison['square_seo_desc'] = str(product_data['square'].get('SEO Description', ''))[:200]
        comparison['square_categories'] = str(product_data['square'].get('Categories', ''))
    
    if product_data['palka'] is not None:
        comparison['palka_desc'] = str(product_data['palka'].get('Description', ''))[:200]
        comparison['palka_seo_title'] = str(product_data['palka'].get('SEO Title', ''))
        comparison['palka_seo_desc'] = str(product_data['palka'].get('SEO Description', ''))[:200]
        comparison['palka_categories'] = str(product_data['palka'].get('Categories', ''))
    
    if product_data['tbd'] is not None:
        comparison['tbd_desc'] = str(product_data['tbd'].get('Description', ''))[:200]
        comparison['tbd_seo_title'] = str(product_data['tbd'].get('SEO Title', ''))
        comparison['tbd_seo_desc'] = str(product_data['tbd'].get('SEO Description', ''))[:200]
        comparison['tbd_categories'] = str(product_data['tbd'].get('Categories', ''))
    
    comparison_data.append(comparison)

# Save to Excel for review
comparison_df = pd.DataFrame(comparison_data)
comparison_df.to_excel('product_comparison_for_merge.xlsx', index=False)

print("\nCreated 'product_comparison_for_merge.xlsx' for manual review")
print("\nShowing first 3 products for comparison:")

# Display first few for immediate review
for i in range(min(3, len(multi_source_products))):
    name, data = multi_source_products[i]
    print(f"\n{'='*80}")
    print(f"PRODUCT: {name.upper()}")
    print(f"Found in: {', '.join(data['sources'])}")
    print(f"{'='*80}")
    
    if data['square'] is not None:
        print("\n--- SQUARE EXPORT ---")
        desc = str(data['square'].get('Description', ''))
        print(f"Description ({len(desc)} chars): {desc[:200]}..." if len(desc) > 200 else f"Description: {desc}")
        print(f"SEO Title: {data['square'].get('SEO Title', '')}")
        seo_desc = str(data['square'].get('SEO Description', ''))
        print(f"SEO Desc ({len(seo_desc)} chars): {seo_desc[:150]}..." if len(seo_desc) > 150 else f"SEO Desc: {seo_desc}")
        print(f"Categories: {data['square'].get('Categories', '')}")
    
    if data['palka'] is not None:
        print("\n--- PALKA STORE ---")
        desc = str(data['palka'].get('Description', ''))
        print(f"Description ({len(desc)} chars): {desc[:200]}..." if len(desc) > 200 else f"Description: {desc}")
        print(f"SEO Title: {data['palka'].get('SEO Title', '')}")
        seo_desc = str(data['palka'].get('SEO Description', ''))
        print(f"SEO Desc ({len(seo_desc)} chars): {seo_desc[:150]}..." if len(seo_desc) > 150 else f"SEO Desc: {seo_desc}")
        print(f"Categories: {data['palka'].get('Categories', '')}")
    
    if data['tbd'] is not None:
        print("\n--- TBDLABZ ---")
        desc = str(data['tbd'].get('Description', ''))
        print(f"Description ({len(desc)} chars): {desc[:200]}..." if len(desc) > 200 else f"Description: {desc}")
        print(f"SEO Title: {data['tbd'].get('SEO Title', '')}")
        seo_desc = str(data['tbd'].get('SEO Description', ''))
        print(f"SEO Desc ({len(seo_desc)} chars): {seo_desc[:150]}..." if len(seo_desc) > 150 else f"SEO Desc: {seo_desc}")
        print(f"Categories: {data['tbd'].get('Categories', '')}")
