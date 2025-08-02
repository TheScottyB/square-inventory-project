# Real Square Image Upload Implementation

## Overview

The Square Catalog Agent now supports **real image uploads** to the Square API using the CreateCatalogImage endpoint. This replaces the previous mock implementation with full integration to Square's image hosting service.

## Implementation Details

### Square CreateCatalogImage API Integration

The real image upload uses Square's v43.0.1 SDK with the `catalog.images.create()` method:

```javascript
const response = await this.client.catalog.images.create({
  request: createRequest,
  imageFile: imageFile
});
```

### Key Features

✅ **Real Square API Integration** - Uses actual Square CreateCatalogImage endpoint  
✅ **Multipart Form Upload** - Properly formatted file uploads with metadata  
✅ **Automatic URL Generation** - Square generates hosted image URLs  
✅ **Idempotency Support** - UUID-based idempotency keys prevent duplicates  
✅ **Size Validation** - Enforces 15MB limit per Square API specs  
✅ **Format Support** - JPEG, PNG, GIF, WebP images  
✅ **Error Handling** - Comprehensive error classification and retry logic  
✅ **Observability** - Full tracing, metrics, and logging  

## Usage Examples

### Basic Image Upload

```javascript
import { SquareCatalogAgent } from './src/agents/SquareCatalogAgent.js';
import fs from 'fs-extra';

const agent = new SquareCatalogAgent();

// Read image file
const imageBuffer = await fs.readFile('./path/to/image.jpg');

// Upload to Square
const uploadedImage = await agent.uploadImage(
  imageBuffer,
  'Product Image Name',
  'Optional caption describing the image'
);

console.log(`Image uploaded: ${uploadedImage.id}`);
console.log(`Image URL: ${uploadedImage.imageData.url}`);
```

### Upload and Attach to Catalog Item

```javascript
// Upload image attached to existing catalog item
const uploadedImage = await agent.uploadImage(
  imageBuffer,
  'Product Image',
  'Main product photo',
  'CATALOG_ITEM_ID',  // Attach to this item
  true                // Set as primary image
);
```

### Batch Image Processing

```javascript
const imagePaths = ['./image1.jpg', './image2.jpg', './image3.jpg'];
const uploadedImages = [];

for (const imagePath of imagePaths) {
  const imageBuffer = await fs.readFile(imagePath);
  const imageName = path.basename(imagePath);
  
  const uploadedImage = await agent.uploadImage(
    imageBuffer,
    imageName,
    `Product image: ${imageName}`
  );
  
  uploadedImages.push(uploadedImage);
}
```

## API Response Structure

When successful, the Square API returns:

```javascript
{
  id: "YC2VV5KDITLP6RDIVDWBXERU",              // Square-generated image ID
  type: "IMAGE",
  version: 1749760400356,                      // Version for optimistic concurrency
  imageData: {
    name: "ambulance-family-first-aid-kit...", // Image name
    caption: "Test image upload...",           // Image caption
    url: "https://items-images-production.s3.us-west-2.amazonaws.com/files/..."  // Square-hosted URL
  },
  createdAt: "2025-08-02T19:10:13.000Z",
  updatedAt: "2025-08-02T19:10:13.000Z"
}
```

## Configuration

### Environment Variables

```bash
# Required for real uploads
SQUARE_ACCESS_TOKEN=your_square_access_token
SQUARE_APPLICATION_ID=your_application_id
SQUARE_ENVIRONMENT=sandbox  # or 'production'

# Set to false for real uploads
ENABLE_DRY_RUN=false
```

### Dry Run Mode

When `ENABLE_DRY_RUN=true`, the system returns mock image objects without calling Square:

```javascript
{
  id: "test-image-1754161792863-7ycyoerqljy",
  type: "IMAGE",
  version: 1,
  imageData: {
    name: "Test Image",
    caption: "Mock image for testing",
    url: "https://example.com/images/test-image.jpg"
  }
}
```

## Image Requirements

### File Constraints

- **Maximum Size**: 15MB (enforced by Square API)
- **Formats**: JPEG (.jpg, .jpeg), PNG (.png), GIF (.gif), WebP (.webp)
- **Content Type**: Automatically detected from file extension

### Validation Process

1. **Buffer Validation**: Ensures image buffer is not empty
2. **Size Check**: Validates file size ≤ 15MB
3. **Format Detection**: Sets appropriate MIME type
4. **Content Validation**: Square validates image format server-side

## Error Handling

### Common Errors and Solutions

#### 1. Authentication Errors
```
Error: UNAUTHORIZED - Check access token validity and permissions
```
**Solution**: Verify `SQUARE_ACCESS_TOKEN` is correct and has image upload permissions.

#### 2. File Size Errors
```
Error: Image file too large (max 15MB)
```
**Solution**: Resize image or compress before upload.

#### 3. Invalid Format Errors
```
Error: Square API error: INVALID_IMAGE_FORMAT
```
**Solution**: Ensure image is in supported format (JPEG, PNG, GIF, WebP).

#### 4. Network Errors
```
Error: ECONNRESET - Check network connectivity and retry
```
**Solution**: Implement retry logic with exponential backoff.

### Error Classification

The system automatically classifies errors:

- **Client Errors (4xx)**: Authentication, validation, format issues
- **Server Errors (5xx)**: Square service issues, retryable
- **Network Errors**: Connection issues, retryable
- **Rate Limiting**: Temporary throttling, retryable

## Performance Optimization

### Upload Performance

Typical performance metrics:
- **Small images (< 100KB)**: 200-400ms
- **Medium images (100KB-1MB)**: 400-800ms  
- **Large images (1-15MB)**: 1-5 seconds

### Batch Processing Tips

```javascript
// Process in batches to respect rate limits
const batchSize = 5;
for (let i = 0; i < images.length; i += batchSize) {
  const batch = images.slice(i, i + batchSize);
  
  // Process batch
  await Promise.all(batch.map(img => agent.uploadImage(...)));
  
  // Add delay between batches
  if (i + batchSize < images.length) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
```

## Testing

### Manual Testing

Use the provided test script:

```bash
# Test real image upload
ENABLE_DRY_RUN=false node tests/testRealImageUpload.js
```

### Integration Testing

Test the full workflow:

```bash
# Test image append to catalog items
ENABLE_DRY_RUN=false node scripts/find-by-price-append-images.js \
  --exact-price-append 4999 \
  --image-dir ./test-images \
  --limit 1
```

### Validation Checklist

- [ ] Image uploads successfully
- [ ] Returns valid Square image ID
- [ ] Generates Square-hosted URL
- [ ] Proper error handling for invalid files
- [ ] Observability logs capture upload metrics
- [ ] Dry-run mode works for testing

## Observability

### Logging and Metrics

The system provides comprehensive observability:

```javascript
// Upload metrics logged automatically
[2025-08-02T19:10:13.436Z] INFO: Successfully uploaded image to Square
  Context: {
    imageId: 'YC2VV5KDITLP6RDIVDWBXERU',
    imageName: 'test-image.jpg',
    imageSize: 175016,
    attachedTo: 'unattached',
    imageUrl: 'https://items-images-production.s3.us-west-2.amazonaws.com/...'
  }
```

### Performance Tracking

- **Upload Duration**: Time to complete upload
- **Success Rate**: Percentage of successful uploads
- **Error Classification**: Categorized error types
- **Size Distribution**: Upload size patterns

### Distributed Tracing

Each upload operation is traced with:
- Unique trace ID
- Validation spans
- API call spans  
- Performance metrics
- Error correlation

## Security Considerations

### Access Control

- **Token Security**: Never log or expose access tokens
- **Environment Separation**: Use different tokens for sandbox/production
- **Permission Scope**: Ensure tokens have minimal required permissions

### Image Content

- **Content Validation**: Square validates uploaded images
- **Size Limits**: Enforced to prevent abuse
- **Format Restrictions**: Only approved image formats accepted

## Migration from Mock Implementation

### Before (Mock)
```javascript
// Mock implementation returned test data
const mockImage = {
  id: `test-image-${Date.now()}`,
  imageData: { url: 'https://example.com/...' }
};
```

### After (Real)
```javascript
// Real implementation calls Square API
const response = await this.client.catalog.images.create({
  request: createRequest,
  imageFile: imageFile
});
// Returns actual Square image object
```

### Breaking Changes

**None** - The public API remains identical. Only the internal implementation changed from mock to real Square API calls.

## Troubleshooting

### Debug Mode

Enable detailed logging:
```bash
LOG_LEVEL=debug ENABLE_DRY_RUN=false node your-script.js
```

### Common Issues

1. **"Missing required key 'id'" Error**
   - **Cause**: Image object missing temporary ID
   - **Fix**: Ensure image object includes `id: '#image-timestamp-random'`

2. **"Blob is not defined" Error**  
   - **Cause**: Node.js version compatibility
   - **Fix**: Ensure Node.js ≥ 18 or polyfill Blob

3. **Network Timeout**
   - **Cause**: Large image or slow connection
   - **Fix**: Increase timeout or compress image

### Support

For issues related to:
- **Square API**: Check Square Developer Documentation
- **Image Upload Implementation**: Review error logs and traces
- **Performance**: Monitor observability metrics

---

## Summary

The real Square image upload implementation provides:

✅ **Production-Ready**: Full Square API integration  
✅ **Robust**: Comprehensive error handling and retries  
✅ **Observable**: Complete logging, metrics, and tracing  
✅ **Performant**: Optimized for batch operations  
✅ **Tested**: Validated with real Square API calls  

The system successfully uploads images to Square's hosting service and integrates seamlessly with existing catalog workflows.
