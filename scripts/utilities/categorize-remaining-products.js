#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

// Manual categorization for the 50 remaining products
const manualCategorization = {
  'health-wellness': [
    '14-in-1_Outdoor_Emergency_Survival_Gear_Kit_Tactical_Adventure_Ready',
    'Ambulance_Family_First_Aid_Kit_-_Cute_Medicine_Lock_Storage_Box',
    'Charlie_Buddy_Hmp_Oil_for_Dogs_Cats_Hi_and_Jint_Supprt_and', // Pet health
    'The_Essence_of_Lavender_Spa_Gift_Basket_-_spa_baskets_for_women_gift'
  ],
  
  'office-tech': [
    '2021_New_Wireless_Headset_HIFI_Stereo_Bluetooth_Headphones',
    'Dragon_W9_Wireless_Charging_Pad_30W_Fast_Dock',
    'DrDzbs_Laptop_Sleeve',
    'Ninja_Dragon_Z10_Color_Changing_Bluetooth_Headphones',
    'Ninja_Dragons_3_in1_Wireless_Foldable_Charging_Station',
    'Zoey_in_the_Laundry_Clear_Case_for_iPhone'
  ],
  
  'beauty-personal-care': [
    'Best_Beard_On_The_Block_Organic_Beard_Oil',
    'Body_Linen_Spray',
    'Hair_Nail_Mask_for_long_hair_growth_and_healthy',
    'Honeysuckle_Face_Body_Oil_4oz',
    'Lip_Plumping_Oil',
    'Matte_Liquid_Lip_Stick_-_Muted_Red',
    'Natural_Bamboo_Wide_Tooth_Comb-Zero_Waste_Detangeling_Comb-With',
    'Organic_Finishing_Powder_Setting',
    'Organic_Gentle_Baby_Oil',
    'Super_Acne_Fighter_Organic_Acne_Treatment_Acne',
    'Treatments_-_TC02_-_Body_oil_-_Ceylon_-_150_ml',
    'Treatments_-_TC05_-_Ultra_rich_sheabutter_-_Ceylon_-_300_gram',
    'Treatments_-_TC07_-_Bed_body_mist_-_Ceylon_-_150_ml',
    'Treatments_-_TC11_-_Fragrance_sticks_-_Ceylon_-_150_ml'
  ],
  
  'collectibles': [
    'Charles-Hubert_Paris_3904-W_Polished_Finish_Stainless_Steel_Double_Cov',
    'Charles-Hubert-_Paris_Brass_Mechanical_Hunter_Case_Pocket_Watch_3804',
    'Charles-Hubert-_Paris_Dual_Time_Mechanical_Pocket_Watch',
    '1hr_Pinball_Box',
    'Murano_Hand_Blown_Glass_Giraffe',
    'Pacific_Drums',
    'Purple_Black_Immortal_Rose_-_Handmade_Recycled_Metal',
    'Simcity_4_Deluxe_Edition_PC',
    'Sophia-Swarovski' // Appears to be a collectible/jewelry item
  ],
  
  'crystals-metaphysical': [
    'Dali_Rainbow_Jasper_Points',
    'Green_Aventurine_Stretch_Nugget' // Crystal/stone
  ],
  
  'home-decor': [
    'Premium_Pillow_-_Enchanted_Forest',
    'Plasma_Ball',
    'PARIS', // Likely a decorative item
    'The_Labz_Easter_Island_4th_of_July_Picnic_on_Canvas_8_x_10',
    'Zoey_Holographic_Stickers_Now_in_3_sizes',
    'Zoey_in_the_Laundry_Jigsaw_Puzzle'
  ],
  
  'pet-products': [
    'Pet_Feeding_Mats_-_Smiley'
  ],
  
  'kitchen-dining': [
    'Wooden_Coconut_Spoon',
    'Lemon_Poppyseed' // Appears to be food item
  ],
  
  'apparel-accessories': [
    'Yoga_Leggings',
    'Zoey_in_the_Laundry_Beanies',
    'The_White_Quill_Hardcover_JournalBook',
    'TVM_Hardcover_Bound_Notebook',
    'TVMs_First_Hardcover_Bound_JournalBook'
  ],
  
  'candles-incense': [
    'Dolce_Vita_Pomme_damour' // Likely a scented product
  ]
};

async function categorizeRemainingProducts(dryRun = true) {
  console.log(`\n🎯 Categorizing remaining 50 products (${dryRun ? 'DRY RUN' : 'EXECUTING'})...\n`);
  
  const uncategorizedPath = path.join(projectRoot, 'assets/Uncategorized');
  const productsPath = path.join(projectRoot, 'organized-inventory/02-inventory/products');
  
  let totalMoved = 0;
  let errors = 0;
  
  try {
    for (const [category, products] of Object.entries(manualCategorization)) {
      console.log(`\n📦 ${category} (${products.length} products):`);
      
      for (const product of products) {
        const sourcePath = path.join(uncategorizedPath, product);
        const targetDir = path.join(productsPath, category);
        const targetPath = path.join(targetDir, product);
        
        try {
          // Check if source exists
          await fs.access(sourcePath);
          
          if (!dryRun) {
            await fs.mkdir(targetDir, { recursive: true });
            await fs.rename(sourcePath, targetPath);
          }
          
          console.log(`  ✓ ${product}`);
          totalMoved++;
        } catch (error) {
          console.log(`  ✗ ${product} - ${error.message}`);
          errors++;
        }
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`- Products to move: ${totalMoved}`);
    console.log(`- Errors: ${errors}`);
    
    if (dryRun) {
      console.log(`\n⚠️  This was a DRY RUN - no products were moved`);
      console.log(`To execute, run: node scripts/utilities/categorize-remaining-products.js --execute`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the categorization
const isDryRun = !process.argv.includes('--execute');
await categorizeRemainingProducts(isDryRun);
