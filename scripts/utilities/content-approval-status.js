#!/usr/bin/env node

import { ContentApprovalAgent } from '../../src/agents/content/ContentApprovalAgent.js';
import XLSX from 'xlsx';
import path from 'path';

/**
 * Content Approval Status Overview
 * 
 * Shows comprehensive status of content approval across the catalog
 */

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔐 Content Approval Status

USAGE:
  pnpm run content:status [catalog-file] [options]

OPTIONS:
  --catalog <file>        Catalog file to check (default: latest processed)
  --detailed             Show detailed status for each item
  --pending-only         Show only items pending review
  --approved-only        Show only approved items
  --summary              Show summary statistics only

EXAMPLES:
  pnpm run content:status                    # Overall status
  pnpm run content:status --detailed         # Detailed item-by-item status
  pnpm run content:status --pending-only     # Items needing review
  pnpm run content:status --summary          # Just the numbers
`);
    return;
  }
  
  try {
    console.log('🔐 Content Approval Status Overview');
    console.log('=' .repeat(50));
    
    const contentApprovalAgent = new ContentApprovalAgent({
      contentRepository: './content-repository'
    });
    
    // Get catalog file
    const catalogFile = args.find(arg => arg.endsWith('.xlsx')) || 
      '/Users/scottybe/Development/tools/Workspace/square-inventory-project/exports/processed-catalog/processed-catalog-2025-08-03T18-32-59-886Z.xlsx';
    
    if (!catalogFile) {
      console.log('⚠️  No catalog file specified. Showing repository status only.');
      await showRepositoryStatus(contentApprovalAgent);
      return;
    }
    
    console.log(`📁 Catalog: ${path.basename(catalogFile)}`);
    console.log('');
    
    // Load catalog data
    const workbook = XLSX.readFile(catalogFile);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const catalogData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    const items = catalogData.slice(1); // Skip header
    const skus = items.map(row => row[4] || row[2]?.replace(/[^a-zA-Z0-9]/g, '-')).filter(Boolean);
    
    console.log(`📊 Checking approval status for ${skus.length} items...`);
    console.log('');
    
    // Check approval status for all items
    const { results, summary } = await contentApprovalAgent.batchCheckApproval(skus);
    
    // Show summary
    console.log('📈 APPROVAL SUMMARY:');
    console.log(`   ✅ Approved (in git):     ${summary.approved.toString().padStart(3)} items`);
    console.log(`   🔄 Needs commit:          ${summary.needsCommit.toString().padStart(3)} items`);
    console.log(`   ⏳ Pending review:        ${summary.pending.toString().padStart(3)} items`);
    console.log(`   ❌ Rejected/needs work:   ${summary.rejected.toString().padStart(3)} items`);
    console.log(`   🆕 Not found (new):       ${summary.notFound.toString().padStart(3)} items`);
    console.log(`   📊 Total:                 ${summary.total.toString().padStart(3)} items`);
    console.log('');
    
    const approvalRate = ((summary.approved / summary.total) * 100).toFixed(1);
    const readyRate = (((summary.approved + summary.needsCommit) / summary.total) * 100).toFixed(1);
    
    console.log(`🎯 APPROVAL METRICS:`);
    console.log(`   • Production Ready Rate: ${approvalRate}% (${summary.approved}/${summary.total})`);
    console.log(`   • Content Ready Rate:    ${readyRate}% (${summary.approved + summary.needsCommit}/${summary.total})`);
    console.log(`   • Review Backlog:        ${summary.pending} items`);
    console.log(`   • Generation Needed:     ${summary.notFound} items`);
    console.log('');
    
    // Show detailed status if requested
    if (args.includes('--detailed')) {
      console.log('📋 DETAILED STATUS:');
      console.log('');
      
      if (results.approved.length > 0 && !args.includes('--pending-only')) {
        console.log('✅ APPROVED CONTENT:');
        results.approved.forEach(item => {
          console.log(`   ${item.sku} - Ready for production`);
        });
        console.log('');
      }
      
      if (results.needsCommit.length > 0 && !args.includes('--pending-only')) {
        console.log('🔄 NEEDS GIT COMMIT:');
        results.needsCommit.forEach(item => {
          console.log(`   ${item.sku} - Approved but not committed`);
        });
        console.log('');
      }
      
      if (results.pending.length > 0 && !args.includes('--approved-only')) {
        console.log('⏳ PENDING REVIEW:');
        results.pending.forEach(item => {
          console.log(`   ${item.sku} - Awaiting review and approval`);
        });
        console.log('');
      }
      
      if (results.rejected.length > 0) {
        console.log('❌ REJECTED/NEEDS REVISION:');
        results.rejected.forEach(item => {
          console.log(`   ${item.sku} - Needs improvement`);
        });
        console.log('');
      }
      
      if (results.notFound.length > 0 && !args.includes('--approved-only') && !args.includes('--pending-only')) {
        console.log('🆕 NOT FOUND (NEEDS GENERATION):');
        results.notFound.slice(0, 10).forEach(item => {
          console.log(`   ${item.sku} - No content exists`);
        });
        if (results.notFound.length > 10) {
          console.log(`   ... and ${results.notFound.length - 10} more`);
        }
        console.log('');
      }
    }
    
    // Show next steps
    if (!args.includes('--summary')) {
      console.log('🎯 RECOMMENDED ACTIONS:');
      
      if (summary.notFound > 0) {
        console.log(`   1. Generate content: pnpm run enhance:individualized`);
      }
      
      if (summary.pending > 0) {
        console.log(`   2. Review pending content: pnpm run content:list-pending`);
        console.log(`   3. Approve quality content: pnpm run content:approve <sku>`);
      }
      
      if (summary.needsCommit > 0) {
        console.log(`   4. Commit approved content: pnpm run content:commit-approved`);
      }
      
      if (summary.rejected > 0) {
        console.log(`   5. Address rejected content feedback`);
      }
      
      console.log('');
    }
    
    // Repository status
    await showRepositoryStatus(contentApprovalAgent);
    
  } catch (error) {
    console.error('❌ Status check failed:');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

async function showRepositoryStatus(contentApprovalAgent) {
  try {
    console.log('📂 REPOSITORY STATUS:');
    
    const pendingItems = await contentApprovalAgent.listPendingReview();
    console.log(`   • Pending review files: ${pendingItems.length}`);
    
    if (pendingItems.length > 0) {
      console.log('   • Most recent:');
      pendingItems.slice(0, 3).forEach(item => {
        const timeAgo = Math.round((Date.now() - item.lastModified) / (1000 * 60));
        console.log(`     - ${item.sku} (${timeAgo}m ago)`);
      });
    }
    
    console.log('');
  } catch (error) {
    console.log(`   ⚠️  Could not read repository status: ${error.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}