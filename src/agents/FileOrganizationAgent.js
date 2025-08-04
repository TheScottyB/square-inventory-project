import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { logger } from '../utils/logger.js';

/**
 * FileOrganizationAgent - Intelligent file organization for inventory management
 * 
 * This agent analyzes the current file structure and organizes files into
 * logical product folders based on:
 * - File type and content
 * - Product categories from Square catalog
 * - Business context (TRTR, TBDL, TVM, etc.)
 * - Date patterns and versions
 */
export class FileOrganizationAgent extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      rootDir: config.rootDir || process.cwd(),
      targetDir: config.targetDir || 'organized-inventory',
      dryRun: config.dryRun ?? true,
      ...config
    };
    
    // File type categories
    this.fileCategories = {
      catalogs: {
        patterns: [/catalog.*\.xlsx?$/i, /catalog.*\.csv$/i],
        folder: '01-square-catalogs'
      },
      exports: {
        patterns: [/export/i, /processed-catalog/i],
        folder: '02-processed-exports'
      },
      imports: {
        patterns: [/import.*\.xlsx?$/i, /upload.*\.xlsx?$/i, /_import\.xlsx?$/i],
        folder: '03-import-templates'
      },
      images: {
        patterns: [/\.(jpg|jpeg|png|gif|heic|svg)$/i],
        folder: '04-product-images'
      },
      documents: {
        patterns: [/\.(pdf|doc|docx)$/i],
        folder: '05-business-documents'
      },
      scripts: {
        patterns: [/\.(py|js|sh)$/i],
        folder: '06-automation-scripts'
      },
      data: {
        patterns: [/\.(json|csv)$/i],
        folder: '07-data-files'
      },
      archives: {
        patterns: [/\.(zip|rar|7z|tar\.gz)$/i],
        folder: '08-archives'
      }
    };
    
    // Business entity patterns
    this.businessEntities = {
      'RRV': 'River-Ridge-Vintage',
      'TBDL': 'TBD-Labz',
      'TVM': 'The-Vintage-Merchant',
      'DrDZB': 'Dr-Dawn-Zurick-Beilfuss'
    };
    
    // Product category mappings from Square
    this.productCategories = [
      'Energy & Elements',
      'Mind & Clarity',
      'Spirit & Intention',
      'Home & Hearth',
      'DrDZB\'s Picks',
      'Recovery & Renewal',
      'Connect & Protect',
      'On the Move',
      'Fun & Function'
    ];
  }

  /**
   * Analyze current file structure
   */
  async analyzeFileStructure() {
    logger.info('Analyzing file structure...', { rootDir: this.config.rootDir });
    
    const analysis = {
      totalFiles: 0,
      categorizedFiles: {},
      uncategorizedFiles: [],
      businessEntityFiles: {},
      recommendedStructure: {}
    };
    
    try {
      const files = await this.scanDirectory(this.config.rootDir);
      analysis.totalFiles = files.length;
      
      // Categorize files
      for (const file of files) {
        const categorized = await this.categorizeFile(file);
        
        if (categorized.category) {
          if (!analysis.categorizedFiles[categorized.category]) {
            analysis.categorizedFiles[categorized.category] = [];
          }
          analysis.categorizedFiles[categorized.category].push({
            path: file,
            ...categorized
          });
        } else {
          analysis.uncategorizedFiles.push(file);
        }
        
        // Check for business entity
        if (categorized.businessEntity) {
          if (!analysis.businessEntityFiles[categorized.businessEntity]) {
            analysis.businessEntityFiles[categorized.businessEntity] = [];
          }
          analysis.businessEntityFiles[categorized.businessEntity].push(file);
        }
      }
      
      // Generate recommended structure
      analysis.recommendedStructure = this.generateRecommendedStructure(analysis);
      
      this.emit('analysis:complete', analysis);
      return analysis;
      
    } catch (error) {
      logger.error('Error analyzing file structure:', error);
      this.emit('analysis:error', error);
      throw error;
    }
  }

  /**
   * Scan directory recursively
   */
  async scanDirectory(dir, baseDir = null) {
    baseDir = baseDir || dir;
    const files = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);
        
        // Skip certain directories
        if (entry.isDirectory()) {
          const skipDirs = ['node_modules', '.git', 'coverage', '__pycache__'];
          if (skipDirs.includes(entry.name)) continue;
          
          // Recursively scan subdirectories
          const subFiles = await this.scanDirectory(fullPath, baseDir);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // Skip hidden files and temp files
          if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue;
          
          files.push(relativePath);
        }
      }
      
      return files;
      
    } catch (error) {
      logger.error(`Error scanning directory ${dir}:`, error);
      return files;
    }
  }

  /**
   * Categorize a file based on patterns and content
   */
  async categorizeFile(filePath) {
    const fileName = path.basename(filePath);
    const result = {
      fileName,
      category: null,
      subCategory: null,
      businessEntity: null,
      date: null,
      productCategory: null
    };
    
    // Check file type categories
    for (const [category, config] of Object.entries(this.fileCategories)) {
      for (const pattern of config.patterns) {
        if (pattern.test(fileName)) {
          result.category = category;
          break;
        }
      }
      if (result.category) break;
    }
    
    // Check for business entity
    for (const [code, name] of Object.entries(this.businessEntities)) {
      if (fileName.includes(code) || fileName.toLowerCase().includes(name.toLowerCase())) {
        result.businessEntity = name;
        break;
      }
    }
    
    // Extract date if present
    const datePatterns = [
      /(\d{4}-\d{2}-\d{2})/,
      /(\d{4}-\d{1,2}-\d{1,2})/,
      /(\d{8})/
    ];
    
    for (const pattern of datePatterns) {
      const match = fileName.match(pattern);
      if (match) {
        result.date = match[1];
        break;
      }
    }
    
    // Special handling for Square catalog files
    if (result.category === 'catalogs' || result.category === 'exports') {
      result.subCategory = this.determineSubCategory(fileName);
    }
    
    return result;
  }

  /**
   * Determine subcategory for special files
   */
  determineSubCategory(fileName) {
    const lowerName = fileName.toLowerCase();
    
    if (lowerName.includes('seo')) return 'seo-enhanced';
    if (lowerName.includes('processed')) return 'processed';
    if (lowerName.includes('enriched')) return 'enriched';
    if (lowerName.includes('final')) return 'final-versions';
    if (lowerName.includes('backup')) return 'backups';
    if (lowerName.includes('archive')) return 'archives';
    
    return null;
  }

  /**
   * Generate recommended folder structure
   */
  generateRecommendedStructure(analysis) {
    const structure = {
      'organized-inventory': {
        '00-active-working-files': {
          'current-catalog': 'Latest Square catalog export',
          'import-templates': 'Active import templates',
          'in-progress': 'Files currently being processed'
        },
        '01-square-catalogs': {
          'exports-by-date': 'Original Square exports organized by date',
          'processed': 'Processed catalog files',
          'seo-enhanced': 'SEO-enhanced versions'
        },
        '02-business-entities': {}
      }
    };
    
    // Add business entity folders
    for (const entity of Object.values(this.businessEntities)) {
      structure['organized-inventory']['02-business-entities'][entity] = {
        'catalogs': 'Entity-specific catalogs',
        'documents': 'Business documents',
        'images': 'Product images'
      };
    }
    
    // Add remaining categories
    structure['organized-inventory']['03-automation'] = {
      'scripts': 'Automation scripts',
      'data': 'JSON and CSV data files',
      'logs': 'Processing logs'
    };
    
    structure['organized-inventory']['04-archive'] = {
      'by-date': 'Historical files by date',
      'superseded': 'Old versions replaced by newer files'
    };
    
    return structure;
  }

  /**
   * Organize files into recommended structure
   */
  async organizeFiles(analysis = null) {
    if (!analysis) {
      analysis = await this.analyzeFileStructure();
    }
    
    logger.info('Starting file organization...', { 
      dryRun: this.config.dryRun,
      totalFiles: analysis.totalFiles 
    });
    
    const operations = [];
    const targetBase = path.join(this.config.rootDir, this.config.targetDir);
    
    try {
      // Create base directory structure
      if (!this.config.dryRun) {
        await this.createDirectoryStructure(targetBase);
      }
      
      // Organize categorized files
      for (const [category, files] of Object.entries(analysis.categorizedFiles)) {
        const categoryConfig = this.fileCategories[category];
        if (!categoryConfig) continue;
        
        for (const fileInfo of files) {
          const targetPath = this.determineTargetPath(fileInfo, categoryConfig, targetBase);
          
          operations.push({
            source: path.join(this.config.rootDir, fileInfo.path),
            target: targetPath,
            action: 'move',
            category,
            fileInfo
          });
        }
      }
      
      // Execute operations
      const results = await this.executeOperations(operations);
      
      // Generate organization report
      const report = this.generateOrganizationReport(results);
      
      this.emit('organization:complete', report);
      return report;
      
    } catch (error) {
      logger.error('Error organizing files:', error);
      this.emit('organization:error', error);
      throw error;
    }
  }

  /**
   * Create directory structure
   */
  async createDirectoryStructure(baseDir) {
    const structure = this.generateRecommendedStructure({});
    
    async function createDirs(obj, currentPath) {
      for (const [key, value] of Object.entries(obj)) {
        const newPath = path.join(currentPath, key);
        
        if (typeof value === 'object') {
          await fs.mkdir(newPath, { recursive: true });
          await createDirs(value, newPath);
        }
      }
    }
    
    await createDirs(structure, baseDir);
  }

  /**
   * Determine target path for a file
   */
  determineTargetPath(fileInfo, categoryConfig, targetBase) {
    let targetDir = path.join(targetBase, categoryConfig.folder);
    
    // Add business entity subfolder if applicable
    if (fileInfo.businessEntity) {
      targetDir = path.join(targetBase, '02-business-entities', fileInfo.businessEntity, categoryConfig.folder);
    }
    
    // Add date-based subfolder for catalogs
    if (fileInfo.category === 'catalogs' && fileInfo.date) {
      const year = fileInfo.date.substring(0, 4);
      targetDir = path.join(targetDir, year);
    }
    
    // Add subcategory folder
    if (fileInfo.subCategory) {
      targetDir = path.join(targetDir, fileInfo.subCategory);
    }
    
    return path.join(targetDir, fileInfo.fileName);
  }

  /**
   * Execute file operations
   */
  async executeOperations(operations) {
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };
    
    for (const op of operations) {
      try {
        if (this.config.dryRun) {
          logger.info('DRY RUN - Would move:', {
            from: op.source,
            to: op.target
          });
          results.successful.push(op);
        } else {
          // Create target directory
          await fs.mkdir(path.dirname(op.target), { recursive: true });
          
          // Move file
          await fs.rename(op.source, op.target);
          
          logger.info('Moved file:', {
            from: op.source,
            to: op.target
          });
          
          results.successful.push(op);
        }
      } catch (error) {
        logger.error('Failed to move file:', {
          from: op.source,
          to: op.target,
          error: error.message
        });
        
        op.error = error.message;
        results.failed.push(op);
      }
    }
    
    return results;
  }

  /**
   * Generate organization report
   */
  generateOrganizationReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      dryRun: this.config.dryRun,
      summary: {
        totalOperations: results.successful.length + results.failed.length,
        successful: results.successful.length,
        failed: results.failed.length
      },
      categorySummary: {},
      businessEntitySummary: {},
      operations: results
    };
    
    // Summarize by category
    for (const op of results.successful) {
      if (!report.categorySummary[op.category]) {
        report.categorySummary[op.category] = 0;
      }
      report.categorySummary[op.category]++;
      
      if (op.fileInfo.businessEntity) {
        if (!report.businessEntitySummary[op.fileInfo.businessEntity]) {
          report.businessEntitySummary[op.fileInfo.businessEntity] = 0;
        }
        report.businessEntitySummary[op.fileInfo.businessEntity]++;
      }
    }
    
    return report;
  }
}

export default FileOrganizationAgent;