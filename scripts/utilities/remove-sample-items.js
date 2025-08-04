#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import xlsx from 'xlsx';
import chalk from 'chalk';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

async function removeSampleItems() {
  console.log(chalk.bold.cyan('\n🧹 Removing Sample/Test Items from Catalog\n'));
  
  // Load the most recent catalog
  const catalogPath = join(projectRoot, 'exports/7MM9AFJAD0XHW_catalog-2025-08-03-1627.xlsx');
  
  console.log(chalk.yellow('Loading catalog...'));
  const workbook = xlsx.readFile(catalogPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const catalogData = xlsx.utils.sheet_to_json(worksheet, { 
    header: 1,
    defval: '',
    blankrows: false 
  });
  
  const headers = catalogData[0];
  const itemNameIndex = headers.indexOf('Item Name');
  const skuIndex = headers.indexOf('SKU');
  const categoryIndex = headers.indexOf('Categories');
  
  // Define patterns for sample/test items
  const samplePatterns = [
    /^sample\s+product/i,
    /^test\s+/i,
    /field\s+service/i,
    /site\s+visit/i,
    /service\s+charge/i,
    /^labor$/i,
    /followup.*evalution/i,  // Note the typo in the data
    /^sample\s/i,
    /\btest\b.*\b(item|product)\b/i
  ];
  
  // Also check SKU patterns that indicate test items
  const testSkuPatterns = [
    /^TEST-/i,
    /^SAMPLE-/i,
    /-TEST-/i,
    /^MIS-SAMPLE-/i
  ];
  
  // Filter out sample/test items
  const originalCount = catalogData.length - 1; // Exclude header
  const removedItems = [];
  
  const filteredData = [headers]; // Start with headers
  
  for (let i = 1; i < catalogData.length; i++) {
    const row = catalogData[i];
    const itemName = row[itemNameIndex] || '';
    const sku = row[skuIndex] || '';
    
    // Check if this is a sample/test item
    const isSample = samplePatterns.some(pattern => pattern.test(itemName)) ||
                     testSkuPatterns.some(pattern => pattern.test(sku));
    
    if (isSample) {
      removedItems.push({
        itemName,
        sku,
        category: row[categoryIndex] || 'N/A'
      });
    } else {
      filteredData.push(row);
    }
  }
  
  const newCount = filteredData.length - 1; // Exclude header
  
  console.log(chalk.green(`\n✅ Filtering Complete:`));
  console.log(chalk.white(`  Original items: ${originalCount}`));
  console.log(chalk.red(`  Removed items: ${removedItems.length}`));
  console.log(chalk.green(`  Remaining items: ${newCount}`));
  
  if (removedItems.length > 0) {
    console.log(chalk.yellow('\n📋 Removed Items:'));
    removedItems.forEach((item, index) => {
      console.log(chalk.gray(`  ${index + 1}. ${item.itemName} (SKU: ${item.sku || 'N/A'})`));
    });
  }
  
  // Save the filtered catalog
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputPath = join(projectRoot, 'exports', `catalog-filtered-${timestamp}.xlsx`);
  
  // Create new workbook
  const newWorkbook = xlsx.utils.book_new();
  const newWorksheet = xlsx.utils.aoa_to_sheet(filteredData);
  xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, 'Filtered Catalog');
  
  // Write file
  xlsx.writeFile(newWorkbook, outputPath);
  
  console.log(chalk.green(`\n✅ Filtered catalog saved to:`));
  console.log(chalk.cyan(`   ${outputPath}`));
  
  // Also save a report of removed items
  const reportPath = join(projectRoot, 'reports', `removed-items-${Date.now()}.json`);
  await fs.mkdir(join(projectRoot, 'reports'), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    originalCount,
    removedCount: removedItems.length,
    finalCount: newCount,
    removedItems
  }, null, 2));
  
  console.log(chalk.gray(`\n📄 Report saved to: ${reportPath}`));
  
  return outputPath;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  removeSampleItems().catch(console.error);
}

export { removeSampleItems };