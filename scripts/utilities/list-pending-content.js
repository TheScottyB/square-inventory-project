#!/usr/bin/env node

import { ContentApprovalAgent } from '../../src/agents/content/ContentApprovalAgent.js';
import fs from 'fs-extra';

/**
 * List Pending Content for Review
 * 
 * Shows all content awaiting review and approval
 */

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
⏳ List Pending Content for Review

USAGE:
  pnpm run content:list-pending [options]

OPTIONS:
  --detailed             Show content preview for each item
  --sort-by-date        Sort by modification date (default)
  --sort-by-size        Sort by file size
  --limit <n>           Show only first N items (default: all)

EXAMPLES:
  pnpm run content:list-pending                    # List all pending items
  pnpm run content:list-pending --detailed         # Show content previews
  pnpm run content:list-pending --limit 10         # Show first 10 items
`);
    return;
  }
  
  try {
    console.log('⏳ Content Pending Review');
    console.log('=' .repeat(40));
    
    const contentApprovalAgent = new ContentApprovalAgent({
      contentRepository: './content-repository'
    });
    
    const pendingItems = await contentApprovalAgent.listPendingReview();
    
    if (pendingItems.length === 0) {
      console.log('🎉 No content pending review!');
      console.log('');
      console.log('All content is either approved or needs generation.');
      console.log('Run `pnpm run content:status` for full overview.');
      return;
    }
    
    // Sort options
    if (args.includes('--sort-by-size')) {
      pendingItems.sort((a, b) => b.size - a.size);
    }
    // Default: sort by date (already done in listPendingReview)
    
    // Limit results
    const limit = parseInt(args.find(arg => arg.startsWith('--limit'))?.split('=')[1]) || 
                  parseInt(args[args.indexOf('--limit') + 1]) || 
                  pendingItems.length;
    
    const itemsToShow = pendingItems.slice(0, limit);
    
    console.log(`📋 Found ${pendingItems.length} items pending review`);
    if (limit < pendingItems.length) {
      console.log(`📄 Showing first ${limit} items`);
    }
    console.log('');
    
    // Show items
    for (const [index, item] of itemsToShow.entries()) {
      const timeAgo = getTimeAgo(item.lastModified);
      const sizeKB = Math.round(item.size / 1024);
      
      console.log(`${(index + 1).toString().padStart(2)}. ${item.sku}`);
      console.log(`    📁 ${item.filePath}`);
      console.log(`    ⏰ Modified: ${timeAgo} ago`);
      console.log(`    📊 Size: ${sizeKB}KB`);
      
      if (args.includes('--detailed')) {
        try {
          const content = await fs.readFile(item.filePath, 'utf8');
          const preview = extractContentPreview(content);
          console.log(`    📝 Preview:`);
          console.log(`       ${preview}`);
        } catch (error) {
          console.log(`    ⚠️  Could not read content: ${error.message}`);
        }
      }
      
      console.log('');
    }
    
    // Show summary and actions
    console.log('🎯 REVIEW ACTIONS:');
    console.log('');
    console.log('📖 Review specific item:');
    console.log('   pnpm run content:review <sku>');
    console.log('');
    console.log('✅ Approve good content:');
    console.log('   pnpm run content:approve <sku>');
    console.log('');
    console.log('📝 Request changes:');
    console.log('   pnpm run content:request-changes <sku> "feedback message"');
    console.log('');
    
    // Show priority recommendations
    if (pendingItems.length > 5) {
      console.log('🔥 PRIORITY RECOMMENDATIONS:');
      console.log('');
      
      // Recent items (last 24 hours)
      const recent = pendingItems.filter(item => 
        Date.now() - item.lastModified < 24 * 60 * 60 * 1000
      );
      
      if (recent.length > 0) {
        console.log(`📅 ${recent.length} items generated in last 24 hours - review first`);
      }
      
      // Large items (likely more complex)
      const large = pendingItems.filter(item => item.size > 5000);
      if (large.length > 0) {
        console.log(`📄 ${large.length} large items (>5KB) may need extra attention`);
      }
      
      console.log('');
    }
    
    console.log('💡 TIP: Use --detailed flag to see content previews');
    
  } catch (error) {
    console.error('❌ Failed to list pending content:');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

function getTimeAgo(timestamp) {
  const minutes = Math.floor((Date.now() - timestamp) / (1000 * 60));
  
  if (minutes < 60) return `${minutes}m`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function extractContentPreview(content) {
  // Extract primary description from markdown
  const lines = content.split('\n');
  let inDescription = false;
  let descriptionLines = [];
  
  for (const line of lines) {
    if (line.trim() === '## Primary Description') {
      inDescription = true;
      continue;
    }
    
    if (inDescription) {
      if (line.startsWith('##')) break; // Next section
      if (line.trim()) {
        descriptionLines.push(line.trim());
      }
    }
  }
  
  const description = descriptionLines.join(' ');
  
  // Return first 100 characters
  if (description.length > 100) {
    return description.substring(0, 97) + '...';
  }
  
  return description || 'No description preview available';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}