import pandas as pd
import json
import warnings
warnings.filterwarnings('ignore')

# Load the merged catalog
df = pd.read_excel('organized-inventory/00-active-working/MERGED_COMPREHENSIVE_CATALOG_2025-08-03.xlsx')

print("=== DETAILED REVIEW OF 10 KEY PRODUCTS ===\n")

# Select 10 diverse key products for review
key_products = [
    "Selenite Lamp",
    "2-Pack Rose Candles – Scented Mini Votives",
    "📼 Willy Wonka & The Chocolate Factory – 1986 Warner Bros. Sealed VHS (French Language – Version Française)",
    "10\" Quartz Crystal Singing Bowl, Solar Plexus Chakra (Regulate your",
    "7 Chakra Stones & Silver, Spiritual Jewelry, Chakra Bracelet",
    "Amethyst Stone Home Decoration",
    "\"The Original\" Metal Electric Guitar Sculpture Heavy Metal Wall Art", 
    "1 Pcs Lotus Flower Design Agarbatti Stand Incense Holder Ash Catcher",
    "14-in-1 Outdoor Emergency Survival Gear Kit – Tactical & Adventure Ready",
    "The Rider Waite Purple Neon Foil Tarot Deck"
]

for i, product_name in enumerate(key_products, 1):
    # Find product
    mask = df['Item Name'] == product_name
    if not mask.any():
        # Try partial match
        mask = df['Item Name'].str.contains(product_name[:30], case=False, na=False)
    
    if mask.any():
        prod = df[mask].iloc[0]
        print(f"\n{'='*80}")
        print(f"#{i}. {prod['Item Name']}")
        print(f"{'='*80}")
        
        # Basic info
        print(f"Price: ${prod.get('Price', 'N/A')}")
        print(f"Categories: {prod.get('Categories', 'N/A')}")
        print(f"SKU: {prod.get('SKU', 'N/A')}")
        
        # Description
        desc = str(prod.get('Description', 'No description'))
        print(f"\nDescription ({len(desc)} chars):")
        if len(desc) > 200:
            print(desc[:200] + "...")
        else:
            print(desc)
        
        # SEO Status
        print(f"\nSEO Status:")
        seo_title = prod.get('SEO Title', '')
        seo_desc = prod.get('SEO Description', '')
        print(f"- SEO Title: {'✅ Present' if pd.notna(seo_title) and seo_title else '❌ Missing'}")
        print(f"- SEO Description: {'✅ Present' if pd.notna(seo_desc) and seo_desc else '❌ Missing'}")
        
        if pd.notna(seo_title) and seo_title:
            print(f"  Title: {seo_title}")
        if pd.notna(seo_desc) and seo_desc:
            print(f"  Desc: {str(seo_desc)[:100]}...")
            
        # Merge info
        print(f"\nData Sources: {prod.get('_merge_sources', 'N/A')}")
        print(f"Merge Notes: {prod.get('_merge_notes', 'N/A')}")
        
        # Check for images
        print(f"\nImage Status: Check product folder for images")

print(f"\n\n{'='*80}")
print("SUMMARY")
print(f"{'='*80}")

# Calculate statistics
total_with_desc = df['Description'].notna().sum()
total_with_seo_title = df['SEO Title'].notna().sum()
total_with_seo_desc = df['SEO Description'].notna().sum()
total_with_price = df['Price'].notna().sum()

print(f"\nOf 364 total products:")
print(f"- {total_with_desc} have descriptions ({total_with_desc/len(df)*100:.1f}%)")
print(f"- {total_with_seo_title} have SEO titles ({total_with_seo_title/len(df)*100:.1f}%)")
print(f"- {total_with_seo_desc} have SEO descriptions ({total_with_seo_desc/len(df)*100:.1f}%)")
print(f"- {total_with_price} have prices ({total_with_price/len(df)*100:.1f}%)")

print("\n✨ These 10 products represent a good cross-section of the catalog.")
print("📝 Review them carefully before proceeding with SEO enhancement for all products.")
