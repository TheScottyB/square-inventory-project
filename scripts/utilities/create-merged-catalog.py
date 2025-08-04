#!/usr/bin/env python3

import pandas as pd
import numpy as np
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

print("Creating Comprehensive Merged Catalog...")
print("="*80)

# Load all catalogs
square_df = pd.read_excel('exports/7MM9AFJAD0XHW_catalog-2025-08-03-1627.xlsx', header=1)
palka_df = pd.read_excel('Palka_Store_SEO_Enriched_Final.xlsx')
tbd_df = pd.read_excel('organized-inventory/02-inventory/exports/TBDLabz_Catalog_All_Updated_Final.xlsx')

# Create merged catalog using Square's structure as base
merged_catalog = []

# Function to clean and standardize product names
def clean_name(name):
    if pd.isna(name):
        return ""
    return str(name).lower().strip()

# Function to evaluate description quality
def evaluate_description(desc):
    if pd.isna(desc) or str(desc) == 'nan' or not desc:
        return 0
    desc_str = str(desc)
    score = len(desc_str)
    # Bonus for complete sentences
    if '.' in desc_str:
        score += 50
    # Bonus for detailed descriptions
    if len(desc_str) > 100:
        score += 100
    return score

# Function to evaluate SEO quality
def evaluate_seo(title, desc):
    score = 0
    if not pd.isna(title) and str(title) != 'nan':
        score += 100 + len(str(title))
    if not pd.isna(desc) and str(desc) != 'nan':
        score += 100 + len(str(desc))
    return score

# Process each unique product
print("\nProcessing products for merge...")

# First, index all products by cleaned name
product_index = {}

# Index Square products
for idx, row in square_df.iterrows():
    name = clean_name(row.get('Item Name', ''))
    if name:
        if name not in product_index:
            product_index[name] = {'square': [], 'palka': [], 'tbd': []}
        product_index[name]['square'].append(row)

# Index Palka products
for idx, row in palka_df.iterrows():
    name = clean_name(row.get('Item Name', ''))
    if name:
        if name not in product_index:
            product_index[name] = {'square': [], 'palka': [], 'tbd': []}
        product_index[name]['palka'].append(row)

# Index TBD products
for idx, row in tbd_df.iterrows():
    name = clean_name(row.get('Item Name', ''))
    if name:
        if name not in product_index:
            product_index[name] = {'square': [], 'palka': [], 'tbd': []}
        product_index[name]['tbd'].append(row)

# Manual merge decisions
merge_count = 0
products_processed = 0

for product_name, sources in sorted(product_index.items()):
    products_processed += 1
    
    # Get best data from each source
    best_square = sources['square'][0] if sources['square'] else None
    best_palka = sources['palka'][0] if sources['palka'] else None
    best_tbd = sources['tbd'][0] if sources['tbd'] else None
    
    # Start with the most complete base (usually Square for structure)
    if best_square is not None:
        merged_row = best_square.copy()
    elif best_palka is not None:
        merged_row = best_palka.copy()
    elif best_tbd is not None:
        merged_row = best_tbd.copy()
    else:
        continue
    
    # Manual selection of best data
    merge_notes = []
    
    # DESCRIPTION - Choose the best one
    descriptions = {
        'square': (best_square.get('Description', '') if best_square is not None else ''),
        'palka': (best_palka.get('Description', '') if best_palka is not None else ''),
        'tbd': (best_tbd.get('Description', '') if best_tbd is not None else '')
    }
    
    desc_scores = {k: evaluate_description(v) for k, v in descriptions.items()}
    best_desc_source = max(desc_scores, key=desc_scores.get)
    
    if desc_scores[best_desc_source] > 0:
        merged_row['Description'] = descriptions[best_desc_source]
        merge_notes.append(f"desc:{best_desc_source}")
    
    # SEO TITLE & DESCRIPTION - Choose the best set
    seo_data = {
        'square': {
            'title': best_square.get('SEO Title', '') if best_square is not None else '',
            'desc': best_square.get('SEO Description', '') if best_square is not None else ''
        },
        'palka': {
            'title': best_palka.get('SEO Title', '') if best_palka is not None else '',
            'desc': best_palka.get('SEO Description', '') if best_palka is not None else ''
        },
        'tbd': {
            'title': best_tbd.get('SEO Title', '') if best_tbd is not None else '',
            'desc': best_tbd.get('SEO Description', '') if best_tbd is not None else ''
        }
    }
    
    seo_scores = {k: evaluate_seo(v['title'], v['desc']) for k, v in seo_data.items()}
    best_seo_source = max(seo_scores, key=seo_scores.get)
    
    if seo_scores[best_seo_source] > 0:
        merged_row['SEO Title'] = seo_data[best_seo_source]['title']
        merged_row['SEO Description'] = seo_data[best_seo_source]['desc']
        merge_notes.append(f"seo:{best_seo_source}")
    
    # CATEGORIES - Prefer Palka's curated categories if available
    if best_palka is not None and not pd.isna(best_palka.get('Categories', '')):
        merged_row['Categories'] = best_palka.get('Categories', '')
        merge_notes.append("cat:palka")
    elif best_square is not None and not pd.isna(best_square.get('Categories', '')):
        merged_row['Categories'] = best_square.get('Categories', '')
        merge_notes.append("cat:square")
    
    # Add merge metadata
    merged_row['_merge_sources'] = ', '.join([k for k, v in sources.items() if v])
    merged_row['_merge_notes'] = ', '.join(merge_notes)
    
    merged_catalog.append(merged_row)
    
    if len(sources['square']) + len(sources['palka']) + len(sources['tbd']) > 1:
        merge_count += 1
    
    # Show progress every 50 products
    if products_processed % 50 == 0:
        print(f"Processed {products_processed} products...")

# Create final DataFrame
final_catalog = pd.DataFrame(merged_catalog)

# Sort by Item Name
final_catalog = final_catalog.sort_values('Item Name', na_position='last')

# Save the merged catalog
output_filename = f'MERGED_COMPREHENSIVE_CATALOG_{datetime.now().strftime("%Y-%m-%d_%H%M")}.xlsx'
final_catalog.to_excel(output_filename, index=False)

print(f"\n{'='*80}")
print(f"MERGE COMPLETE!")
print(f"{'='*80}")
print(f"Total products in merged catalog: {len(final_catalog)}")
print(f"Products merged from multiple sources: {merge_count}")
print(f"Output saved to: {output_filename}")

# Show merge statistics
print("\nMerge Statistics:")
desc_sources = [note.split(':')[1] for note in final_catalog['_merge_notes'] if 'desc:' in str(note)]
seo_sources = [note.split(':')[1] for note in final_catalog['_merge_notes'] if 'seo:' in str(note)]
cat_sources = [note.split(':')[1] for note in final_catalog['_merge_notes'] if 'cat:' in str(note)]

if desc_sources:
    print(f"\nDescription sources:")
    for source in ['square', 'palka', 'tbd']:
        count = desc_sources.count(source)
        if count > 0:
            print(f"  - {source}: {count} products")

if seo_sources:
    print(f"\nSEO data sources:")
    for source in ['square', 'palka', 'tbd']:
        count = seo_sources.count(source)
        if count > 0:
            print(f"  - {source}: {count} products")

if cat_sources:
    print(f"\nCategory sources:")
    for source in ['square', 'palka', 'tbd']:
        count = cat_sources.count(source)
        if count > 0:
            print(f"  - {source}: {count} products")

# Show sample of merged products
print("\n\nSample of merged products with multiple sources:")
multi_source = final_catalog[final_catalog['_merge_sources'].str.contains(',')].head(5)
for idx, row in multi_source.iterrows():
    print(f"\n- {row['Item Name']}")
    print(f"  Sources: {row['_merge_sources']}")
    print(f"  Merge notes: {row['_merge_notes']}")
    desc = str(row.get('Description', ''))
    if desc and desc != 'nan':
        print(f"  Description: {desc[:100]}...")
    if not pd.isna(row.get('SEO Title', '')):
        print(f"  SEO Title: {row['SEO Title']}")
