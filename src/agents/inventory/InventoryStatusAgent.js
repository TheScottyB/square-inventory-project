#!/usr/bin/env node

import { EventEmitter } from 'events';
import { CatalogObserver } from '../../observability/CatalogObserver.js';

/**
 * InventoryStatusAgent - Manage product visibility and availability states
 * 
 * Handles Square's product visibility system:
 * - ACTIVE: Available for purchase, visible in catalog
 * - VISIBLE: Visible in catalog but may not be purchasable 
 * - HIDDEN: Not visible in catalog but available for direct link
 * - UNAVAILABLE: Not available for purchase, inventory tracking
 * - ARCHIVED: Historical record, not active in any way
 * 
 * Also manages inventory levels and stock status
 */
export class InventoryStatusAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableDryRun: options.enableDryRun || false,
      autoArchiveThreshold: options.autoArchiveThreshold || 180, // days
      lowStockThreshold: options.lowStockThreshold || 5,
      zeroStockAction: options.zeroStockAction || 'unavailable', // 'unavailable' | 'hidden' | 'maintain'
      ...options
    };

    // Square visibility states
    this.visibilityStates = {
      ACTIVE: {
        visible: true,
        purchasable: true,
        trackInventory: true,
        description: 'Available for purchase and visible in catalog'
      },
      VISIBLE: {
        visible: true,
        purchasable: false,
        trackInventory: true,
        description: 'Visible in catalog but not purchasable'
      },
      HIDDEN: {
        visible: false,
        purchasable: true,
        trackInventory: true,
        description: 'Available via direct link but not visible in catalog'
      },
      UNAVAILABLE: {
        visible: false,
        purchasable: false,
        trackInventory: true,
        description: 'Not available for purchase, inventory tracking only'
      },
      ARCHIVED: {
        visible: false,
        purchasable: false,
        trackInventory: false,
        description: 'Historical record, completely inactive'
      }
    };

    // Status transition rules
    this.statusTransitions = {
      ACTIVE: ['VISIBLE', 'HIDDEN', 'UNAVAILABLE', 'ARCHIVED'],
      VISIBLE: ['ACTIVE', 'HIDDEN', 'UNAVAILABLE', 'ARCHIVED'],
      HIDDEN: ['ACTIVE', 'VISIBLE', 'UNAVAILABLE', 'ARCHIVED'],
      UNAVAILABLE: ['ACTIVE', 'VISIBLE', 'HIDDEN', 'ARCHIVED'],
      ARCHIVED: ['ACTIVE', 'VISIBLE', 'HIDDEN', 'UNAVAILABLE'] // Can restore from archive
    };

    // Automated status rules
    this.automationRules = {
      zeroStock: {
        condition: (item) => item.quantity === 0,
        action: this.options.zeroStockAction.toUpperCase(),
        reason: 'Out of stock'
      },
      lowStock: {
        condition: (item) => item.quantity > 0 && item.quantity <= this.options.lowStockThreshold,
        action: 'VISIBLE', // Keep visible but flag for attention
        reason: 'Low stock warning'
      },
      oldItem: {
        condition: (item) => this.daysSinceLastUpdate(item) > this.options.autoArchiveThreshold,
        action: 'ARCHIVED',
        reason: 'Inactive for extended period'
      },
      backInStock: {
        condition: (item) => item.quantity > this.options.lowStockThreshold && item.status !== 'ACTIVE',
        action: 'ACTIVE',
        reason: 'Stock replenished'
      }
    };

    // Initialize observability
    this.observer = new CatalogObserver({
      enableFileLogging: !this.options.enableDryRun,
      enableMetrics: true,
      enableTracing: true,
      logLevel: process.env.LOG_LEVEL || 'info',
      logsDirectory: './logs/inventory-status'
    });

    this.stats = {
      statusUpdates: 0,
      automatedChanges: 0,
      manualChanges: 0,
      itemsAnalyzed: 0,
      archivedItems: 0,
      reactivatedItems: 0
    };
  }

  /**
   * Analyze and recommend status changes for catalog items
   * @param {Array} catalogData - Catalog items to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Status analysis and recommendations
   */
  async analyzeInventoryStatus(catalogData, options = {}) {
    const traceId = this.observer.startTrace('analyze_inventory_status');
    
    try {
      this.observer.log('info', `Analyzing inventory status for ${catalogData.length} items`);
      
      const analysis = {
        totalItems: catalogData.length,
        statusBreakdown: {},
        recommendations: [],
        automatedChanges: [],
        warnings: [],
        opportunities: []
      };

      // Initialize status breakdown
      Object.keys(this.visibilityStates).forEach(status => {
        analysis.statusBreakdown[status] = 0;
      });

      // Process each item
      for (const item of catalogData) {
        const itemAnalysis = this.analyzeItemStatus(item);
        
        // Update status breakdown
        if (itemAnalysis.currentStatus) {
          analysis.statusBreakdown[itemAnalysis.currentStatus]++;
        }

        // Add recommendations
        if (itemAnalysis.recommendedStatus !== itemAnalysis.currentStatus) {
          analysis.recommendations.push({
            sku: item.sku || item.itemName,
            itemName: item.itemName,
            currentStatus: itemAnalysis.currentStatus,
            recommendedStatus: itemAnalysis.recommendedStatus,
            reason: itemAnalysis.reason,
            priority: itemAnalysis.priority,
            automated: itemAnalysis.automated
          });

          if (itemAnalysis.automated) {
            analysis.automatedChanges.push(itemAnalysis);
          }
        }

        // Add warnings for attention items
        if (itemAnalysis.warnings.length > 0) {
          analysis.warnings.push({
            sku: item.sku || item.itemName,
            warnings: itemAnalysis.warnings
          });
        }

        // Identify opportunities
        if (itemAnalysis.opportunities.length > 0) {
          analysis.opportunities.push({
            sku: item.sku || item.itemName,
            opportunities: itemAnalysis.opportunities
          });
        }

        this.stats.itemsAnalyzed++;
      }

      // Generate summary insights
      analysis.insights = this.generateStatusInsights(analysis);

      this.observer.log('info', `Status analysis completed: ${analysis.recommendations.length} recommendations`);
      this.observer.endTrace(traceId, {
        totalItems: analysis.totalItems,
        recommendations: analysis.recommendations.length,
        automatedChanges: analysis.automatedChanges.length
      });

      return analysis;

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw new Error(`Inventory status analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze individual item status
   * @param {Object} item - Catalog item
   * @returns {Object} Item status analysis
   */
  analyzeItemStatus(item) {
    const analysis = {
      sku: item.sku || item.itemName,
      currentStatus: this.determineCurrentStatus(item),
      recommendedStatus: null,
      reason: null,
      priority: 'medium',
      automated: false,
      warnings: [],
      opportunities: []
    };

    // Check automation rules
    for (const [ruleName, rule] of Object.entries(this.automationRules)) {
      if (rule.condition(item)) {
        analysis.recommendedStatus = rule.action;
        analysis.reason = rule.reason;
        analysis.automated = true;
        
        if (ruleName === 'zeroStock' || ruleName === 'oldItem') {
          analysis.priority = 'high';
        }
        break;
      }
    }

    // If no automated rule applies, keep current status
    if (!analysis.recommendedStatus) {
      analysis.recommendedStatus = analysis.currentStatus;
    }

    // Generate warnings
    if (item.quantity === 0 && analysis.currentStatus === 'ACTIVE') {
      analysis.warnings.push('Item is active but out of stock');
    }

    if (item.quantity > 0 && analysis.currentStatus === 'UNAVAILABLE') {
      analysis.warnings.push('Item has stock but is marked unavailable');
    }

    if (this.daysSinceLastUpdate(item) > 30 && analysis.currentStatus === 'ACTIVE') {
      analysis.warnings.push('Active item not updated in 30+ days');
    }

    // Identify opportunities
    if (item.quantity > this.options.lowStockThreshold && analysis.currentStatus === 'HIDDEN') {
      analysis.opportunities.push('Well-stocked item could be made visible');
    }

    if (item.price && item.quantity > 0 && analysis.currentStatus === 'VISIBLE') {
      analysis.opportunities.push('Visible item with stock could be made active for sales');
    }

    return analysis;
  }

  /**
   * Determine current status from item data
   * @param {Object} item - Catalog item
   * @returns {string} Current status
   */
  determineCurrentStatus(item) {
    // This would be based on actual Square catalog export columns
    // For now, using heuristics based on available data
    
    if (item.status) {
      return item.status.toUpperCase();
    }

    // Heuristic determination
    if (item.quantity === 0) {
      return 'UNAVAILABLE';
    }

    if (item.price && item.quantity > 0) {
      return 'ACTIVE';
    }

    if (item.visible === false) {
      return 'HIDDEN';
    }

    return 'ACTIVE'; // Default assumption
  }

  /**
   * Calculate days since last update
   * @param {Object} item - Catalog item
   * @returns {number} Days since last update
   */
  daysSinceLastUpdate(item) {
    if (!item.lastUpdated && !item.modifiedAt) {
      return 0; // Can't determine, assume recent
    }

    const lastUpdate = new Date(item.lastUpdated || item.modifiedAt);
    const now = new Date();
    return Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));
  }

  /**
   * Generate status insights and recommendations
   * @param {Object} analysis - Status analysis
   * @returns {Object} Insights and recommendations
   */
  generateStatusInsights(analysis) {
    const insights = {
      summary: [],
      recommendations: [],
      priorities: []
    };

    // Status distribution insights
    const activeCount = analysis.statusBreakdown.ACTIVE || 0;
    const archivedCount = analysis.statusBreakdown.ARCHIVED || 0;
    const unavailableCount = analysis.statusBreakdown.UNAVAILABLE || 0;

    const activePercentage = (activeCount / analysis.totalItems) * 100;
    insights.summary.push(`${activePercentage.toFixed(1)}% of items are currently active`);

    if (archivedCount > 0) {
      const archivedPercentage = (archivedCount / analysis.totalItems) * 100;
      insights.summary.push(`${archivedPercentage.toFixed(1)}% of items are archived`);
    }

    // Recommendations based on analysis
    if (analysis.automatedChanges.length > 0) {
      insights.recommendations.push(`${analysis.automatedChanges.length} items can be automatically updated`);
    }

    if (analysis.warnings.length > 0) {
      insights.recommendations.push(`${analysis.warnings.length} items need attention`);
    }

    if (analysis.opportunities.length > 0) {
      insights.recommendations.push(`${analysis.opportunities.length} items have improvement opportunities`);
    }

    // Priority actions
    const highPriorityChanges = analysis.recommendations.filter(r => r.priority === 'high');
    if (highPriorityChanges.length > 0) {
      insights.priorities.push(`${highPriorityChanges.length} high-priority status changes needed`);
    }

    return insights;
  }

  /**
   * Apply status changes to catalog data
   * @param {Array} catalogData - Catalog data
   * @param {Array} statusChanges - Status changes to apply
   * @param {Object} options - Application options
   * @returns {Promise<Object>} Application results
   */
  async applyStatusChanges(catalogData, statusChanges, options = {}) {
    const traceId = this.observer.startTrace('apply_status_changes');
    
    try {
      const results = {
        applied: 0,
        skipped: 0,
        errors: 0,
        details: []
      };

      for (const change of statusChanges) {
        try {
          const item = catalogData.find(item => 
            (item.sku && item.sku === change.sku) || 
            item.itemName === change.sku
          );

          if (!item) {
            results.skipped++;
            results.details.push({
              sku: change.sku,
              status: 'skipped',
              reason: 'Item not found'
            });
            continue;
          }

          // Validate status transition
          if (!this.isValidTransition(change.currentStatus, change.recommendedStatus)) {
            results.skipped++;
            results.details.push({
              sku: change.sku,
              status: 'skipped',
              reason: `Invalid transition: ${change.currentStatus} -> ${change.recommendedStatus}`
            });
            continue;
          }

          // Apply the change (in dry run, just log it)
          if (!this.options.enableDryRun) {
            item.status = change.recommendedStatus;
            item.statusUpdatedAt = new Date().toISOString();
            item.statusReason = change.reason;
          }

          results.applied++;
          results.details.push({
            sku: change.sku,
            status: 'applied',
            from: change.currentStatus,
            to: change.recommendedStatus,
            reason: change.reason
          });

          this.stats.statusUpdates++;
          if (change.automated) {
            this.stats.automatedChanges++;
          } else {
            this.stats.manualChanges++;
          }

        } catch (error) {
          results.errors++;
          results.details.push({
            sku: change.sku,
            status: 'error',
            error: error.message
          });
        }
      }

      this.observer.log('info', `Status changes applied: ${results.applied} successful, ${results.errors} errors`);
      this.observer.endTrace(traceId, results);

      return results;

    } catch (error) {
      this.observer.endTrace(traceId, null, error);
      throw new Error(`Failed to apply status changes: ${error.message}`);
    }
  }

  /**
   * Check if status transition is valid
   * @param {string} fromStatus - Current status
   * @param {string} toStatus - Target status
   * @returns {boolean} Is transition valid
   */
  isValidTransition(fromStatus, toStatus) {
    if (!fromStatus || !toStatus) return false;
    if (fromStatus === toStatus) return true;
    
    const allowedTransitions = this.statusTransitions[fromStatus];
    return allowedTransitions && allowedTransitions.includes(toStatus);
  }

  /**
   * Get visibility state information
   * @param {string} status - Status to query
   * @returns {Object} Visibility state info
   */
  getVisibilityState(status) {
    return this.visibilityStates[status] || null;
  }

  /**
   * Get processing statistics
   * @returns {Object} Current stats
   */
  getProcessingStats() {
    return { ...this.stats };
  }
}