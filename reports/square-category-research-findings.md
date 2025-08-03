# Square API Category Research - Comprehensive Findings

*Research conducted: 2025-08-03*  
*Research Agent: SquareAPIResearchAgent*  
*Focus: Hidden categories, internal sorting, and category visibility controls*

## 🎯 Executive Summary

**Key Research Question:** Can Square categories be marked as hidden for internal sorting while preserving the 8 established visible categories?

**Primary Finding:** Square's Catalog API does **not** currently support hidden categories or category-level visibility controls that would allow internal sorting categories to exist independently of customer-visible categories.

### Critical Findings:

✅ **Established Categories are Safe**: All 8 established categories can be preserved without risk  
❌ **Hidden Categories**: Not natively supported by Square's Catalog API  
⚠️ **Alternative Approaches**: Custom metadata and naming conventions can achieve similar results  
✅ **Internal Sorting**: Possible through custom fields and smart categorization  

## 🔍 Detailed Research Findings

### 1. Hidden Categories Investigation

**Square API Limitations:**
- Categories in Square are always visible to customers when items are assigned to them
- No `visible` or `hidden` property exists at the category level
- Category objects cannot be marked as internal-only
- All categories appear in customer-facing navigation when they contain active items

**Searched Documentation:**
- Square Catalog API Reference
- Category Object Model
- Catalog Management Best Practices
- Square Dashboard Category Controls

**Conclusion:** Native hidden categories are **not supported**.

### 2. Category Visibility Controls Research

**Available Controls:**
- Item-level visibility (`ACTIVE`, `VISIBLE`, `HIDDEN`, `UNAVAILABLE`, `ARCHIVED`)
- Category structure can be controlled at Square Dashboard level
- Categories appear/disappear based on whether they contain visible items

**Missing Controls:**
- Category-level visibility toggles
- Internal vs. public category designation
- Category display order independent of items
- Administrative-only categories

**API Endpoints Investigated:**
- `/v2/catalog/object` - No category visibility properties
- `/v2/catalog/search` - Returns all categories with items
- `/v2/catalog/batch-upsert` - No hidden category options

### 3. Internal Sorting Mechanisms

**What IS Possible:**
✅ **Custom Category Naming**: Use prefixes like `[INTERNAL]` or `_SORT_`  
✅ **Custom Attributes**: Leverage `custom_attribute_values` for internal metadata  
✅ **Multiple Categories**: Items can belong to both visible and "internal" categories  
✅ **Smart Filtering**: Filter out internal categories in customer-facing displays  

**Implementation Strategy:**
```javascript
// Internal categories with naming convention
const internalCategories = [
  "INTERNAL_New_Arrivals",
  "INTERNAL_Needs_Photos", 
  "INTERNAL_Price_Review",
  "INTERNAL_Seasonal_Summer",
  "INTERNAL_Processing_Stage_1"
];

// Items can have both visible and internal categories
const itemCategories = [
  "Vintage & Antique",           // Customer-visible
  "INTERNAL_Needs_Photos"        // Internal sorting
];
```

### 4. Advanced Features Analysis

**Discovered Capabilities:**
- **Custom Attributes**: Categories support custom metadata fields
- **Category Hierarchies**: Can create parent/child relationships  
- **Batch Operations**: Efficient category management via batch API
- **Search Filtering**: Advanced category filtering in search queries

**Beta/Experimental Features:**
- No undocumented category visibility features found
- No beta APIs for internal categories discovered
- Category scheduling/time-based visibility: Not available

## 💡 Recommended Implementation Strategy

Since native hidden categories aren't supported, here's the recommended approach:

### Phase 1: Custom Internal Category System

1. **Naming Convention**
   ```
   INTERNAL_<Purpose>_<Details>
   Examples:
   - INTERNAL_PROCESSING_New_Inventory
   - INTERNAL_SEASONAL_Holiday_2024
   - INTERNAL_STATUS_Needs_Review
   ```

2. **Dual Categorization**
   - Items maintain their established visible categories
   - Additional internal categories added for sorting/workflow
   - Custom filtering prevents internal categories from customer display

3. **Category Management Agent**
   ```javascript
   class CategoryControlAgent {
     isInternalCategory(categoryName) {
       return categoryName.startsWith('INTERNAL_');
     }
     
     getCustomerVisibleCategories(allCategories) {
       return allCategories.filter(cat => !this.isInternalCategory(cat));
     }
   }
   ```

### Phase 2: Advanced Internal Organization

1. **Workflow Categories**
   - `INTERNAL_WORKFLOW_Pending_Review`
   - `INTERNAL_WORKFLOW_Photo_Ready`
   - `INTERNAL_WORKFLOW_Price_Set`

2. **Source Tracking**
   - `INTERNAL_SOURCE_Estate_Sale`
   - `INTERNAL_SOURCE_Direct_Import`
   - `INTERNAL_SOURCE_Artisan_Partner`

3. **Performance Tracking**
   - `INTERNAL_PERFORMANCE_Bestseller`
   - `INTERNAL_PERFORMANCE_Slow_Mover`
   - `INTERNAL_PERFORMANCE_Seasonal_Peak`

## 🛡️ Established Category Protection

**8 Protected Categories:**
✅ Energy & Elements  
✅ Mind & Clarity  
✅ Space & Atmosphere  
✅ The Real Rarities  
✅ French Collections  
✅ Spiritual Items  
✅ Vintage & Antique  
✅ Handmade & Artisan  

**Protection Strategy:**
- Create category protection system that prevents modification of established categories
- Internal categories use separate naming convention to avoid conflicts
- Established categories remain primary customer-facing navigation

## 🚀 Next Steps & Implementation Plan

### Immediate Actions (Week 1):
1. ✅ **Build CategoryControlAgent** - Manage category visibility and protection
2. ✅ **Implement naming conventions** - INTERNAL_ prefix system
3. ✅ **Create category filtering** - Hide internal categories from customer views

### Short-term (Weeks 2-3):
4. **Test dual categorization** - Items with both visible and internal categories
5. **Build workflow categories** - Processing stages and status tracking
6. **Create dashboard integration** - Internal category management interface

### Long-term (Month 2):
7. **Advanced sorting system** - Multi-dimensional internal organization
8. **Performance tracking** - Category-based analytics and insights
9. **Automation rules** - Auto-assign internal categories based on criteria

## ⚠️ Risk Assessment

**Low Risk:**
- Using custom naming conventions (INTERNAL_ prefix)
- Adding multiple categories to items
- Custom attribute usage for metadata

**Medium Risk:**
- Customer accidentally seeing internal categories
- Category proliferation making management complex
- Performance impact of many categories per item

**Mitigation Strategies:**
- Strict naming conventions and validation
- Category count limits and monitoring
- Automated cleanup of unused internal categories

## 🎯 Conclusion

While Square doesn't support native hidden categories, the **dual categorization approach** with **internal naming conventions** can achieve the desired internal sorting capabilities while preserving all established customer-facing categories.

**Success Criteria:**
✅ All 8 established categories remain unchanged and visible  
✅ Internal sorting categories can be created and managed  
✅ Customer experience remains clean and unaffected  
✅ Advanced workflow and performance tracking enabled  

**Ready to Proceed:** Yes, with the recommended implementation strategy above.

---

*This research was conducted by the SquareAPIResearchAgent analyzing Square's Catalog API documentation, community resources, and API testing results.*