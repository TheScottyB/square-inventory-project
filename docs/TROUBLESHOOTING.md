# Square Inventory Project - Troubleshooting Guide

## 🚨 **Critical Issues & Solutions**

### **1. Catalog Consistency Errors (Common)**

#### **Problem**: 
```
Error: Object ITEM_VARIATION is enabled but referenced ITEM is not
Status code: 400
```

#### **Root Cause**: 
Square's catalog has item variations that are enabled at specific locations, but their parent items are not enabled at those locations. This creates a data integrity conflict.

#### **✅ SOLUTION**: Use Direct Attachment Method
Instead of batch upsert operations, use the direct attachment method during image creation:

```javascript
// ❌ Problematic approach - separate upload and attach
const uploadedImage = await agent.uploadImage(imageBuffer, 'Product Name');
await agent.batchUpsertCatalogObjects([updatedItem]); // Fails with consistency error

// ✅ Working approach - direct attachment
const response = await agent.client.catalog.images.create({
  request: {
    idempotencyKey: crypto.randomUUID(),
    image: catalogImageObject,
    objectId: targetItemId,  // Direct attachment
    isPrimary: true
  },
  imageFile: imageFile
});
```

#### **Scripts Using This Method**:
- ✅ `scripts/production/direct-attach-to-guitar.js` (100% success rate)
- ✅ `scripts/production/download-and-attach-from-json.js`

---

### **2. API Connection Issues**

#### **Problem**:
```
Error: Failed to connect to Square API
TypeError: fetch failed
```

#### **Solutions**:

1. **Check Environment Variables**:
   ```bash
   # Verify .env file exists and has correct values
   cat .env | grep SQUARE
   ```

2. **Validate Access Token**:
   ```bash
   # Test with Square API directly
   curl -X GET https://connect.squareupsandbox.com/v2/locations \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```

3. **Environment Settings**:
   ```bash
   # Sandbox vs Production
   SQUARE_ENVIRONMENT=sandbox    # for testing
   SQUARE_ENVIRONMENT=production # for live data
   ```

4. **Run Connection Test**:
   ```bash
   pnpm run square:test
   ```

---

### **3. Image Upload Failures**

#### **Problem**:
```
Error: HTTP 413: Payload Too Large
```

#### **Solution**: 
Images over 15MB are rejected by Square. The system automatically validates this:

```javascript
// Automatic validation in SquareCatalogAgent
if (imageBuffer.length > 15 * 1024 * 1024) {
  throw new Error(`Image size ${Math.round(imageBuffer.length / 1024 / 1024)}MB exceeds Square's 15MB limit`);
}
```

**Fix**: Resize images before upload or use image optimization tools.

#### **Problem**:
```
Error: No image object returned from Square API
```

#### **Solutions**:
1. Check if image format is supported (JPEG, PNG, GIF)
2. Verify image is not corrupted
3. Ensure adequate network connectivity

---

### **4. Import Path Errors (After Reorganization)**

#### **Problem**:
```
Error: Cannot find module '../src/agents/SquareCatalogAgent.js'
```

#### **Solution**: 
Updated folder structure requires different import paths:

```javascript
// ❌ Old paths (before reorganization)
import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';

// ✅ New paths for production scripts
import { SquareCatalogAgent } from '../../src/agents/SquareCatalogAgent.js';

// ✅ New paths for utilities scripts  
import { SquareCatalogAgent } from '../../src/agents/SquareCatalogAgent.js';
```

---

### **5. Missing Dependencies** 

#### **Problem**:
```
Error: Cannot find package 'node-fetch'
```

#### **Solution**:
```bash
pnpm add node-fetch
```

---

## 🔧 **Diagnostic Commands**

### **Connection Testing**
```bash
# Test basic Square API connectivity
pnpm run square:test

# Test specific agent functionality
node scripts/utilities/test-square-catalog-agent.js
```

### **Image Upload Testing**
```bash
# Test real image upload (safe test)
node tests/testRealImageUpload.js

# Direct attachment test (recommended method)
pnpm run square:direct-attach
```

### **Environment Validation**
```bash
# Check environment variables
node -e "console.log(process.env.SQUARE_ACCESS_TOKEN ? 'Token present' : 'Token missing')"
node -e "console.log('Environment:', process.env.SQUARE_ENVIRONMENT || 'not set')"
```

---

## 📊 **Success Indicators**

### **Working Solutions** ✅
- **Direct Attachment Method**: 100% success rate for `direct-attach-to-guitar.js`
- **Real Square URLs**: All images get proper Square-hosted URLs
- **API Connection**: Successfully connects to 7 Square locations
- **Observability**: Comprehensive logging with trace IDs

### **Signs of Success**:
```
✅ Connected successfully
✅ Uploaded: M2AHWF6CFH4REND4CP4P2J3S (803ms)
🖼️ URL: https://items-images-production.s3.us-west-2.amazonaws.com/...
📎 Attached to: K7LO5CCCNKCWAB5VO426QZSQ (PRIMARY)
```

---

## 🛠 **Emergency Recovery**

### **If Everything Breaks**:

1. **Reset to Known Working State**:
   ```bash
   git checkout main
   pnpm install
   ```

2. **Use Production Scripts Only**:
   ```bash
   # Known working direct attachment
   pnpm run square:direct-attach
   ```

3. **Enable Dry Run Mode**:
   ```bash
   # Test without making changes
   ENABLE_DRY_RUN=true node scripts/production/direct-attach-to-guitar.js
   ```

### **Clean Slate Recovery**:
```bash
# Remove node_modules and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Test basic functionality
pnpm run square:test
```

---

## 📋 **Common Error Patterns**

| Error Pattern | Likely Cause | Solution |
|---------------|--------------|----------|
| `Status code: 400` + `ITEM_VARIATION enabled` | Catalog consistency | Use direct attachment method |
| `Cannot find module '../src/'` | Import path after reorganization | Update to `../../src/` |
| `HTTP 413` | Image too large | Resize to under 15MB |
| `fetch failed` | API connection | Check environment variables |
| `No image object returned` | Upload failure | Check image format/corruption |

---

## 🔗 **Quick Reference Links**

- **Working Scripts**: `scripts/production/`
- **API Testing**: `scripts/utilities/test-square-catalog-agent.js`
- **Direct Upload**: `scripts/production/direct-attach-to-guitar.js`
- **Environment Setup**: `.env.example`
- **Square API Docs**: https://developer.squareup.com/docs

---

## 📞 **Getting Help**

1. **Check this troubleshooting guide first**
2. **Run diagnostic commands** to identify the issue
3. **Check recent git commits** for working examples
4. **Review Square API documentation** for API-specific issues
5. **Use dry-run mode** to test safely

**Remember**: The production scripts in `scripts/production/` are tested and working. When in doubt, use those as reference implementations.
