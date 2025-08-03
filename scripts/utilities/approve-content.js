#!/usr/bin/env node

import { ContentApprovalAgent } from '../../src/agents/content/ContentApprovalAgent.js';

/**
 * Approve Content for Production Use
 * 
 * Moves content from pending-review to approved directory
 */

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
✅ Approve Content for Production

USAGE:
  pnpm run content:approve <sku> [options]

ARGUMENTS:
  <sku>                  Product SKU to approve

OPTIONS:
  --reviewer <name>      Reviewer name (default: system)
  --quality-score <n>    Quality score 1-100 (default: not specified)
  --notes <text>         Approval notes

EXAMPLES:
  pnpm run content:approve RRV-RR-001
  pnpm run content:approve RRV-MC-001 --reviewer "jane-doe" --quality-score 95
  pnpm run content:approve RRV-EX-002 --notes "Excellent cultural authenticity"

APPROVAL PROCESS:
  1. Validates content exists in pending-review/
  2. Adds approval metadata and timestamp
  3. Moves content to approved/ directory
  4. Content is now ready for git commit
`);
    return;
  }
  
  const sku = args[0];
  if (!sku) {
    console.error('❌ Error: SKU is required');
    console.error('Usage: pnpm run content:approve <sku>');
    process.exit(1);
  }
  
  try {
    console.log(`✅ Approving Content: ${sku}`);
    console.log('=' .repeat(40));
    
    const contentApprovalAgent = new ContentApprovalAgent({
      contentRepository: './content-repository',
      enableDryRun: args.includes('--dry-run')
    });
    
    // Parse options
    const reviewerIndex = args.indexOf('--reviewer');
    const reviewer = reviewerIndex >= 0 ? args[reviewerIndex + 1] : undefined;
    
    const qualityIndex = args.indexOf('--quality-score');
    const qualityScore = qualityIndex >= 0 ? parseInt(args[qualityIndex + 1]) : undefined;
    
    const notesIndex = args.indexOf('--notes');
    const notes = notesIndex >= 0 ? args[notesIndex + 1] : undefined;
    
    const reviewData = {
      reviewer,
      qualityScore,
      notes,
      approvedAt: new Date().toISOString()
    };
    
    // Check current status
    console.log('🔍 Checking current approval status...');
    const currentStatus = await contentApprovalAgent.checkContentApproval(sku);
    
    if (currentStatus.status === 'approved') {
      console.log('ℹ️  Content is already approved and ready for production');
      if (currentStatus.needsCommit) {
        console.log('💡 Content needs to be committed to git:');
        console.log(`   git add ${currentStatus.filePath}`);
        console.log(`   git commit -m "feat: approve content for ${sku}"`);
      } else {
        console.log('✅ Content is fully approved and committed');
      }
      return;
    }
    
    if (currentStatus.status === 'not-found') {
      console.error(`❌ No content found for ${sku}`);
      console.error('💡 Generate content first: pnpm run enhance:individualized');
      process.exit(1);
    }
    
    if (currentStatus.status === 'rejected') {
      console.log('⚠️  Content was previously rejected');
      console.log('🔄 Proceeding with approval (this will override rejection)');
    }
    
    console.log(`📋 Current status: ${currentStatus.status}`);
    console.log(`📁 File: ${currentStatus.filePath}`);
    console.log('');
    
    // Approve content
    console.log('✅ Approving content...');
    const approvalResult = await contentApprovalAgent.approveContent(sku, reviewData);
    
    console.log('🎉 Content approved successfully!');
    console.log('');
    console.log('📊 APPROVAL DETAILS:');
    console.log(`   • SKU: ${approvalResult.sku}`);
    console.log(`   • Status: ${approvalResult.status}`);
    console.log(`   • File: ${approvalResult.filePath}`);
    if (reviewer) console.log(`   • Reviewer: ${reviewer}`);
    if (qualityScore) console.log(`   • Quality Score: ${qualityScore}%`);
    if (notes) console.log(`   • Notes: ${notes}`);
    console.log('');
    
    if (!args.includes('--dry-run')) {
      console.log('🎯 NEXT STEPS:');
      console.log('');
      console.log('1. Review approved content:');
      console.log(`   cat "${approvalResult.filePath}"`);
      console.log('');
      console.log('2. Commit to git (makes it officially approved):');
      console.log(`   git add "${approvalResult.filePath}"`);
      console.log(`   git commit -m "feat: approve content for ${sku}"`);
      console.log('');
      console.log('3. Check overall approval status:');
      console.log('   pnpm run content:status');
      console.log('');
      console.log('💡 Content is approved but NOT yet in production until git commit!');
    } else {
      console.log('🧪 DRY RUN: No files were actually modified');
    }
    
  } catch (error) {
    console.error('❌ Content approval failed:');
    console.error(`   ${error.message}`);
    
    if (error.message.includes('No pending content found')) {
      console.error('');
      console.error('💡 Possible solutions:');
      console.error('   • Check SKU spelling');
      console.error('   • List pending content: pnpm run content:list-pending');
      console.error('   • Generate content: pnpm run enhance:individualized');
    }
    
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}