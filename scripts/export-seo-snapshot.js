import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function exportSEOSnapshot() {
  try {
    // Read current active items
    const activeItemsPath = path.join(__dirname, '../data/active-items.json');
    const data = await fs.readFile(activeItemsPath, 'utf8');
    const activeItems = JSON.parse(data);

    // Create SEO snapshot
    const timestamp = new Date().toISOString();
    const snapshot = {
      exportDate: timestamp,
      version: "1.0.0",
      totalItems: activeItems.items.length,
      seoEnabledItems: activeItems.items.filter(item => item.seo).length,
      summary: {
        visible: activeItems.items.filter(item => item.ecomVisibility === 'VISIBLE').length,
        hidden: activeItems.items.filter(item => item.ecomVisibility === 'HIDDEN').length,
        unavailable: activeItems.items.filter(item => item.ecomVisibility === 'UNAVAILABLE').length,
        unindexed: activeItems.items.filter(item => item.ecomVisibility === 'UNINDEXED').length
      },
      seoData: activeItems.items
        .filter(item => item.seo)
        .map(item => ({
          id: item.id,
          name: item.name,
          ecomVisibility: item.ecomVisibility,
          seo: {
            title: item.seo.title,
            description: item.seo.description,
            permalink: item.seo.permalink,
            keywords: item.seo.keywords
          },
          lastUpdated: timestamp
        }))
    };

    // Write snapshot
    const snapshotPath = path.join(__dirname, '../data/seo-snapshots', `seo-snapshot-${timestamp.split('T')[0]}.json`);
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));

    // Also write latest snapshot for easy access
    const latestPath = path.join(__dirname, '../data/seo-snapshot-latest.json');
    await fs.writeFile(latestPath, JSON.stringify(snapshot, null, 2));

    console.log('✅ SEO snapshot exported successfully');
    console.log(`📊 Summary:`);
    console.log(`   • Total items: ${snapshot.totalItems}`);
    console.log(`   • SEO-enabled: ${snapshot.seoEnabledItems}`);
    console.log(`   • Visible: ${snapshot.summary.visible}`);
    console.log(`   • Hidden: ${snapshot.summary.hidden}`);
    console.log(`📁 Files created:`);
    console.log(`   • ${snapshotPath}`);
    console.log(`   • ${latestPath}`);

    return snapshot;

  } catch (error) {
    console.error('❌ Error creating SEO snapshot:', error.message);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exportSEOSnapshot();
}

export { exportSEOSnapshot };
