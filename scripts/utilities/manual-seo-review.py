import pandas as pd
import json
from datetime import datetime

# Load the merged catalog
df = pd.read_excel('organized-inventory/00-active-working/MERGED_COMPREHENSIVE_CATALOG_2025-08-03.xlsx')

# Filter products that need SEO
needs_seo = df[(df['SEO Title'].isna()) | (df['SEO Description'].isna())]
print(f"Found {len(needs_seo)} products that need SEO enhancement\n")

# Create a list to store our manual SEO updates
seo_updates = []

# Show first 10 products that need SEO
print("=== PRODUCTS NEEDING SEO (First 10) ===\n")
for idx, (i, product) in enumerate(needs_seo.head(10).iterrows()):
    print(f"\n{'='*80}")
    print(f"#{idx+1}. {product['Item Name']}")
    print(f"{'='*80}")
    print(f"Price: ${product.get('Price', 'N/A')}")
    print(f"Category: {product.get('Categories', 'N/A')}")
    
    desc = str(product.get('Description', ''))
    print(f"\nDescription ({len(desc)} chars):")
    if len(desc) > 300:
        print(desc[:300] + "...")
    else:
        print(desc)
    
    print(f"\nCurrent SEO Status:")
    print(f"- Title: {product.get('SEO Title', 'MISSING')}")
    print(f"- Description: {product.get('SEO Description', 'MISSING')}")
    
    # Store for manual updates
    seo_updates.append({
        'index': i,
        'name': product['Item Name'],
        'needs_seo': True
    })

# Save the list of products needing SEO
with open('products_needing_seo.json', 'w') as f:
    json.dump(seo_updates, f, indent=2)

print(f"\n\n{'='*80}")
print("NEXT STEPS:")
print("1. Review each product above")
print("2. Create unique, tailored SEO for each")
print("3. Update the catalog with the new SEO data")
print(f"\nTotal products needing SEO: {len(needs_seo)}")
