#!/usr/bin/env node

import { ContentApprovalAgent } from '../../src/agents/content/ContentApprovalAgent.js';

/**
 * Initialize Content Repository Structure
 * 
 * Sets up the git-based content approval system directory structure
 * and creates initial documentation and workflows.
 */

async function main() {
  try {
    console.log('🔐 Initializing Git-Based Content Approval Repository...');
    console.log('=' .repeat(60));
    
    const contentApprovalAgent = new ContentApprovalAgent({
      contentRepository: './content-repository',
      requireGitCommit: true,
      enableDryRun: process.argv.includes('--dry-run')
    });
    
    // Initialize repository structure
    await contentApprovalAgent.initializeRepository();
    
    console.log('✅ Content repository initialized successfully!');
    console.log('');
    console.log('📁 DIRECTORY STRUCTURE CREATED:');
    console.log('   content-repository/');
    console.log('   ├── product-content/');
    console.log('   │   ├── descriptions/');
    console.log('   │   │   ├── approved/        # ✅ Git-committed content');
    console.log('   │   │   ├── pending-review/  # ⏳ Awaiting approval');
    console.log('   │   │   └── rejected/        # ❌ Needs revision');
    console.log('   │   ├── titles/');
    console.log('   │   │   ├── approved/');
    console.log('   │   │   └── pending-review/');
    console.log('   │   ├── metadata/');
    console.log('   │   │   ├── approved/');
    console.log('   │   │   └── pending-review/');
    console.log('   │   └── templates/           # 📝 Approved templates');
    console.log('   └── README.md                # 📖 Usage documentation');
    console.log('');
    console.log('🔄 APPROVAL WORKFLOW:');
    console.log('   1. Content generated → saved to pending-review/');
    console.log('   2. Review and approve → moved to approved/');
    console.log('   3. Git commit → officially approved for production');
    console.log('');
    console.log('⚡ QUICK START COMMANDS:');
    console.log('   pnpm run content:status              # Check approval status');
    console.log('   pnpm run content:list-pending        # List items needing review');
    console.log('   pnpm run content:review <sku>        # Review specific item');
    console.log('   pnpm run content:approve <sku>       # Approve content');
    console.log('   pnpm run content:commit-approved     # Git commit approved content');
    console.log('');
    console.log('🎯 NEXT STEPS:');
    console.log('   1. Generate content: pnpm run enhance:individualized');
    console.log('   2. Review generated content in content-repository/product-content/descriptions/pending-review/');
    console.log('   3. Approve quality content: pnpm run content:approve <sku>');
    console.log('   4. Commit approved content to git');
    console.log('');
    console.log('🎉 Content approval system is ready!');
    
  } catch (error) {
    console.error('❌ Repository initialization failed:');
    console.error(`   ${error.message}`);
    console.error('');
    console.error('💡 Make sure you have write permissions in the current directory');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}