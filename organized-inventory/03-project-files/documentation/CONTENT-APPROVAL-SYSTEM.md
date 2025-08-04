# 🔐 Git-Based Content Approval System

**Source Code Approach for Curated Descriptions and Titles**

Treat product content like source code with proper version control, review processes, and approval workflows.

---

## 🎯 **Core Principle**

### **Content Approval Status:**
- **✅ In Git = Approved** - Content has been reviewed, approved, and is ready for use
- **⚠️ Not in Git = Needs Review** - Even if not blank, content should be examined and approved
- **🔄 Modified in Git = Needs Re-approval** - Changes trigger review workflow

### **Quality Gate:**
```
Content Pipeline: Generate → Review → Approve → Commit → Deploy
                                    ↓
                              Git Repository
                                    ↓
                            Source of Truth
```

---

## 📁 **Content Repository Structure**

### **Directory Organization:**
```
content-repository/
├── product-content/
│   ├── descriptions/           # Individual product descriptions
│   │   ├── approved/          # ✅ Reviewed and approved
│   │   │   ├── RRV-RR-001.md  # SKU-based filename
│   │   │   ├── RRV-MC-001.md
│   │   │   └── ...
│   │   ├── pending-review/    # ⚠️ Generated, needs approval
│   │   │   ├── RRV-EX-002.md
│   │   │   └── ...
│   │   └── templates/         # 📝 Approved narrative templates
│   │       ├── heritage-legacy.md
│   │       ├── mystical-spiritual.md
│   │       └── ...
│   ├── titles/               # SEO-optimized titles
│   │   ├── approved/
│   │   └── pending-review/
│   ├── metadata/             # SEO and cultural metadata
│   │   ├── approved/
│   │   └── pending-review/
│   └── categories/           # Category descriptions and guidelines
│       ├── french-collections.md
│       ├── spiritual-items.md
│       └── ...
├── approval-workflows/       # Review and approval processes
├── quality-standards/        # Content quality guidelines
└── tools/                   # Content management scripts
```

---

## 🔍 **Content File Format**

### **Individual Product Content (Markdown):**
```markdown
# RRV-RR-001: "The End" European Deer Mount Sculpture

## Metadata
- **SKU:** RRV-RR-001
- **Item Name:** "The End" European Deer Mount Eight Point Buck Skull Sculpture Heavy
- **Categories:** The Real Rarities
- **Cultural Context:** Artisan/Craft
- **Narrative Framework:** Heritage/Legacy
- **Last Reviewed:** 2025-08-03
- **Reviewer:** [reviewer-name]
- **Approval Status:** ✅ Approved

## Primary Description
Handmade and welded entirely from metal, this one-of-a-kind Euro Mount Deer Sculpture is a unique piece of art that commands attention in any space. Made from repurposed steel, it's hard to tell that the entire piece is made of metal at first glance...

## SEO Title
Handcrafted Metal Deer Skull Sculpture - Unique Euro Mount Art Piece

## Meta Description
One-of-a-kind handmade metal deer skull sculpture. Repurposed steel craftsmanship creates stunning wall art. Heavy, durable, and completely unique.

## Variations
### Short Description (50 words)
Handcrafted metal deer skull sculpture...

### Long Description (200+ words)
[Extended narrative with full story]

## Keywords
- handmade metal sculpture
- euro mount deer skull
- repurposed steel art
- unique wall decor
- artisan metalwork

## Cultural Notes
- Authentic craftsmanship narrative
- No cultural sensitivities
- Appeals to art collectors and rustic decor enthusiasts

## Approval History
- **2025-08-03:** Initial creation and approval by [reviewer]
- **Changes:** Initial approved version
```

---

## 🔄 **Content Approval Workflows**

### **1. New Content Generation:**
```bash
# Generate new content (places in pending-review)
pnpm run content:generate-new

# Content goes to: content-repository/product-content/descriptions/pending-review/
```

### **2. Review Process:**
```bash
# List items needing review
pnpm run content:list-pending

# Review specific item
pnpm run content:review RRV-RR-001

# Approve and move to approved directory
pnpm run content:approve RRV-RR-001

# Request changes (adds comments, keeps in pending)
pnpm run content:request-changes RRV-RR-001 "Need more cultural context"
```

### **3. Git Integration:**
```bash
# Check content approval status
pnpm run content:check-approval-status

# Commit approved content
git add content-repository/product-content/descriptions/approved/
git commit -m "feat: approve product descriptions batch 1

- RRV-RR-001: Metal deer sculpture - heritage narrative
- RRV-MC-001: Crystal bowl - spiritual narrative  
- RRV-EX-002: Sunset lamp - transformation narrative

Reviewed-by: [reviewer-name]
Quality-score: 95%
Cultural-accuracy: 98%"

# Content is now officially approved and in source control
```

---

## 🛡️ **Content Validation Agent**

### **ContentApprovalAgent.js:**
```javascript
/**
 * ContentApprovalAgent - Git-based content approval system
 * 
 * Treats product content like source code with proper version control
 * and approval workflows. Ensures only approved content is used.
 */
export class ContentApprovalAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    this.contentRepository = options.contentRepository || './content-repository';
    this.approvedPath = path.join(this.contentRepository, 'product-content/descriptions/approved');
    this.pendingPath = path.join(this.contentRepository, 'product-content/descriptions/pending-review');
  }

  /**
   * Check if content is approved (exists in git repository)
   * @param {string} sku - Product SKU
   * @returns {Promise<Object>} Approval status
   */
  async checkContentApproval(sku) {
    const approvedFile = path.join(this.approvedPath, `${sku}.md`);
    const pendingFile = path.join(this.pendingPath, `${sku}.md`);
    
    const approvedExists = await fs.pathExists(approvedFile);
    const pendingExists = await fs.pathExists(pendingFile);
    
    if (approvedExists) {
      // Check git status to ensure it's committed
      const isCommitted = await this.checkGitCommitStatus(approvedFile);
      
      return {
        status: isCommitted ? 'approved' : 'approved-uncommitted',
        approved: isCommitted,
        filePath: approvedFile,
        needsCommit: !isCommitted,
        lastModified: await this.getFileLastModified(approvedFile)
      };
    } else if (pendingExists) {
      return {
        status: 'pending-review',
        approved: false,
        filePath: pendingFile,
        needsReview: true
      };
    } else {
      return {
        status: 'not-found',
        approved: false,
        needsGeneration: true
      };
    }
  }

  /**
   * Load approved content for product
   * @param {string} sku - Product SKU
   * @returns {Promise<Object>} Approved content
   */
  async loadApprovedContent(sku) {
    const approval = await this.checkContentApproval(sku);
    
    if (!approval.approved) {
      throw new Error(`Content for ${sku} is not approved. Status: ${approval.status}`);
    }
    
    const contentFile = approval.filePath;
    const content = await fs.readFile(contentFile, 'utf8');
    
    return this.parseContentFile(content, sku);
  }

  /**
   * Save content to pending review
   * @param {string} sku - Product SKU
   * @param {Object} content - Generated content
   * @returns {Promise<string>} Path to pending file
   */
  async saveContentForReview(sku, content) {
    await fs.ensureDir(this.pendingPath);
    
    const pendingFile = path.join(this.pendingPath, `${sku}.md`);
    const markdownContent = this.formatContentAsMarkdown(sku, content);
    
    await fs.writeFile(pendingFile, markdownContent, 'utf8');
    
    console.log(`📝 Content saved for review: ${pendingFile}`);
    return pendingFile;
  }

  /**
   * Approve content (move from pending to approved)
   * @param {string} sku - Product SKU
   * @param {Object} reviewData - Review metadata
   * @returns {Promise<string>} Path to approved file
   */
  async approveContent(sku, reviewData = {}) {
    const pendingFile = path.join(this.pendingPath, `${sku}.md`);
    const approvedFile = path.join(this.approvedPath, `${sku}.md`);
    
    if (!await fs.pathExists(pendingFile)) {
      throw new Error(`No pending content found for ${sku}`);
    }
    
    // Add approval metadata
    let content = await fs.readFile(pendingFile, 'utf8');
    const approvalSection = this.formatApprovalMetadata(reviewData);
    content = content.replace('## Approval History', approvalSection + '\n## Approval History');
    
    // Move to approved directory
    await fs.ensureDir(this.approvedPath);
    await fs.writeFile(approvedFile, content, 'utf8');
    await fs.remove(pendingFile);
    
    console.log(`✅ Content approved and ready for commit: ${approvedFile}`);
    console.log(`💡 Next: git add ${approvedFile} && git commit -m "feat: approve ${sku} content"`);
    
    return approvedFile;
  }
}
```

---

## 📊 **Integration with Enhancement Pipeline**

### **Modified Enhancement Workflow:**

**Phase 1: Content Approval Check**
```javascript
// Before generating new content, check approval status
const approvalStatus = await contentApprovalAgent.checkContentApproval(item.sku);

if (approvalStatus.approved) {
  // Use approved content from git repository
  const approvedContent = await contentApprovalAgent.loadApprovedContent(item.sku);
  return approvedContent;
} else if (approvalStatus.status === 'pending-review') {
  // Alert that content needs review
  console.log(`⚠️  ${item.sku} has content pending review`);
} else {
  // Generate new content and save for review
  const newContent = await narrativeAgent.createIndividualizedNarrative(item);
  await contentApprovalAgent.saveContentForReview(item.sku, newContent);
  console.log(`📝 New content generated for ${item.sku} - needs review and approval`);
}
```

**Phase 2: Git Integration**
```bash
# After content review and approval
git add content-repository/product-content/descriptions/approved/
git commit -m "feat: approve product content batch

Content reviewed and approved:
- RRV-RR-001: Metal sculpture narrative ✅  
- RRV-MC-001: Crystal bowl description ✅
- RRV-EX-002: Sunset lamp story ✅

Quality metrics:
- Uniqueness: 98%
- Cultural accuracy: 97%  
- SEO optimization: 95%
- Readability: Grade 8

Reviewed-by: content-team
Approved-date: 2025-08-03"
```

---

## 🎯 **Benefits of Git-Based Approval**

### **Quality Assurance:**
- **📝 Peer Review** - Content reviewed before approval
- **🔍 Version Control** - Track all changes and approvals
- **📊 Quality Metrics** - Measurable approval criteria
- **🛡️ Rollback Capability** - Revert to previous approved versions

### **Team Collaboration:**
- **👥 Multi-reviewer** - Different team members can review different categories
- **💬 Comments & Feedback** - Git PR/MR process for content review
- **📈 Approval Tracking** - Who approved what and when
- **🔄 Change Management** - Formal process for content updates

### **Production Safety:**
- **🚨 Approval Gates** - Only approved content reaches production
- **🎯 Quality Standards** - Consistent approval criteria
- **📚 Content Library** - Reusable approved content components
- **🔒 Audit Trail** - Complete history of content changes

---

## 🚀 **Implementation Commands**

### **Setup Content Repository:**
```bash
# Initialize content repository structure
pnpm run content:init-repository

# Import existing approved content
pnpm run content:import-existing

# Setup approval workflows
pnpm run content:setup-workflows
```

### **Daily Content Operations:**
```bash
# Check what needs review
pnpm run content:status

# Generate new content for items without approval
pnpm run content:generate-missing

# Review and approve content
pnpm run content:review-queue

# Commit approved content to git
pnpm run content:commit-approved
```

---

This system ensures **every product description is intentionally curated and approved** before it can be used in production, treating your content with the same rigor as source code! 🎉