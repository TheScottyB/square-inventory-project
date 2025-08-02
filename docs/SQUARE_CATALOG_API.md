# SquareCatalogAgent API Documentation

## Overview

The `SquareCatalogAgent` is a comprehensive wrapper around the Square SDK v43.0.1 that provides simplified methods for managing Square catalog items, images, and inventory. It includes built-in error handling, retry mechanisms, and dry-run capabilities for testing.

## Installation & Setup

```javascript
import { SquareCatalogAgent } from './src/agents/SquareCatalogAgent.js';
```

### Environment Variables

Before using the agent, ensure these environment variables are set:

```bash
SQUARE_ACCESS_TOKEN=your_square_access_token
SQUARE_APPLICATION_ID=your_square_application_id
SQUARE_ENVIRONMENT=sandbox  # or 'production'
ENABLE_DRY_RUN=false        # set to 'true' for testing
```

## Constructor

```javascript
const agent = new SquareCatalogAgent();
```

The constructor automatically:
- Initializes the Square client with environment-based configuration
- Sets up catalog and locations API instances
- Configures retry and timeout settings
- Enables dry-run mode based on environment variables

## Core Methods

### Connection & Testing

#### `testConnection()`

Tests the Square API connection and verifies permissions.

```javascript
const isConnected = await agent.testConnection();
```

**Returns:** `Promise<boolean>` - Connection status

**Example:**
```javascript
if (await agent.testConnection()) {
  console.log('Square API is ready!');
} else {
  console.error('Failed to connect to Square API');
}
```

---

### Location Management

#### `getLocations()`

Retrieves all locations for the merchant account.

```javascript
const locations = await agent.getLocations();
```

**Returns:** `Promise<Array>` - Array of location objects

**Example:**
```javascript
const locations = await agent.getLocations();
console.log(`Found ${locations.length} locations`);
locations.forEach(loc => console.log(`- ${loc.name} (${loc.id})`));
```

#### `getMainLocationId()`

Gets the main location ID (first location found).

```javascript
const locationId = await agent.getMainLocationId();
```

**Returns:** `Promise<string>` - Main location ID

---

### Image Management

#### `uploadImage(imageBuffer, imageName, caption?)`

Uploads an image to the Square catalog.

**Parameters:**
- `imageBuffer` (Buffer): Image file buffer
- `imageName` (string): Name for the image
- `caption` (string, optional): Image caption

**Returns:** `Promise<Object>` - Uploaded image object with `id` property

**Example:**
```javascript
import fs from 'fs-extra';

const imageBuffer = await fs.readFile('product-photo.jpg');
const uploadedImage = await agent.uploadImage(
  imageBuffer, 
  'Blue Widget Photo',
  'High-quality product photo showing blue widget'
);

console.log(`Image uploaded with ID: ${uploadedImage.id}`);
```

---

### Catalog Item Management

#### `createCatalogItem(productData, imageId?, locationId)`

Creates or updates a catalog item with variations and inventory tracking.

**Parameters:**
- `productData` (Object): Product information
  - `productName` (string): Product name
  - `description` (string): Product description
  - `category` (string): Product category
- `imageId` (string, optional): ID of uploaded image
- `locationId` (string): Location ID for the item

**Returns:** `Promise<Object>` - Created catalog item

**Example:**
```javascript
const productData = {
  productName: 'Artisan Blue Widget',
  description: 'Handcrafted blue widget with premium finish',
  category: 'widgets'
};

const catalogItem = await agent.createCatalogItem(
  productData,
  uploadedImage.id,
  locationId
);

console.log(`Created item: ${catalogItem.id}`);
```

---

### Category Management

#### `getOrCreateCategory(categoryName)`

Finds an existing category or creates a new one.

**Parameters:**
- `categoryName` (string): Category name

**Returns:** `Promise<string>` - Category ID

**Example:**
```javascript
const categoryId = await agent.getOrCreateCategory('Electronics');
console.log(`Category ID: ${categoryId}`);
```

---

### SKU & Utility Methods

#### `generateSku(productData)`

Generates a unique SKU based on category and product name.

**Parameters:**
- `productData` (Object): Product data with `category` and `productName`

**Returns:** `string` - Generated SKU

**Example:**
```javascript
const productData = {
  category: 'Electronics',
  productName: 'Blue Widget Pro'
};

const sku = agent.generateSku(productData);
console.log(`Generated SKU: ${sku}`); // Output: ELE-BLUEWI-1234
```

#### `getCategoryColor(category)`

Gets a color code for a category (used for visual organization in Square).

**Parameters:**
- `category` (string): Category name

**Returns:** `string` - Hex color code (without #)

**Supported Categories:**
- `jewelry`: `9da2a6` (gray)
- `candle holders`: `f06292` (pink)
- `first aid`: `ef5350` (red)
- `pet products`: `42a5f5` (blue)
- `shoes`: `66bb6a` (green)
- `holographic purses`: `ab47bc` (purple)
- `miscellaneous`: `78909c` (default gray)

---

### Batch Processing

#### `processProducts(analysisResults)`

Processes multiple products for Square integration with image uploads and catalog creation.

**Parameters:**
- `analysisResults` (Array): Array of product analysis results

**Returns:** `Promise<Object>` - Processing results with success/error counts

**Example:**
```javascript
const products = [
  {
    productName: 'Product 1',
    description: 'First product',
    category: 'jewelry',
    metadata: { imagePath: './images/product1.jpg' }
  },
  {
    productName: 'Product 2',
    description: 'Second product', 
    category: 'electronics',
    metadata: { imagePath: './images/product2.jpg' }
  }
];

const results = await agent.processProducts(products);
console.log(`Successfully processed: ${results.results.length}`);
console.log(`Errors: ${results.errors.length}`);
```

## Error Handling

All methods include comprehensive error handling:

- **Automatic Retries**: Failed requests are retried up to 3 times with exponential backoff
- **Detailed Logging**: All operations are logged with emoji indicators for easy identification
- **Graceful Degradation**: Methods continue processing even if individual items fail
- **Error Reporting**: Detailed error objects are returned for failed operations

## Dry-Run Mode

Enable dry-run mode to test operations without making actual API calls:

```bash
ENABLE_DRY_RUN=true
```

In dry-run mode:
- All API calls return mock data
- No actual Square API requests are made
- All operations are logged with `[DRY RUN]` prefix
- Perfect for testing and development

## Best Practices

### 1. Always Test Connection First
```javascript
if (!(await agent.testConnection())) {
  throw new Error('Square API connection failed');
}
```

### 2. Handle Large Batches Carefully
```javascript
// Process in smaller batches to avoid rate limits
const batchSize = 10;
for (let i = 0; i < products.length; i += batchSize) {
  const batch = products.slice(i, i + batchSize);
  await agent.processProducts(batch);
  
  // Optional: Add delay between batches
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

### 3. Validate Images Before Upload
```javascript
import fs from 'fs-extra';

if (await fs.pathExists(imagePath)) {
  const stats = await fs.stat(imagePath);
  if (stats.size > 5 * 1024 * 1024) { // 5MB limit
    console.warn('Image file too large, consider resizing');
  }
}
```

### 4. Use Descriptive Names and Categories
```javascript
const productData = {
  productName: 'Sterling Silver Amethyst Bracelet - Medium',
  description: 'Handcrafted sterling silver bracelet featuring genuine amethyst stones',
  category: 'jewelry' // Use consistent category names
};
```

## Rate Limiting

The Square API has rate limits. The agent includes:
- 10-second timeout on requests
- Automatic retry with exponential backoff
- Built-in delay recommendations for batch processing

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check `SQUARE_ACCESS_TOKEN` is correct
   - Verify token matches the environment (sandbox vs production)
   - Ensure token has necessary permissions

2. **Image Upload Failures**
   - Verify image file exists and is readable
   - Check image size (Square has limits)
   - Ensure image format is supported (JPEG, PNG)

3. **Category Creation Issues**
   - Use consistent category naming
   - Avoid special characters in category names
   - Check for existing categories first

### Debug Logging

Enable verbose logging by checking console output. All operations include detailed logging with:
- ✅ Success indicators
- ❌ Error indicators  
- 🔄 Processing indicators
- 📍 Location indicators
- 🖼️ Image indicators
- 🏷️ Category indicators
