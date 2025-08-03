#!/usr/bin/env node

import { ContentApprovalAgent } from '../../src/agents/content/ContentApprovalAgent.js';

/**
 * Check Content Approval Status
 * 
 * Quick check of approval status for specific items
 */

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔍 Check Content Approval Status

USAGE:
  pnpm run content:check-approval-status [sku...] [options]

ARGUMENTS:
  [sku...]               One or more SKUs to check (optional)

OPTIONS:
  --all                  Check all available content
  --git-status          Show detailed git status
  --uncommitted-only    Show only approved but uncommitted content

EXAMPLES:
  pnpm run content:check-approval-status RRV-RR-001                    # Check specific SKU
  pnpm run content:check-approval-status RRV-RR-001 RRV-MC-001        # Check multiple SKUs
  pnpm run content:check-approval-status --uncommitted-only           # Show items needing commit
  pnpm run content:check-approval-status --all                        # Check everything

APPROVAL STATUS CODES:
  ✅ approved              - Content is approved and committed to git (production ready)
  🔄 approved-uncommitted  - Content is approved but not yet committed to git
  ⏳ pending-review        - Content exists but needs review and approval
  ❌ rejected              - Content was rejected and needs revision
  🆕 not-found             - No content exists for this SKU
`);
    return;
  }
  
  try {
    console.log('🔍 Content Approval Status Check');
    console.log('=' .repeat(40));
    
    const contentApprovalAgent = new ContentApprovalAgent({
      contentRepository: './content-repository'
    });
    
    // Determine what to check
    let skusToCheck = args.filter(arg => !arg.startsWith('--'));
    
    if (args.includes('--all') || skusToCheck.length === 0) {
      // Get all available content files
      const pendingItems = await contentApprovalAgent.listPendingReview();
      skusToCheck = pendingItems.map(item => item.sku);
      
      if (skusToCheck.length === 0) {
        console.log('📝 No content files found in repository');
        console.log('💡 Generate content first: pnpm run enhance:individualized');
        return;
      }
      
      console.log(`📋 Checking ${skusToCheck.length} items found in repository`);
    } else {
      console.log(`📋 Checking ${skusToCheck.length} specified items`);
    }
    
    console.log('');
    
    // Check each item
    const results = [];
    
    for (const sku of skusToCheck) {
      try {
        const status = await contentApprovalAgent.checkContentApproval(sku);
        results.push({ sku, status, success: true });
      } catch (error) {
        results.push({ sku, error: error.message, success: false });
      }
    }
    
    // Group results by status
    const grouped = {
      approved: [],
      'approved-uncommitted': [],
      'pending-review': [],
      rejected: [],
      'not-found': [],
      errors: []
    };
    
    results.forEach(result => {
      if (!result.success) {
        grouped.errors.push(result);
      } else {
        const statusKey = result.status.status;
        if (grouped[statusKey]) {
          grouped[statusKey].push(result);
        }
      }
    });
    
    // Display results
    displayStatusGroup('✅ APPROVED (Production Ready)', grouped.approved, args);
    displayStatusGroup('🔄 APPROVED BUT NOT COMMITTED', grouped['approved-uncommitted'], args);
    
    if (!args.includes('--uncommitted-only')) {
      displayStatusGroup('⏳ PENDING REVIEW', grouped['pending-review'], args);
      displayStatusGroup('❌ REJECTED (Needs Revision)', grouped.rejected, args);
      displayStatusGroup('🆕 NOT FOUND (Needs Generation)', grouped['not-found'], args);
    }
    
    if (grouped.errors.length > 0) {
      displayStatusGroup('💥 ERRORS', grouped.errors, args);
    }
    
    // Show summary
    console.log('📊 SUMMARY:');
    console.log(`   ✅ Production ready:     ${grouped.approved.length}`);
    console.log(`   🔄 Needs git commit:     ${grouped['approved-uncommitted'].length}`);
    console.log(`   ⏳ Pending review:       ${grouped['pending-review'].length}`);
    console.log(`   ❌ Rejected:             ${grouped.rejected.length}`);
    console.log(`   🆕 Not found:            ${grouped['not-found'].length}`);
    console.log(`   💥 Errors:               ${grouped.errors.length}`);
    console.log(`   📊 Total checked:        ${results.length}`);
    console.log('');
    
    // Show action recommendations
    const needsCommit = grouped['approved-uncommitted'].length;
    const needsReview = grouped['pending-review'].length;
    const needsGeneration = grouped['not-found'].length;
    
    if (needsCommit > 0 || needsReview > 0 || needsGeneration > 0) {
      console.log('🎯 RECOMMENDED ACTIONS:');
      
      if (needsCommit > 0) {
        console.log(`   📦 Commit ${needsCommit} approved items: pnpm run content:commit-approved`);
      }
      
      if (needsReview > 0) {
        console.log(`   👁️  Review ${needsReview} pending items: pnpm run content:list-pending`);
      }
      
      if (needsGeneration > 0) {
        console.log(`   🎨 Generate ${needsGeneration} missing items: pnpm run enhance:individualized`);
      }
      
      console.log('');
    } else if (grouped.approved.length > 0) {
      console.log('🎉 All content is approved and ready for production!');
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Approval status check failed:');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

function displayStatusGroup(title, items, args) {
  if (items.length === 0) return;
  
  console.log(title);
  
  items.forEach((item, index) => {
    const prefix = `   ${(index + 1).toString().padStart(2)}.`;
    
    if (item.success) {
      console.log(`${prefix} ${item.sku}`);
      
      if (args.includes('--git-status') && item.status.gitInfo) {
        const gitInfo = item.status.gitInfo;
        console.log(`       Git: ${gitInfo.committed ? 'committed' : 'not committed'}${gitInfo.reason ? ` (${gitInfo.reason})` : ''}`);
      }
      
      if (item.status.filePath) {
        const fileName = item.status.filePath.split('/').pop();
        console.log(`       File: ${fileName}`);
      }
      
      if (item.status.lastModified) {
        const timeAgo = Math.round((Date.now() - new Date(item.status.lastModified)) / (1000 * 60));
        console.log(`       Modified: ${timeAgo}m ago`);
      }
    } else {
      console.log(`${prefix} ${item.sku} - ERROR: ${item.error}`);
    }
  });
  
  console.log('');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}