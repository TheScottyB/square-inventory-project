import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { CatalogObserver } from '../observability/CatalogObserver.js';

/**
 * ContentApprovalAgent - Git-based content approval system
 * 
 * Treats product content like source code with proper version control
 * and approval workflows. Ensures only approved content is used in production.
 * 
 * Core principle: If it's in git, it's approved. If not, it needs review.
 */
export class ContentApprovalAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      contentRepository: options.contentRepository || './content-repository',
      requireGitCommit: options.requireGitCommit || true,
      enableDryRun: options.enableDryRun || false,
      defaultReviewer: options.defaultReviewer || 'content-team',
      qualityThreshold: options.qualityThreshold || 0.85,
      ...options
    };

    // Repository structure
    this.paths = {
      root: this.options.contentRepository,
      approved: path.join(this.options.contentRepository, 'product-content/descriptions/approved'),
      pending: path.join(this.options.contentRepository, 'product-content/descriptions/pending-review'),
      rejected: path.join(this.options.contentRepository, 'product-content/descriptions/rejected'),
      templates: path.join(this.options.contentRepository, 'product-content/templates'),
      titles: {
        approved: path.join(this.options.contentRepository, 'product-content/titles/approved'),
        pending: path.join(this.options.contentRepository, 'product-content/titles/pending-review'),
        rejected: path.join(this.options.contentRepository, 'product-content/titles/rejected')
      },
      metadata: {
        approved: path.join(this.options.contentRepository, 'product-content/metadata/approved'),
        pending: path.join(this.options.contentRepository, 'product-content/metadata/pending-review'),
        rejected: path.join(this.options.contentRepository, 'product-content/metadata/rejected')
      },
      seo: {
        approved: path.join(this.options.contentRepository, 'product-content/seo/approved'),
        pending: path.join(this.options.contentRepository, 'product-content/seo/pending-review'),
        rejected: path.join(this.options.contentRepository, 'product-content/seo/rejected')
      },
      permalinks: {
        approved: path.join(this.options.contentRepository, 'product-content/permalinks/approved'),
        pending: path.join(this.options.contentRepository, 'product-content/permalinks/pending-review'),
        rejected: path.join(this.options.contentRepository, 'product-content/permalinks/rejected')
      }
    };

    // Content approval status cache
    this.approvalCache = new Map();

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/content-approval'
    });

    this.stats = {
      approvalChecks: 0,
      approvedContent: 0,
      pendingContent: 0,
      rejectedContent: 0,
      contentGenerated: 0,
      contentApproved: 0,
      gitCommits: 0
    };
  }

  /**
   * Initialize content repository structure
   * @returns {Promise<void>}
   */
  async initializeRepository() {
    const traceId = this.observer.startTrace('initialize_content_repository');
    
    try {
      this.observer.log('info', 'Initializing content approval repository structure');
      
      // Create directory structure
      for (const [key, dirPath] of Object.entries(this.paths)) {
        if (typeof dirPath === 'string') {
          await fs.ensureDir(dirPath);
        } else if (typeof dirPath === 'object') {
          for (const subPath of Object.values(dirPath)) {
            await fs.ensureDir(subPath);
          }
        }
      }
      
      // Create README files for guidance
      await this.createRepositoryDocumentation();
      
      // Initialize git repository if needed
      await this.ensureGitRepository();
      
      this.observer.log('info', 'Content repository structure initialized');
      this.observer.endTrace(traceId, { repositoryPath: this.paths.root });
      
    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Check content approval status for a product
   * @param {string} sku - Product SKU
   * @param {string} contentType - Type of content ('description', 'title', 'metadata')
   * @returns {Promise<Object>} Approval status
   */
  async checkContentApproval(sku, contentType = 'description') {
    const traceId = this.observer.startTrace('check_content_approval');
    this.stats.approvalChecks++;
    
    try {
      const cacheKey = `${sku}-${contentType}`;
      
      // Check cache first
      if (this.approvalCache.has(cacheKey)) {
        const cached = this.approvalCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 300000) { // 5 minute cache
          this.observer.endTrace(traceId, { sku, status: cached.status, source: 'cache' });
          return cached.result;
        }
      }
      
      const contentPaths = this.getContentPaths(contentType);
      const approvedFile = path.join(contentPaths.approved, `${sku}.md`);
      const pendingFile = path.join(contentPaths.pending, `${sku}.md`);
      const rejectedFile = path.join(this.paths.rejected, `${sku}.md`);
      
      const [approvedExists, pendingExists, rejectedExists] = await Promise.all([
        fs.pathExists(approvedFile),
        fs.pathExists(pendingFile),
        fs.pathExists(rejectedFile)
      ]);
      
      let result;
      
      if (approvedExists) {
        // Check git commit status
        const gitStatus = await this.checkGitCommitStatus(approvedFile);
        const fileStats = await fs.stat(approvedFile);
        
        result = {
          status: gitStatus.committed ? 'approved' : 'approved-uncommitted',
          approved: gitStatus.committed,
          filePath: approvedFile,
          needsCommit: !gitStatus.committed,
          lastModified: fileStats.mtime,
          gitInfo: gitStatus,
          contentType
        };
        
        if (gitStatus.committed) {
          this.stats.approvedContent++;
        }
        
      } else if (pendingExists) {
        const fileStats = await fs.stat(pendingFile);
        
        result = {
          status: 'pending-review',
          approved: false,
          filePath: pendingFile,
          needsReview: true,
          lastModified: fileStats.mtime,
          contentType
        };
        
        this.stats.pendingContent++;
        
      } else if (rejectedExists) {
        const fileStats = await fs.stat(rejectedFile);
        
        result = {
          status: 'rejected',
          approved: false,
          filePath: rejectedFile,
          needsRevision: true,
          lastModified: fileStats.mtime,
          contentType
        };
        
        this.stats.rejectedContent++;
        
      } else {
        result = {
          status: 'not-found',
          approved: false,
          needsGeneration: true,
          contentType
        };
      }
      
      // Cache result
      this.approvalCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
        status: result.status
      });
      
      this.observer.log('debug', `Content approval check for ${sku}: ${result.status}`);
      this.observer.endTrace(traceId, { sku, status: result.status, contentType });
      
      return result;

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Load approved content for a product
   * @param {string} sku - Product SKU
   * @param {string} contentType - Type of content
   * @returns {Promise<Object>} Parsed approved content
   */
  async loadApprovedContent(sku, contentType = 'description') {
    const traceId = this.observer.startTrace('load_approved_content');
    
    try {
      const approval = await this.checkContentApproval(sku, contentType);
      
      if (!approval.approved) {
        throw new Error(`Content for ${sku} (${contentType}) is not approved. Status: ${approval.status}`);
      }
      
      const contentFile = approval.filePath;
      const rawContent = await fs.readFile(contentFile, 'utf8');
      const parsedContent = this.parseContentFile(rawContent, sku);
      
      this.observer.log('info', `Loaded approved content for ${sku}`);
      this.observer.endTrace(traceId, { sku, contentType, approved: true });
      
      return {
        ...parsedContent,
        approvalInfo: approval,
        loadedAt: new Date().toISOString()
      };

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Save content for review (pending approval)
   * @param {string} sku - Product SKU
   * @param {Object} content - Generated content
   * @param {Object} metadata - Generation metadata
   * @returns {Promise<Object>} Save results
   */
  async saveContentForReview(sku, content, metadata = {}) {
    const traceId = this.observer.startTrace('save_content_for_review');
    
    try {
      await fs.ensureDir(this.paths.pending);
      
      const pendingFile = path.join(this.paths.pending, `${sku}.md`);
      const markdownContent = this.formatContentAsMarkdown(sku, content, metadata);
      
      if (!this.options.enableDryRun) {
        await fs.writeFile(pendingFile, markdownContent, 'utf8');
      }
      
      // Clear cache for this SKU
      this.approvalCache.delete(`${sku}-description`);
      this.stats.contentGenerated++;
      
      this.observer.log('info', `Content saved for review: ${sku}`);
      this.observer.endTrace(traceId, { sku, filePath: pendingFile, dryRun: this.options.enableDryRun });
      
      return {
        sku,
        filePath: this.options.enableDryRun ? '[DRY RUN]' : pendingFile,
        status: 'pending-review',
        nextSteps: [
          `Review content: ${pendingFile}`,
          `Approve with: pnpm run content:approve ${sku}`,
          `Or request changes: pnpm run content:request-changes ${sku}`
        ]
      };

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Approve content (move from pending to approved)
   * @param {string} sku - Product SKU
   * @param {Object} reviewData - Review metadata
   * @returns {Promise<Object>} Approval results
   */
  async approveContent(sku, reviewData = {}) {
    const traceId = this.observer.startTrace('approve_content');
    
    try {
      const pendingFile = path.join(this.paths.pending, `${sku}.md`);
      const approvedFile = path.join(this.paths.approved, `${sku}.md`);
      
      if (!await fs.pathExists(pendingFile)) {
        throw new Error(`No pending content found for ${sku}`);
      }
      
      // Load and update content with approval metadata
      let content = await fs.readFile(pendingFile, 'utf8');
      content = this.addApprovalMetadata(content, reviewData);
      
      if (!this.options.enableDryRun) {
        // Move to approved directory
        await fs.ensureDir(this.paths.approved);
        await fs.writeFile(approvedFile, content, 'utf8');
        await fs.remove(pendingFile);
      }
      
      // Clear cache
      this.approvalCache.delete(`${sku}-description`);
      this.stats.contentApproved++;
      
      this.observer.log('info', `Content approved for ${sku}`);
      this.observer.endTrace(traceId, { sku, approvedFile, dryRun: this.options.enableDryRun });
      
      return {
        sku,
        status: 'approved',
        filePath: this.options.enableDryRun ? '[DRY RUN]' : approvedFile,
        needsCommit: !this.options.enableDryRun,
        nextSteps: [
          `Git add: git add ${approvedFile}`,
          `Git commit: git commit -m "feat: approve content for ${sku}"`,
          `Content is now ready for production use`
        ]
      };

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Request changes to content (add review comments)
   * @param {string} sku - Product SKU
   * @param {string} feedback - Review feedback
   * @param {Object} reviewData - Review metadata
   * @returns {Promise<Object>} Request changes results
   */
  async requestChanges(sku, feedback, reviewData = {}) {
    const traceId = this.observer.startTrace('request_content_changes');
    
    try {
      const pendingFile = path.join(this.paths.pending, `${sku}.md`);
      
      if (!await fs.pathExists(pendingFile)) {
        throw new Error(`No pending content found for ${sku}`);
      }
      
      // Add review feedback to content
      let content = await fs.readFile(pendingFile, 'utf8');
      content = this.addReviewFeedback(content, feedback, reviewData);
      
      if (!this.options.enableDryRun) {
        await fs.writeFile(pendingFile, content, 'utf8');
      }
      
      this.observer.log('info', `Changes requested for ${sku}: ${feedback}`);
      this.observer.endTrace(traceId, { sku, feedback });
      
      return {
        sku,
        status: 'changes-requested',
        feedback,
        filePath: this.options.enableDryRun ? '[DRY RUN]' : pendingFile,
        nextSteps: [
          'Address review feedback',
          'Regenerate content if needed',
          'Resubmit for approval'
        ]
      };

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * Get content approval status for multiple products
   * @param {Array} skus - Array of SKUs to check
   * @returns {Promise<Object>} Batch approval status
   */
  async batchCheckApproval(skus) {
    const traceId = this.observer.startTrace('batch_check_approval');
    
    try {
      const results = {
        approved: [],
        pending: [],
        rejected: [],
        notFound: [],
        needsCommit: []
      };
      
      const checkPromises = skus.map(async (sku) => {
        try {
          const status = await this.checkContentApproval(sku);
          
          switch (status.status) {
            case 'approved':
              results.approved.push({ sku, ...status });
              break;
            case 'approved-uncommitted':
              results.needsCommit.push({ sku, ...status });
              break;
            case 'pending-review':
              results.pending.push({ sku, ...status });
              break;
            case 'rejected':
              results.rejected.push({ sku, ...status });
              break;
            case 'not-found':
              results.notFound.push({ sku, ...status });
              break;
          }
          
          return { sku, status: status.status, success: true };
        } catch (error) {
          return { sku, error: error.message, success: false };
        }
      });
      
      await Promise.allSettled(checkPromises);
      
      const summary = {
        total: skus.length,
        approved: results.approved.length,
        pending: results.pending.length,
        rejected: results.rejected.length,
        notFound: results.notFound.length,
        needsCommit: results.needsCommit.length
      };
      
      this.observer.log('info', `Batch approval check completed: ${summary.approved}/${summary.total} approved`);
      this.observer.endTrace(traceId, summary);
      
      return { results, summary };

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw error;
    }
  }

  /**
   * List content needing review
   * @returns {Promise<Array>} List of items needing review
   */
  async listPendingReview() {
    const pendingFiles = await fs.readdir(this.paths.pending);
    const pendingItems = [];
    
    for (const file of pendingFiles) {
      if (file.endsWith('.md')) {
        const sku = path.basename(file, '.md');
        const filePath = path.join(this.paths.pending, file);
        const stats = await fs.stat(filePath);
        
        pendingItems.push({
          sku,
          filePath,
          lastModified: stats.mtime,
          size: stats.size
        });
      }
    }
    
    // Sort by modification time (newest first)
    pendingItems.sort((a, b) => b.lastModified - a.lastModified);
    
    return pendingItems;
  }

  // Helper methods
  
  getContentPaths(contentType) {
    switch (contentType) {
      case 'description':
        return { approved: this.paths.approved, pending: this.paths.pending, rejected: this.paths.rejected };
      case 'title':
        return this.paths.titles;
      case 'metadata':
        return this.paths.metadata;
      case 'seo':
        return this.paths.seo;
      case 'permalink':
        return this.paths.permalinks;
      default:
        throw new Error(`Unknown content type: ${contentType}. Supported: description, title, metadata, seo, permalink`);
    }
  }

  async checkGitCommitStatus(filePath) {
    try {
      // Check if file is tracked by git
      const relativeFile = path.relative(process.cwd(), filePath);
      
      // Check if file exists in git index
      try {
        execSync(`git ls-files --error-unmatch "${relativeFile}"`, { stdio: 'ignore' });
      } catch {
        return { committed: false, tracked: false, reason: 'not-tracked' };
      }
      
      // Check if file has uncommitted changes
      try {
        const status = execSync(`git status --porcelain "${relativeFile}"`, { encoding: 'utf8' });
        if (status.trim()) {
          return { committed: false, tracked: true, reason: 'uncommitted-changes' };
        }
      } catch {
        // File is clean
      }
      
      return { committed: true, tracked: true };
      
    } catch (error) {
      return { committed: false, tracked: false, reason: 'git-error', error: error.message };
    }
  }

  formatContentAsMarkdown(sku, content, metadata) {
    const timestamp = new Date().toISOString();
    const contentType = metadata.contentType || 'description';
    
    // Format based on content type
    switch (contentType) {
      case 'seo':
        return this.formatSEOContentAsMarkdown(sku, content, metadata, timestamp);
      case 'permalink':
        return this.formatPermalinkContentAsMarkdown(sku, content, metadata, timestamp);
      default:
        return this.formatDescriptionContentAsMarkdown(sku, content, metadata, timestamp);
    }
  }

  formatDescriptionContentAsMarkdown(sku, content, metadata, timestamp) {
    return `# ${sku}: ${content.itemName || 'Product'}

## Metadata
- **SKU:** ${sku}
- **Item Name:** ${content.itemName || 'Unknown'}
- **Categories:** ${content.categories || 'Uncategorized'}
- **Cultural Context:** ${content.culturalContext || 'General'}
- **Narrative Framework:** ${content.narrativeFramework || 'Standard'}
- **Generated:** ${timestamp}
- **Generator:** ${metadata.generator || 'NarrativeSpecialistAgent'}
- **Approval Status:** ⏳ Pending Review

## Primary Description
${content.primaryNarrative || content.description || 'No description available'}

## SEO Title
${content.seoTitle || content.title || 'No title available'}

## Meta Description
${content.metaDescription || 'No meta description available'}

## Variations
### Short Description
${content.shortDescription || 'No short description available'}

### Long Description
${content.longDescription || content.primaryNarrative || 'No long description available'}

## Keywords
${content.primaryKeywords ? content.primaryKeywords.map(k => `- ${k}`).join('\n') : '- No keywords specified'}

## SEO Integration
- **Primary Keywords:** ${content.primaryKeywords?.join(', ') || 'None'}
- **Secondary Keywords:** ${content.secondaryKeywords?.join(', ') || 'None'}
- **Keyword Density:** ${content.keywordDensity || 'Not calculated'}

## Quality Metrics
- **Word Count:** ${content.wordCount || 'Not calculated'}
- **Readability Score:** ${content.readabilityScore || 'Not calculated'}
- **Uniqueness Score:** ${content.uniquenessScore || 'Not calculated'}
- **Cultural Accuracy:** ${content.culturalAccuracy || 'Not calculated'}

## Cultural Notes
${content.culturalNotes || 'No specific cultural considerations'}

## Review Notes
*Add review comments here*

## Approval History
- **${timestamp}:** Content generated and submitted for review
- **Status:** Pending initial review
- **Reviewer:** TBD
`;
  }

  formatSEOContentAsMarkdown(sku, content, metadata, timestamp) {
    return `# ${sku}: SEO Metadata Package

## Metadata
- **SKU:** ${sku}
- **Item Name:** ${content.itemName || 'Unknown'}
- **Categories:** ${content.categories || 'Uncategorized'}
- **Generated:** ${timestamp}
- **Generator:** ${metadata.generator || 'SEOResearchAgent'}
- **Approval Status:** ⏳ Pending Review

## SEO Title (Primary)
\`\`\`
${content.seoTitle || content.title || 'No title available'}
\`\`\`
- **Length:** ${(content.seoTitle || content.title || '').length} characters
- **Target:** 50-60 characters for optimal display

## Meta Description
\`\`\`
${content.metaDescription || 'No meta description available'}
\`\`\`
- **Length:** ${(content.metaDescription || '').length} characters
- **Target:** 150-160 characters for optimal display

## Primary SEO Keywords
${content.primaryKeywords ? content.primaryKeywords.map(k => `- ${k}`).join('\n') : '- No primary keywords specified'}

## Secondary SEO Keywords
${content.secondaryKeywords ? content.secondaryKeywords.map(k => `- ${k}`).join('\n') : '- No secondary keywords specified'}

## Long-tail Keywords
${content.longTailKeywords ? content.longTailKeywords.map(k => `- ${k}`).join('\n') : '- No long-tail keywords specified'}

## SEO Strategy
- **Primary Focus:** ${content.primaryFocus || 'Not specified'}
- **Search Intent:** ${content.searchIntent || 'Not specified'}
- **Market Positioning:** ${content.marketPositioning || 'Not specified'}

## Quality Metrics
- **Keyword Density:** ${content.keywordDensity || 'Not calculated'}
- **SEO Score:** ${content.seoScore || 'Not calculated'}
- **Readability Score:** ${content.readabilityScore || 'Not calculated'}

## Review Notes
*Add SEO review comments here*

## Approval History
- **${timestamp}:** SEO metadata generated and submitted for review
- **Status:** Pending initial review
- **Reviewer:** TBD
`;
  }

  formatPermalinkContentAsMarkdown(sku, content, metadata, timestamp) {
    return `# ${sku}: Permalink Structure

## Metadata
- **SKU:** ${sku}
- **Item Name:** ${content.itemName || 'Unknown'}
- **Categories:** ${content.categories || 'Uncategorized'}
- **Generated:** ${timestamp}
- **Generator:** ${metadata.generator || 'PermalinkAgent'}
- **Approval Status:** ⏳ Pending Review

## Recommended Permalink
\`\`\`
${content.recommendedPermalink || '/products/' + sku.toLowerCase()}
\`\`\`

## Permalink Variations
### Short Version
\`\`\`
${content.shortPermalink || content.recommendedPermalink || '/products/' + sku.toLowerCase()}
\`\`\`

### SEO-Optimized Version
\`\`\`
${content.seoPermalink || content.recommendedPermalink || '/products/' + sku.toLowerCase()}
\`\`\`

## URL Best Practices Check
- **Uses hyphens:** ${content.usesHyphens !== false ? '✅' : '❌'}
- **Lowercase only:** ${content.isLowercase !== false ? '✅' : '❌'}
- **No special characters:** ${content.noSpecialChars !== false ? '✅' : '❌'}
- **Under 100 characters:** ${(content.recommendedPermalink || sku).length < 100 ? '✅' : '❌'}

## Quality Metrics
- **SEO Score:** ${content.permalinkSeoScore || 'Not calculated'}
- **User Friendliness:** ${content.userFriendliness || 'Not assessed'}
- **Uniqueness:** ${content.uniqueness || 'Not verified'}

## Review Notes
*Add permalink review comments here*

## Approval History
- **${timestamp}:** Permalink structure generated and submitted for review
- **Status:** Pending initial review
- **Reviewer:** TBD
`;
  }

  addApprovalMetadata(content, reviewData) {
    const timestamp = new Date().toISOString();
    const reviewer = reviewData.reviewer || this.options.defaultReviewer;
    const qualityScore = reviewData.qualityScore || 'Not specified';
    
    const approvalUpdate = `- **Approval Status:** ✅ Approved
- **Last Reviewed:** ${timestamp}
- **Reviewer:** ${reviewer}
- **Quality Score:** ${qualityScore}`;
    
    return content.replace('- **Approval Status:** ⏳ Pending Review', approvalUpdate);
  }

  addReviewFeedback(content, feedback, reviewData) {
    const timestamp = new Date().toISOString();
    const reviewer = reviewData.reviewer || this.options.defaultReviewer;
    
    const feedbackSection = `
## Review Feedback (${timestamp})
**Reviewer:** ${reviewer}
**Feedback:** ${feedback}
**Status:** Changes Requested

`;
    
    return content.replace('## Review Notes', feedbackSection + '## Review Notes');
  }

  parseContentFile(content, sku) {
    // Parse markdown content into structured object
    const lines = content.split('\n');
    const result = { sku };
    let currentSection = null;
    let currentContent = [];
    
    for (const line of lines) {
      if (line.startsWith('## ')) {
        // Save previous section
        if (currentSection && currentContent.length > 0) {
          result[currentSection] = currentContent.join('\n').trim();
        }
        
        // Start new section
        currentSection = line.substring(3).toLowerCase().replace(/\s+/g, '_');
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }
    
    // Save last section
    if (currentSection && currentContent.length > 0) {
      result[currentSection] = currentContent.join('\n').trim();
    }
    
    return result;
  }

  async createRepositoryDocumentation() {
    const readmeContent = `# Content Approval Repository

This repository contains approved product content following source code practices.

## Directory Structure
- \`approved/\` - ✅ Approved content ready for production
- \`pending-review/\` - ⏳ Content awaiting review and approval  
- \`rejected/\` - ❌ Content that needs revision
- \`templates/\` - 📝 Approved narrative templates

## Approval Process
1. Content generated → saved to \`pending-review/\`
2. Review and approve → moved to \`approved/\`
3. Git commit → officially approved for production use

## Quality Standards
- Uniqueness: 95%+ (no duplicate content)
- Cultural Accuracy: 90%+ (authentic representation)
- SEO Optimization: 85%+ (keyword integration)
- Readability: Grade 8+ reading level

## Usage
Only use content from \`approved/\` directory that is committed to git.
If content is not approved, it should not be used in production.
`;
    
    const readmePath = path.join(this.paths.root, 'README.md');
    await fs.writeFile(readmePath, readmeContent, 'utf8');
  }

  async ensureGitRepository() {
    try {
      execSync('git rev-parse --git-dir', { cwd: this.paths.root, stdio: 'ignore' });
    } catch {
      // Not a git repository, initialize one
      execSync('git init', { cwd: this.paths.root });
      execSync('git add README.md', { cwd: this.paths.root });
      execSync('git commit -m "Initial content repository setup"', { cwd: this.paths.root });
    }
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return { ...this.stats };
  }
}