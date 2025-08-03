# 🔄 Square Variants & SKU Structure Guide

**Understanding how Square organizes products with variations and options**

---

## 🎯 **Core Concept: Square's Product Structure**

Square organizes products in a **hierarchical structure**:

```
Product (Item Name)
├── Variation 1 (with SKU)
├── Variation 2 (with SKU)  
└── Variation 3 (with SKU)
```

### **Key Insight:**
- **Item Name** = Product Group (shared by all variations)
- **Variation Name** = Individual product variant 
- **SKU** = Unique identifier for each variation
- **Options** = The attributes that differentiate variations (color, size, etc.)

---

## 📊 **Square Catalog Export Structure**

When you export from Square, here's what each column means:

| Column | Field | Purpose | Example |
|--------|-------|---------|---------|
| 2 | **Item Name** | Product group identifier | "Vintage Crystal Bowl" |
| 3 | **Variation Name** | Individual variation | "Small", "Large", "Blue" |
| 4 | **SKU** | Unique variation code | "RRV-CB-001-S" |
| 6 | **Categories** | Product classification | "Energy & Elements" |
| 28 | **Option Name 1** | First attribute type | "Size" |
| 29 | **Option Value 1** | First attribute value | "Small" |
| 30 | **Option Name 2** | Second attribute type | "Color" |  
| 31 | **Option Value 2** | Second attribute value | "Blue" |

---

## 🔍 **Real Example from Your Catalog**

### **Product: "Vintage Crystal Bowl"**

| Row | Item Name | Variation | SKU | Option 1 | Value 1 | Option 2 | Value 2 |
|-----|-----------|-----------|-----|----------|---------|----------|---------|
| 1 | Vintage Crystal Bowl | Small | RRV-CB-001-S | Size | Small | - | - |
| 2 | Vintage Crystal Bowl | Large | RRV-CB-001-L | Size | Large | - | - |
| 3 | Vintage Crystal Bowl | Blue Small | RRV-CB-001-BLU-S | Color | Blue | Size | Small |

**Understanding:**
- **3 variations** of the same product
- **Same Item Name** groups them together
- **Different SKUs** for inventory tracking
- **Options define the differences** (Size, Color)

---

## 🏗️ **SKU Generation Logic**

Our `CorrectSKUAgent` follows this pattern:

### **Base SKU Format:**
```
{Brand}-{Category}-{Sequence}
RRV-CB-001
```

### **Variation SKU Format:**
```  
{Base SKU}-{Option1}-{Option2}
RRV-CB-001-BLU-S
```

### **SKU Components:**
- **RRV** = Brand prefix (River Ridge Vintage)
- **CB** = Category abbreviation (Crystal Bowls)
- **001** = Sequential number within category
- **BLU** = Option 1 abbreviation (Blue color)
- **S** = Option 2 abbreviation (Small size)

---

## 🎨 **Option Abbreviations**

The system automatically abbreviates common options:

### **Colors:**
- Black → BLK
- White → WHT  
- Red → RED
- Blue → BLU
- Green → GRN
- Purple → PRP

### **Sizes:**
- Small → S
- Medium → M
- Large → L
- Extra Large → XL

### **Materials:**
- Steel → STL
- Metal → MTL
- Wood → WOD
- Glass → GLS

### **Dimensions:**
- "30L x 30W x 3Th Centimeters" → "30X30X3"

---

## 🔧 **Content Management by Variation**

### **How Content Approval Works:**

#### **Product-Level Content:**
- **Descriptions, SEO, Permalinks** are typically **shared** across variations
- **Item Name** used as the grouping key
- **One narrative** serves all variations of the same product

#### **Variation-Level Content:**
- **SKU-specific** content when variations are significantly different
- **Individual approval** for unique variations
- **Separate content** for different product lines with same name

### **Content Strategy Examples:**

#### **Shared Content (Typical):**
```
Product: "Vintage Crystal Bowl" 
├── Description: [Shared story about crystal bowl heritage]
├── SEO: [Keywords for crystal bowls in general]
└── Permalink: /products/vintage-crystal-bowl
    ├── Small variation uses base content
    ├── Large variation uses base content  
    └── Blue variation uses base content
```

#### **Individual Content (When Needed):**
```
Product: "Handmade Jewelry Collection"
├── RRV-HJ-001-RING: Ring-specific narrative
├── RRV-HJ-002-NECK: Necklace-specific narrative
└── RRV-HJ-003-EARR: Earring-specific narrative
```

---

## ✅ **Current System Status**

### **What's Working:**
- ✅ **Correct column mapping** (Item Name = Column 2, SKU = Column 4)
- ✅ **Proper variation grouping** by Item Name  
- ✅ **Category-based SKU prefixes** (16 real categories)
- ✅ **Intelligent option abbreviations** (colors, sizes, materials)
- ✅ **Content approval system** supporting both shared and individual content
- ✅ **Git-based approval workflow** for all content types

### **SKU Generation Results (Latest Run):**
- **787 items processed**
- **541 new SKUs generated** (68.8% needed them)
- **246 existing SKUs preserved** (31.2% already had good SKUs)
- **100% success rate**

---

## 🎯 **Best Practices**

### **For SKU Management:**
1. **Let the system generate SKUs** for consistency
2. **Preserve existing good SKUs** when possible
3. **Use meaningful abbreviations** for options
4. **Keep SKUs under 20 characters** for compatibility

### **For Content Management:**
1. **Use Item Name grouping** for shared narratives
2. **Create individual content** only when variations are truly different products
3. **Approve content at the appropriate level** (product vs variation)
4. **Follow git-based approval workflow** for quality control

### **For Option Management:**
1. **Use consistent option names** (Size, Color, Material, etc.)
2. **Standardize option values** (Small/Medium/Large vs S/M/L)
3. **Limit to 2 option types** per product when possible
4. **Use descriptive but concise values**

---

## 🚀 **Commands for Variant Management**

### **SKU Generation:**
```bash
# Process current catalog with correct variant handling
pnpm run process:current-catalog

# Dry run to preview SKU generation
pnpm run process:current-catalog:dry-run
```

### **Content Management by Variation:**
```bash
# Check content approval status (respects Item Name grouping)
pnpm run content:status

# Generate content (will group by Item Name appropriately)  
pnpm run enhance:individualized

# Review content for specific SKU or Item Name
pnpm run content:review <sku-or-item-name>
```

### **SEO & Permalinks:**
```bash
# Generate SEO content (groups by Item Name)
pnpm run seo:generate

# Generate permalinks (creates variation-friendly URLs)
pnpm run permalinks:generate
```

---

This structure ensures **consistent product organization**, **efficient content management**, and **proper SEO optimization** while respecting Square's native variation system! 🎉