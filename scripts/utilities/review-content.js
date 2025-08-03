#!/usr/bin/env node

import { ContentApprovalAgent } from '../../src/agents/content/ContentApprovalAgent.js';
import fs from 'fs-extra';

/**
 * Review Content for Approval
 * 
 * Interactive content review with detailed analysis
 */

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
📖 Review Content for Approval

USAGE:
  pnpm run content:review <sku> [options]

ARGUMENTS:
  <sku>                  Product SKU to review

OPTIONS:
  --show-metadata        Show detailed metadata and generation info
  --show-keywords        Show keyword analysis
  --show-quality         Show quality metrics

EXAMPLES:
  pnpm run content:review RRV-RR-001                    # Basic content review
  pnpm run content:review RRV-MC-001 --show-metadata    # Include metadata
  pnmp run content:review RRV-EX-002 --show-quality     # Include quality metrics

REVIEW PROCESS:
  1. Displays content in readable format
  2. Shows quality indicators and metadata
  3. Provides approval recommendations
  4. Shows next steps for approval or revision
`);
    return;
  }
  
  const sku = args[0];
  if (!sku) {
    console.error('❌ Error: SKU is required');
    console.error('Usage: pnpm run content:review <sku>');
    process.exit(1);
  }
  
  try {
    console.log(`📖 Content Review: ${sku}`);
    console.log('=' .repeat(50));
    
    const contentApprovalAgent = new ContentApprovalAgent({
      contentRepository: './content-repository'
    });
    
    // Check approval status
    console.log('🔍 Checking approval status...');
    const approvalStatus = await contentApprovalAgent.checkContentApproval(sku);
    
    console.log(`📋 Status: ${approvalStatus.status}`);
    console.log(`📁 File: ${approvalStatus.filePath || 'Not found'}`);
    console.log('');
    
    if (approvalStatus.status === 'not-found') {
      console.log('❌ No content found for this SKU');
      console.log('');
      console.log('💡 NEXT STEPS:');
      console.log('   1. Generate content: pnpm run enhance:individualized');
      console.log('   2. Check available content: pnpm run content:list-pending');
      return;
    }
    
    if (approvalStatus.status === 'approved') {
      console.log('✅ Content is already approved!');
      if (approvalStatus.needsCommit) {
        console.log('⚠️  Content approved but not yet committed to git');
      } else {
        console.log('🎉 Content is fully approved and in production');
      }
      console.log('');
    }
    
    // Read and parse content
    const contentFile = approvalStatus.filePath;
    const rawContent = await fs.readFile(contentFile, 'utf8');
    const parsedContent = parseMarkdownContent(rawContent);
    
    // Display content for review
    displayContentForReview(parsedContent, args);
    
    // Show quality assessment
    const qualityAssessment = assessContentQuality(parsedContent);
    displayQualityAssessment(qualityAssessment, args.includes('--show-quality'));
    
    // Show recommendation
    const recommendation = getApprovalRecommendation(qualityAssessment, approvalStatus);
    displayRecommendation(recommendation, sku, approvalStatus);
    
  } catch (error) {
    console.error('❌ Content review failed:');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

function parseMarkdownContent(content) {
  const sections = {};
  const lines = content.split('\n');
  let currentSection = null;
  let currentContent = [];
  
  for (const line of lines) {
    if (line.startsWith('# ')) {
      sections.title = line.substring(2).trim();
    } else if (line.startsWith('## ')) {
      // Save previous section
      if (currentSection && currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      
      currentSection = line.substring(3).toLowerCase().replace(/\s+/g, '_');
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  
  // Save last section
  if (currentSection && currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n').trim();
  }
  
  return sections;
}

function displayContentForReview(content, args) {
  console.log('📝 CONTENT REVIEW:');
  console.log('');
  
  // Title and basic info
  if (content.title) {
    console.log(`🏷️  TITLE: ${content.title}`);
    console.log('');
  }
  
  // Primary description (most important)
  if (content.primary_description) {
    console.log('📖 PRIMARY DESCRIPTION:');
    console.log(wrapText(content.primary_description, 70));
    console.log('');
  }
  
  // SEO title
  if (content.seo_title) {
    console.log('🔍 SEO TITLE:');
    console.log(`   "${content.seo_title}"`);
    console.log('');
  }
  
  // Meta description
  if (content.meta_description) {
    console.log('📄 META DESCRIPTION:');
    console.log(`   "${content.meta_description}"`);
    console.log('');
  }
  
  // Keywords (if requested)
  if (args.includes('--show-keywords') && content.keywords) {
    console.log('🔑 KEYWORDS:');
    console.log(content.keywords);
    console.log('');
  }
  
  // Metadata (if requested)
  if (args.includes('--show-metadata') && content.metadata) {
    console.log('📊 METADATA:');
    console.log(content.metadata);
    console.log('');
  }
  
  // Cultural notes
  if (content.cultural_notes) {
    console.log('🌍 CULTURAL NOTES:');
    console.log(wrapText(content.cultural_notes, 70));
    console.log('');
  }
}

function assessContentQuality(content) {
  const assessment = {
    wordCount: 0,
    hasDescription: false,
    hasSEOTitle: false,
    hasMetaDescription: false,
    hasKeywords: false,
    hasCulturalContext: false,
    uniquenessIndicators: 0,
    qualityScore: 0,
    issues: [],
    strengths: []
  };
  
  // Word count
  if (content.primary_description) {
    assessment.wordCount = content.primary_description.split(/\s+/).length;
    assessment.hasDescription = true;
    
    if (assessment.wordCount < 50) {
      assessment.issues.push('Description is quite short (<50 words)');
    } else if (assessment.wordCount > 150) {
      assessment.strengths.push('Comprehensive description (>150 words)');
    }
  }
  
  // SEO elements
  if (content.seo_title) {
    assessment.hasSEOTitle = true;
    if (content.seo_title.length > 60) {
      assessment.issues.push('SEO title may be too long (>60 chars)');
    } else {
      assessment.strengths.push('SEO title is well-sized');
    }
  }
  
  if (content.meta_description) {
    assessment.hasMetaDescription = true;
    if (content.meta_description.length > 160) {
      assessment.issues.push('Meta description may be too long (>160 chars)');
    } else {
      assessment.strengths.push('Meta description is well-sized');
    }
  }
  
  // Keywords
  assessment.hasKeywords = !!(content.keywords && content.keywords.includes('-'));
  
  // Cultural context
  assessment.hasCulturalContext = !!(content.cultural_notes && content.cultural_notes.length > 10);
  
  // Uniqueness indicators
  const text = (content.primary_description || '').toLowerCase();
  const uniqueMarkers = [
    'handmade', 'unique', 'one-of-a-kind', 'artisan', 'vintage', 'antique',
    'crafted', 'story', 'journey', 'tradition', 'heritage', 'authentic',
    'original', 'rare', 'collectible', 'spiritual', 'sacred'
  ];
  
  assessment.uniquenessIndicators = uniqueMarkers.filter(marker => text.includes(marker)).length;
  
  if (assessment.uniquenessIndicators >= 3) {
    assessment.strengths.push('Rich authentic language and storytelling');
  } else if (assessment.uniquenessIndicators === 0) {
    assessment.issues.push('Content lacks authentic/unique descriptors');
  }
  
  // Calculate quality score
  let score = 0;
  if (assessment.hasDescription) score += 25;
  if (assessment.hasSEOTitle) score += 15;
  if (assessment.hasMetaDescription) score += 15;
  if (assessment.hasKeywords) score += 10;
  if (assessment.hasCulturalContext) score += 10;
  if (assessment.wordCount >= 100) score += 10;
  if (assessment.uniquenessIndicators >= 2) score += 15;
  
  assessment.qualityScore = Math.min(score, 100);
  
  return assessment;
}

function displayQualityAssessment(assessment, showDetailed) {
  console.log('🎯 QUALITY ASSESSMENT:');
  console.log('');
  
  const scoreColor = assessment.qualityScore >= 80 ? '🟢' : 
                    assessment.qualityScore >= 60 ? '🟡' : '🔴';
  
  console.log(`   ${scoreColor} Overall Quality Score: ${assessment.qualityScore}/100`);
  console.log(`   📊 Word Count: ${assessment.wordCount}`);
  console.log(`   🔍 SEO Elements: ${[assessment.hasSEOTitle, assessment.hasMetaDescription, assessment.hasKeywords].filter(Boolean).length}/3`);
  console.log(`   🌍 Cultural Context: ${assessment.hasCulturalContext ? 'Yes' : 'No'}`);
  console.log(`   ✨ Uniqueness Markers: ${assessment.uniquenessIndicators}`);
  console.log('');
  
  if (showDetailed || assessment.strengths.length > 0) {
    if (assessment.strengths.length > 0) {
      console.log('✅ STRENGTHS:');
      assessment.strengths.forEach(strength => {
        console.log(`   • ${strength}`);
      });
      console.log('');
    }
    
    if (assessment.issues.length > 0) {
      console.log('⚠️  POTENTIAL ISSUES:');
      assessment.issues.forEach(issue => {
        console.log(`   • ${issue}`);
      });
      console.log('');
    }
  }
}

function getApprovalRecommendation(assessment, approvalStatus) {
  if (approvalStatus.status === 'approved') {
    return {
      action: 'already-approved',
      confidence: 'high',
      message: 'Content is already approved and ready for production'
    };
  }
  
  if (assessment.qualityScore >= 80) {
    return {
      action: 'approve',
      confidence: 'high',
      message: 'Content meets quality standards and should be approved'
    };
  } else if (assessment.qualityScore >= 60) {
    return {
      action: 'approve-with-minor-changes',
      confidence: 'medium',
      message: 'Content is good but could benefit from minor improvements'
    };
  } else {
    return {
      action: 'request-changes',
      confidence: 'high',
      message: 'Content needs significant improvements before approval'
    };
  }
}

function displayRecommendation(recommendation, sku, approvalStatus) {
  console.log('🎯 RECOMMENDATION:');
  console.log('');
  
  switch (recommendation.action) {
    case 'already-approved':
      console.log('✅ STATUS: Already approved');
      if (approvalStatus.needsCommit) {
        console.log('💡 NEXT STEP: Commit to git for production use');
        console.log(`   pnpm run content:commit-approved`);
      }
      break;
      
    case 'approve':
      console.log('✅ RECOMMENDATION: Approve for production');
      console.log('💡 NEXT STEPS:');
      console.log(`   1. Approve: pnpm run content:approve ${sku}`);
      console.log(`   2. Commit: pnpm run content:commit-approved`);
      break;
      
    case 'approve-with-minor-changes':
      console.log('🟡 RECOMMENDATION: Approve with minor improvements (optional)');
      console.log('💡 OPTIONS:');
      console.log(`   1. Approve as-is: pnpm run content:approve ${sku}`);
      console.log(`   2. Request changes: pnpm run content:request-changes ${sku} "specific feedback"`);
      break;
      
    case 'request-changes':
      console.log('🔴 RECOMMENDATION: Request significant changes');
      console.log('💡 NEXT STEP:');
      console.log(`   pnpm run content:request-changes ${sku} "specific improvement feedback"`);
      break;
  }
  
  console.log('');
  console.log(`📊 Confidence: ${recommendation.confidence}`);
  console.log(`💬 Reason: ${recommendation.message}`);
}

function wrapText(text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + word).length <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push('   ' + currentLine);
      currentLine = word;
    }
  }
  
  if (currentLine) lines.push('   ' + currentLine);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}