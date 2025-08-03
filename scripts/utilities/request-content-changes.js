#!/usr/bin/env node

import { ContentApprovalAgent } from '../../src/agents/content/ContentApprovalAgent.js';

/**
 * Request Changes to Content
 * 
 * Add reviewer feedback and request revisions to content
 */

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h') || args.length < 2) {
    console.log(`
📝 Request Changes to Content

USAGE:
  pnpm run content:request-changes <sku> <feedback> [options]

ARGUMENTS:
  <sku>                  Product SKU to request changes for
  <feedback>             Specific feedback and change requests

OPTIONS:
  --reviewer <name>      Reviewer name (default: system)
  --priority <level>     Priority: low, medium, high (default: medium)

EXAMPLES:
  pnpm run content:request-changes RRV-RR-001 "Need more cultural context about European hunting traditions"
  pnpm run content:request-changes RRV-MC-001 "Description too generic, add unique selling points" --priority high
  pnpm run content:request-changes RRV-EX-002 "SEO title too long, should be under 60 characters" --reviewer jane-doe

CHANGE REQUEST PROCESS:
  1. Adds structured feedback to the content file
  2. Keeps content in pending-review status
  3. Provides clear guidance for content regeneration
  4. Tracks review history and feedback
`);
    return;
  }
  
  const sku = args[0];
  const feedback = args[1];
  
  if (!sku || !feedback) {
    console.error('❌ Error: Both SKU and feedback are required');
    console.error('Usage: pnpm run content:request-changes <sku> <feedback>');
    process.exit(1);
  }
  
  try {
    console.log(`📝 Requesting Changes: ${sku}`);
    console.log('=' .repeat(45));
    
    const contentApprovalAgent = new ContentApprovalAgent({
      contentRepository: './content-repository',
      enableDryRun: args.includes('--dry-run')
    });
    
    // Parse options
    const reviewerIndex = args.indexOf('--reviewer');
    const reviewer = reviewerIndex >= 0 ? args[reviewerIndex + 1] : undefined;
    
    const priorityIndex = args.indexOf('--priority');
    const priority = priorityIndex >= 0 ? args[priorityIndex + 1] : 'medium';
    
    const reviewData = {
      reviewer,
      priority,
      requestedAt: new Date().toISOString()
    };
    
    // Check current status
    console.log('🔍 Checking current approval status...');
    const currentStatus = await contentApprovalAgent.checkContentApproval(sku);
    
    console.log(`📋 Current status: ${currentStatus.status}`);
    console.log(`📁 File: ${currentStatus.filePath || 'Not found'}`);
    console.log('');
    
    if (currentStatus.status === 'not-found') {
      console.error(`❌ No content found for ${sku}`);
      console.error('💡 Generate content first: pnpm run enhance:individualized');
      process.exit(1);
    }
    
    if (currentStatus.status === 'approved') {
      console.log('⚠️  Content is currently approved');
      console.log('🔄 Requesting changes will move it back to pending review');
      console.log('');
    }
    
    // Validate feedback
    if (feedback.length < 10) {
      console.warn('⚠️  Feedback is quite short. Consider providing more specific guidance.');
    }
    
    console.log('📝 CHANGE REQUEST DETAILS:');
    console.log(`   • SKU: ${sku}`);
    console.log(`   • Feedback: "${feedback}"`);
    console.log(`   • Priority: ${priority}`);
    if (reviewer) console.log(`   • Reviewer: ${reviewer}`);
    console.log('');
    
    // Request changes
    console.log('📝 Adding change request to content...');
    const changeResult = await contentApprovalAgent.requestChanges(sku, feedback, reviewData);
    
    console.log('✅ Change request added successfully!');
    console.log('');
    console.log('📊 CHANGE REQUEST RESULT:');
    console.log(`   • SKU: ${changeResult.sku}`);
    console.log(`   • Status: ${changeResult.status}`);
    console.log(`   • Feedback: "${changeResult.feedback}"`);
    console.log(`   • File: ${changeResult.filePath}`);
    console.log('');
    
    console.log('🎯 NEXT STEPS:');
    console.log('');
    console.log('1. Content team should address the feedback:');
    console.log('   • Review the specific change requests');
    console.log('   • Update content or regenerate as needed');
    console.log('   • Ensure all issues are resolved');
    console.log('');
    console.log('2. Regenerate content if needed:');
    console.log('   pnpm run enhance:individualized');
    console.log('');
    console.log('3. Re-review updated content:');
    console.log(`   pnpm run content:review ${sku}`);
    console.log('');
    console.log('4. Re-submit for approval when ready:');
    console.log(`   pnpm run content:approve ${sku}`);
    console.log('');
    
    // Show feedback categorization
    const feedbackCategory = categorizeFeedback(feedback);
    console.log('📊 FEEDBACK ANALYSIS:');
    console.log(`   • Category: ${feedbackCategory.category}`);
    console.log(`   • Estimated effort: ${feedbackCategory.effort}`);
    console.log(`   • Suggested approach: ${feedbackCategory.approach}`);
    console.log('');
    
    if (!args.includes('--dry-run')) {
      console.log('💡 TIP: Use `pnpm run content:list-pending` to see all items needing attention');
    } else {
      console.log('🧪 DRY RUN: No files were actually modified');
    }
    
  } catch (error) {
    console.error('❌ Change request failed:');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

function categorizeFeedback(feedback) {
  const lower = feedback.toLowerCase();
  
  // Content quality issues
  if (lower.includes('generic') || lower.includes('template') || lower.includes('unique')) {
    return {
      category: 'Content Quality',
      effort: 'High',
      approach: 'Regenerate with more specific prompts and vision analysis'
    };
  }
  
  // SEO issues
  if (lower.includes('seo') || lower.includes('title') || lower.includes('keywords') || lower.includes('meta')) {
    return {
      category: 'SEO Optimization',
      effort: 'Low',
      approach: 'Adjust SEO elements without full content regeneration'
    };
  }
  
  // Cultural/accuracy issues
  if (lower.includes('cultural') || lower.includes('context') || lower.includes('authentic') || lower.includes('accuracy')) {
    return {
      category: 'Cultural Accuracy',
      effort: 'Medium',
      approach: 'Research and incorporate proper cultural context'
    };
  }
  
  // Length/structure issues
  if (lower.includes('short') || lower.includes('long') || lower.includes('length') || lower.includes('structure')) {
    return {
      category: 'Content Structure',
      effort: 'Low',
      approach: 'Adjust length and formatting parameters'
    };
  }
  
  // Technical issues
  if (lower.includes('format') || lower.includes('markdown') || lower.includes('layout')) {
    return {
      category: 'Technical/Format',
      effort: 'Low',
      approach: 'Fix formatting and technical issues'
    };
  }
  
  // Default
  return {
    category: 'General Improvement',
    effort: 'Medium',
    approach: 'Review and address specific feedback points'
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}