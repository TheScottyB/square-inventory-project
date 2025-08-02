/**
 * Image filtering utility to identify and reject non-product images
 * This helps ensure only actual retail products are processed for inventory
 */

import path from 'path';

/**
 * Patterns to identify non-product images that should be filtered out
 */
const NON_PRODUCT_PATTERNS = {
  // Development/build artifacts
  filenames: [
    'jest_logo.png',
    'favicon.png',
    'sort-arrow-sprite.png',
    'CR_logotype-full-color.png',
    'jest_logo.png'
  ],
  
  // Path patterns that indicate non-product content
  pathPatterns: [
    /node_modules/,
    /\.git/,
    /build/,
    /dist/,
    /coverage/,
    /\.github/,
    /assets\/[^\/]*\.(png|jpg|jpeg|gif|svg)$/i, // Generic asset files
  ],
  
  // Marketing/documentation content
  marketingPatterns: [
    /buyer_flyer/i,
    /flyer/i,
    /logo/i,
    /branding/i,
    /marketing/i,
    /advertisement/i,
    /promo/i,
    /banner/i,
  ],
  
  // Technical/UI elements
  technicalPatterns: [
    /icon/i,
    /sprite/i,
    /favicon/i,
    /arrow/i,
    /button/i,
    /ui_/i,
    /interface/i,
  ]
};

/**
 * Categories that indicate non-product content
 */
const NON_PRODUCT_CATEGORIES = [
  'Digital Assets',
  'Assets', 
  'Branding',
  'Marketing Materials',
  'UI Elements',
  'Icons',
  'Development Tools'
];

/**
 * Check if an image file should be filtered out as non-product content
 * @param {string} imagePath - Full path to the image file
 * @returns {Object} Filter result with isFiltered boolean and reason
 */
export function shouldFilterImage(imagePath) {
  const filename = path.basename(imagePath);
  const fullPath = imagePath.toLowerCase();
  
  // Check exact filename matches
  if (NON_PRODUCT_PATTERNS.filenames.includes(filename)) {
    return {
      isFiltered: true,
      reason: `Excluded filename: ${filename}`,
      category: 'system-file'
    };
  }
  
  // Check path patterns
  for (const pattern of NON_PRODUCT_PATTERNS.pathPatterns) {
    if (pattern.test(fullPath)) {
      return {
        isFiltered: true,
        reason: `Excluded path pattern: ${pattern.source}`,
        category: 'system-path'
      };
    }
  }
  
  // Check marketing patterns
  for (const pattern of NON_PRODUCT_PATTERNS.marketingPatterns) {
    if (pattern.test(filename)) {
      return {
        isFiltered: true,
        reason: `Marketing content: ${pattern.source}`,
        category: 'marketing'
      };
    }
  }
  
  // Check technical patterns
  for (const pattern of NON_PRODUCT_PATTERNS.technicalPatterns) {
    if (pattern.test(filename)) {
      return {
        isFiltered: true,
        reason: `Technical asset: ${pattern.source}`,
        category: 'technical'
      };
    }
  }
  
  return {
    isFiltered: false,
    reason: null,
    category: 'product'
  };
}

/**
 * Check if an analysis result represents a non-product item based on category
 * @param {Object} analysisResult - The analysis result from vision AI
 * @returns {Object} Filter result with isFiltered boolean and reason
 */
export function shouldFilterAnalysisResult(analysisResult) {
  const { category, tags = [], productName = '' } = analysisResult;
  
  // Check if category indicates non-product content
  if (NON_PRODUCT_CATEGORIES.includes(category)) {
    return {
      isFiltered: true,
      reason: `Non-product category: ${category}`,
      category: 'non-product-category'
    };
  }
  
  // Check for technical/marketing indicators in tags
  const technicalTags = ['logo', 'icon', 'sprite', 'asset', 'branding', 'marketing', 'ui'];
  const hasTechnicalTags = tags.some(tag => 
    technicalTags.some(techTag => tag.toLowerCase().includes(techTag))
  );
  
  if (hasTechnicalTags) {
    return {
      isFiltered: true,
      reason: `Technical/marketing tags detected: ${tags.join(', ')}`,
      category: 'technical-tags'
    };
  }
  
  // Check product name for non-product indicators
  const nonProductNames = ['logo', 'icon', 'sprite', 'flyer', 'banner', 'asset'];
  const hasNonProductName = nonProductNames.some(name => 
    productName.toLowerCase().includes(name)
  );
  
  if (hasNonProductName) {
    return {
      isFiltered: true,
      reason: `Non-product name detected: ${productName}`,
      category: 'non-product-name'
    };
  }
  
  return {
    isFiltered: false,
    reason: null,
    category: 'product'
  };
}

/**
 * Filter a list of image paths, removing non-product images
 * @param {string[]} imagePaths - Array of image file paths
 * @returns {Object} Object with filtered paths and excluded items
 */
export function filterImagePaths(imagePaths) {
  const filtered = [];
  const excluded = [];
  
  for (const imagePath of imagePaths) {
    const filterResult = shouldFilterImage(imagePath);
    
    if (filterResult.isFiltered) {
      excluded.push({
        path: imagePath,
        reason: filterResult.reason,
        category: filterResult.category
      });
    } else {
      filtered.push(imagePath);
    }
  }
  
  return {
    filtered,
    excluded,
    stats: {
      total: imagePaths.length,
      kept: filtered.length,
      excluded: excluded.length
    }
  };
}

/**
 * Filter analysis results, removing non-product items
 * @param {Object[]} analysisResults - Array of analysis results
 * @returns {Object} Object with filtered results and excluded items
 */
export function filterAnalysisResults(analysisResults) {
  const filtered = [];
  const excluded = [];
  
  for (const result of analysisResults) {
    const filterResult = shouldFilterAnalysisResult(result);
    
    if (filterResult.isFiltered) {
      excluded.push({
        ...result,
        filterReason: filterResult.reason,
        filterCategory: filterResult.category
      });
    } else {
      filtered.push(result);
    }
  }
  
  return {
    filtered,
    excluded,
    stats: {
      total: analysisResults.length,
      kept: filtered.length,
      excluded: excluded.length
    }
  };
}
