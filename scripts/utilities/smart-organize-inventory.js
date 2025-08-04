#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

// Define file organization rules
const organizationRules = {
  // Configuration files
  config: {
    patterns: [/^\..*rc.*$/, /^env\./, /\.config\./i, /AuthKey.*\.p8$/],
    targetDir: 'organized-inventory/01-config'
  },
  
  // Import/Export templates
  imports: {
    patterns: [/import.*\.xlsx?$/i, /upload.*\.xlsx?$/i, /_import\.xlsx?$/i, /import-template/i],
    targetDir: 'organized-inventory/02-inventory/imports'
  },
  
  exports: {
    patterns: [/catalog-\d{4}-\d{2}-\d{2}/i, /export/i, /_catalog_/i, /inventory-history/i],
    targetDir: 'organized-inventory/02-inventory/exports'
  },
  
  // Business documents
  documents: {
    patterns: [/\.pdf$/i, /\.doc$/i, /\.docx$/i, /statement/i, /invoice/i],
    targetDir: 'organized-inventory/02-inventory/documents'
  },
  
  // Project documentation
  projectDocs: {
    patterns: [/README/i, /\.md$/i, /SECURITY/i, /ENHANCEMENT/i, /SCRIPT_AUDIT/i],
    targetDir: 'organized-inventory/03-project-files/documentation'
  },
  
  // Scripts and automation
  scripts: {
    patterns: [/\.py$/i, /\.js$/i, /\.sh$/i, /validate_/, /normalize_/],
    targetDir: 'organized-inventory/03-project-files/scripts'
  },
  
  // Product images
  productImages: {
    patterns: [/\.(jpg|jpeg|png|gif|svg)$/i],
    targetDir: 'organized-inventory/02-inventory/products/_unsorted-images'
  },
  
  // Archives
  archives: {
    patterns: [/\.zip$/i, /\.rar$/i, /\.7z$/i],
    targetDir: 'organized-inventory/04-archives'
  },
  
  // Data files
  dataFiles: {
    patterns: [/\.csv$/i, /\.json$/i, /labels\./i, /spocket-scraped/i],
    targetDir: 'organized-inventory/03-project-files/data'
  }
};

// Product categorization rules
const productCategories = {
  'jewelry': [
    /bracelet/i, /necklace/i, /earring/i, /anklet/i, /pendant/i, /chain/i,
    /amethyst.*bracelet/i, /crystal.*bracelet/i, /chakra.*bracelet/i
  ],
  'candles-incense': [
    /candle/i, /incense/i, /sage/i, /palo.*santo/i, /smudge/i, /diffuser/i,
    /essential.*oil/i, /aromatherapy/i, /burner/i
  ],
  'crystals-metaphysical': [
    /crystal/i, /selenite/i, /amethyst/i, /quartz/i, /tourmaline/i, /chakra/i,
    /singing.*bowl/i, /meditation/i, /reiki/i, /metaphysical/i, /healing/i
  ],
  'beauty-personal-care': [
    /serum/i, /moisturizer/i, /cleanser/i, /toner/i, /lip.*gloss/i, /eye.*liner/i,
    /cream/i, /lotion/i, /soap/i, /bath.*bomb/i, /facial/i, /skin/i, /beauty/i,
    /makeup/i, /shimmer/i, /highlighter/i
  ],
  'tarot-oracle': [
    /tarot/i, /oracle/i, /deck/i, /cards/i, /divination/i
  ],
  'home-decor': [
    /lamp/i, /fountain/i, /vase/i, /holder/i, /plate/i, /bowl/i, /decor/i,
    /art/i, /frame/i, /poster/i, /print/i
  ],
  'apparel-accessories': [
    /shirt/i, /cap/i, /hat/i, /bag/i, /tote/i, /purse/i, /backpack/i,
    /shoes/i, /pants/i, /hoodie/i, /clothing/i, /apparel/i, /keychain/i
  ],
  'kitchen-dining': [
    /flatware/i, /silverware/i, /cutlery/i, /mug/i, /cup/i, /bottle/i,
    /wine.*glass/i, /kitchen/i, /dining/i
  ],
  'collectibles': [
    /vhs/i, /vintage/i, /collector/i, /vinyl/i, /cassette/i, /game/i,
    /metal.*rose/i, /sculpture/i, /figurine/i
  ]
};

async function organizeFiles(dryRun = true) {
  console.log(`\n🔍 Scanning for files to organize (${dryRun ? 'DRY RUN' : 'EXECUTING'})...\n`);
  
  const movedFiles = [];
  const errors = [];
  
  try {
    // Get all files in root directory
    const entries = await fs.readdir(projectRoot, { withFileTypes: true });
    const files = entries.filter(e => e.isFile()).map(e => e.name);
    
    console.log(`Found ${files.length} files in root directory\n`);
    
    // Process each file
    for (const file of files) {
      let moved = false;
      
      // Check against organization rules
      for (const [category, rule] of Object.entries(organizationRules)) {
        for (const pattern of rule.patterns) {
          if (pattern.test(file)) {
            const targetDir = path.join(projectRoot, rule.targetDir);
            const targetPath = path.join(targetDir, file);
            
            try {
              if (!dryRun) {
                await fs.mkdir(targetDir, { recursive: true });
                await fs.rename(
                  path.join(projectRoot, file),
                  targetPath
                );
              }
              
              console.log(`✓ [${category}] ${file} → ${rule.targetDir}/`);
              movedFiles.push({ file, category, targetDir: rule.targetDir });
              moved = true;
              break;
            } catch (error) {
              console.error(`✗ Error moving ${file}: ${error.message}`);
              errors.push({ file, error: error.message });
            }
          }
        }
        if (moved) break;
      }
      
      if (!moved && !file.startsWith('.')) {
        console.log(`? [uncategorized] ${file}`);
      }
    }
    
  } catch (error) {
    console.error('Error scanning directory:', error);
  }
  
  // Summary
  console.log(`\n📊 Summary:`);
  console.log(`- Files to move: ${movedFiles.length}`);
  console.log(`- Errors: ${errors.length}`);
  
  if (dryRun) {
    console.log(`\n⚠️  This was a DRY RUN - no files were moved`);
    console.log(`To execute, run: node scripts/utilities/smart-organize-inventory.js --execute`);
  }
  
  return { movedFiles, errors };
}

async function organizeProductFolders(dryRun = true) {
  console.log(`\n🗂️  Organizing product folders from Uncategorized...\n`);
  
  const uncategorizedPath = path.join(projectRoot, 'assets/Uncategorized');
  const productsPath = path.join(projectRoot, 'organized-inventory/02-inventory/products');
  
  try {
    const folders = await fs.readdir(uncategorizedPath, { withFileTypes: true });
    const productFolders = folders.filter(f => f.isDirectory()).map(f => f.name);
    
    console.log(`Found ${productFolders.length} product folders to categorize\n`);
    
    const categorized = {};
    const uncategorized = [];
    
    // Categorize each product folder
    for (const folder of productFolders) {
      let found = false;
      
      for (const [category, patterns] of Object.entries(productCategories)) {
        for (const pattern of patterns) {
          if (pattern.test(folder)) {
            if (!categorized[category]) {
              categorized[category] = [];
            }
            categorized[category].push(folder);
            found = true;
            break;
          }
        }
        if (found) break;
      }
      
      if (!found) {
        uncategorized.push(folder);
      }
    }
    
    // Show categorization results
    console.log('📦 Product Categorization:\n');
    for (const [category, folders] of Object.entries(categorized)) {
      console.log(`${category}: ${folders.length} products`);
      
      if (!dryRun) {
        const targetDir = path.join(productsPath, category);
        await fs.mkdir(targetDir, { recursive: true });
        
        for (const folder of folders) {
          try {
            await fs.rename(
              path.join(uncategorizedPath, folder),
              path.join(targetDir, folder)
            );
          } catch (error) {
            console.error(`Error moving ${folder}: ${error.message}`);
          }
        }
      }
    }
    
    if (uncategorized.length > 0) {
      console.log(`\n⚠️  Uncategorized products: ${uncategorized.length}`);
      console.log('Consider adding patterns for:', uncategorized.slice(0, 10).join(', '));
    }
    
  } catch (error) {
    console.error('Error organizing products:', error);
  }
}

// Main execution
const isDryRun = !process.argv.includes('--execute');

console.log('🚀 Smart Inventory Organization Tool\n');

// First organize loose files
await organizeFiles(isDryRun);

// Then organize product folders
await organizeProductFolders(isDryRun);

console.log('\n✅ Organization complete!');
