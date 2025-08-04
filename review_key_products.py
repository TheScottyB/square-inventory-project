import pandas as pd
import warnings
warnings.filterwarnings('ignore')

# Load the merged catalog
df = pd.read_excel('organized-inventory/00-active-working/MERGED_COMPREHENSIVE_CATALOG_2025-08-03.xlsx')

print("=== KEY PRODUCT REVIEW ===\n")
print(f"Total products in catalog: {len(df)}\n")

# 1. Search for specific items
print("1. LOOKING FOR KEY PRODUCTS:")
search_terms = ['Selenite', 'Chakra', 'Rose Candle', 'Crystal Singing Bowl', 'Tarot']

for term in search_terms:
    matches = df[df['Item Name'].str.contains(term, case=False, na=False)]
    print(f"\n{term} products: {len(matches)}")
    for idx, prod in matches.head(3).iterrows():
        print(f"  - {prod['Item Name']}")

# 2. High-value items
print("\n\n2. HIGH-VALUE ITEMS (OVER $75):")
df['Price'] = pd.to_numeric(df['Price'], errors='coerce')
high_value = df[df['Price'] > 75].sort_values('Price', ascending=False)
for idx, prod in high_value.head(5).iterrows():
    print(f"  ${prod['Price']:.2f} - {prod['Item Name']}")

# 3. Items with complete SEO
print("\n\n3. BEST SEO EXAMPLES:")
seo_complete = df[(df['SEO Title'].notna()) & (df['SEO Description'].notna())]
print(f"Total with complete SEO: {len(seo_complete)}")
for idx, prod in seo_complete.head(3).iterrows():
    print(f"\n{prod['Item Name']}")
    print(f"  SEO Title: {prod['SEO Title']}")
    print(f"  SEO Desc: {str(prod['SEO Description'])[:100]}...")

# 4. Category distribution
print("\n\n4. TOP CATEGORIES:")
category_counts = df['Categories'].value_counts().head(5)
for cat, count in category_counts.items():
    print(f"  {cat}: {count} products")
