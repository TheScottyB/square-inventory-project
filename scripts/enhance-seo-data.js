import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function enhanceSEOData() {
  try {
    // Read current active items
    const activeItemsPath = path.join(__dirname, '../data/active-items.json');
    const data = await fs.readFile(activeItemsPath, 'utf8');
    const activeItems = JSON.parse(data);

    // Enhance items with SEO data structure
    const enhancedItems = {
      ...activeItems,
      items: activeItems.items.map(item => {
        // Only add SEO structure for ecom-available items
        if (item.ecomAvailable && item.ecomVisibility === 'VISIBLE') {
          return {
            ...item,
            seo: {
              title: generateSEOTitle(item.name),
              description: generateSEODescription(item.name),
              permalink: generatePermalink(item.name),
              keywords: generateKeywords(item.name)
            }
          };
        }
        return item;
      })
    };

    // Write enhanced data back
    await fs.writeFile(activeItemsPath, JSON.stringify(enhancedItems, null, 2));
    console.log('✅ Enhanced active-items.json with SEO data structure');
    
    // Show summary
    const seoEnabledItems = enhancedItems.items.filter(item => item.seo);
    console.log(`📊 SEO data added to ${seoEnabledItems.length} items`);
    
    seoEnabledItems.forEach(item => {
      console.log(`   • ${item.name} (${item.id})`);
    });

  } catch (error) {
    console.error('❌ Error enhancing SEO data:', error.message);
  }
}

function generateSEOTitle(name) {
  // Create SEO-optimized title from product name
  const cleanName = name.replace(/[^\w\s]/gi, '').trim();
  return `${cleanName} | Premium Quality Products | Your Store Name`;
}

function generateSEODescription(name) {
  // Create SEO-optimized description
  const cleanName = name.replace(/[^\w\s]/gi, '').trim();
  return `Shop ${cleanName} with premium quality and fast shipping. Discover our curated collection of unique products. Order now for the best deals and customer service.`;
}

function generatePermalink(name) {
  // Create URL-friendly permalink
  return name
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateKeywords(name) {
  // Extract keywords from product name
  const words = name.toLowerCase().split(/\s+/);
  const keywords = words
    .filter(word => word.length > 2)
    .filter(word => !['the', 'and', 'for', 'with', 'from'].includes(word))
    .slice(0, 5);
  
  return keywords.join(', ');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  enhanceSEOData();
}

export { enhanceSEOData };
