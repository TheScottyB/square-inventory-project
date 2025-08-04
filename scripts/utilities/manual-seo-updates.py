import pandas as pd
import json
from datetime import datetime

# Load the catalog
df = pd.read_excel('organized-inventory/00-active-working/MERGED_COMPREHENSIVE_CATALOG_2025-08-03.xlsx')

# Define our manually crafted SEO for each product
seo_updates = [
    {
        "name": "\"The Original\" Metal Electric Guitar Sculpture Heavy Metal Wall Art",
        "seo_title": "Handcrafted Metal Guitar Sculpture | Heavy Metal Wall Art",
        "seo_description": "One-of-a-kind recycled metal electric guitar sculpture. Handcrafted wall art for music lovers. Each piece unique. Ships worldwide.",
        "keywords": "metal guitar sculpture, heavy metal wall art, recycled metal art, music room decor, handcrafted guitar art"
    },
    {
        "name": "10\" Quartz Crystal Singing Bowl, Solar Plexus Chakra (Regulate your",
        "seo_title": "10\" Solar Plexus Chakra Crystal Singing Bowl | Sound Healing",
        "seo_description": "Premium 10-inch quartz crystal singing bowl tuned for Solar Plexus Chakra. Enhances self-esteem & personal power. Professional sound therapy tool.",
        "keywords": "solar plexus singing bowl, crystal singing bowl 10 inch, chakra healing bowl, sound therapy, meditation bowl"
    },
    {
        "name": "10-Pcs Sleek Modern Pinky Flatware Silverware Flatware Set",
        "seo_title": "Pink Handle Flatware Set 10pc | Modern Nordic Silverware",
        "seo_description": "Chic 10-piece stainless steel flatware set with pink handles. Nordic minimalist design perfect for modern dining. Dishwasher safe.",
        "keywords": "pink flatware set, modern silverware, nordic cutlery, colored flatware, minimalist dining set"
    },
    {
        "name": "16 Colors Sunset Projection Lamp Sunset Lamp",
        "seo_title": "16-Color Sunset Projection Lamp | RGB Mood Lighting",
        "seo_description": "Transform any room with 16 dynamic sunset colors. Crystal lens creates stunning rainbow & sunset effects. Remote control included.",
        "keywords": "sunset lamp, projection lamp, rgb mood light, sunset projector, bedroom ambient lighting"
    },
    {
        "name": "2021 New Wireless Headset HIFI Stereo Bluetooth Headphones",
        "seo_title": "Wireless Bluetooth Headphones | HiFi Stereo with TF Card",
        "seo_description": "Premium wireless headphones with HiFi stereo sound. Bluetooth 5.0, TF card slot, FM radio. Compatible with iPhone & Android.",
        "keywords": "bluetooth headphones, wireless headset, hifi stereo headphones, tf card headphones, bluetooth 5.0"
    },
    {
        "name": "3 Pcs California White Sage + Lavender Bundle Smudge 4\"",
        "seo_title": "White Sage Lavender Smudge Bundle 3-Pack | California Sage",
        "seo_description": "Ethically sourced California white sage with lavender. Three 4-inch bundles for cleansing & aromatherapy. Hand-wrapped, premium quality.",
        "keywords": "white sage bundle, lavender smudge stick, california sage, cleansing bundle, aromatherapy sage"
    },
    {
        "name": "3D Printing Moon Lamp Galaxy Moon Light with Remote Control",
        "seo_title": "3D Galaxy Moon Lamp 16 Colors | Remote Control Night Light",
        "seo_description": "Realistic 3D printed moon lamp with 16 color options. Touch & remote control, USB rechargeable. Perfect gift for space lovers.",
        "keywords": "3d moon lamp, galaxy moon light, color changing moon lamp, night light remote, space decor"
    },
    {
        "name": "4 Pcs White Sage + Red Eucalyptus Bundle Smudge",
        "seo_title": "White Sage & Red Eucalyptus Smudge 4-Pack | Energy Cleanse",
        "seo_description": "Premium 4.5\" sage bundles with vibrant red eucalyptus. Ethically sourced from Southern California. Perfect for cleansing & respiratory support.",
        "keywords": "sage eucalyptus bundle, red eucalyptus smudge, energy cleansing, respiratory herbs, california sage bundles"
    },
    {
        "name": "7 Chakra Stones & Silver, Spiritual Jewelry, Chakra Bracelet",
        "seo_title": "7 Chakra Gemstone Bracelet | Sterling Silver Spiritual Jewelry",
        "seo_description": "Genuine chakra stones with sterling silver accents. Balances all 7 chakras for wellbeing. Adjustable spiritual bracelet.",
        "keywords": "chakra bracelet, 7 chakra stones, spiritual jewelry, gemstone bracelet, chakra balancing jewelry"
    },
    {
        "name": "7 Chakras Engraved Crescent Moon Selenite Plate",
        "seo_title": "Selenite Crescent Moon Plate | 7 Chakra Symbols Engraved",
        "seo_description": "Hand-carved Moroccan selenite moon with chakra engravings. High-vibration crystal for meditation & energy work. Ritual altar piece.",
        "keywords": "selenite moon plate, chakra selenite, crescent moon crystal, meditation plate, altar decor"
    }
]

# Update the dataframe with our SEO
print("🔄 Updating catalog with tailored SEO...\n")
updated_count = 0

for update in seo_updates:
    # Find the product
    mask = df['Item Name'] == update['name']
    if mask.any():
        idx = df[mask].index[0]
        df.loc[idx, 'SEO Title'] = update['seo_title']
        df.loc[idx, 'SEO Description'] = update['seo_description']
        df.loc[idx, '_seo_keywords'] = update['keywords']
        df.loc[idx, '_seo_updated'] = datetime.now().isoformat()
        updated_count += 1
        print(f"✅ Updated: {update['name'][:50]}...")
        print(f"   Title: {update['seo_title']}")
        print(f"   Desc: {update['seo_description'][:80]}...\n")
    else:
        print(f"❌ Not found: {update['name']}")

# Save the updated catalog
output_path = f'organized-inventory/00-active-working/CATALOG_WITH_SEO_BATCH1_{datetime.now().strftime("%Y%m%d_%H%M")}.xlsx'
df.to_excel(output_path, index=False)

print(f"\n✨ Updated {updated_count} products with tailored SEO")
print(f"📄 Saved to: {output_path}")
print(f"\n📊 SEO Status:")
print(f"- Products with SEO Title: {df['SEO Title'].notna().sum()}")
print(f"- Products with SEO Description: {df['SEO Description'].notna().sum()}")
print(f"- Remaining without SEO: {df['SEO Title'].isna().sum()}")
