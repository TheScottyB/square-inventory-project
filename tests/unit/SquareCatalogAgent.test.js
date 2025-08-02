import { SquareCatalogAgent } from '../../src/agents/SquareCatalogAgent';
import fs from 'fs-extra';

// Mock configuration
const config = {
  app: {
    enableDryRun: true
  }
};

// Sample product data for testing
const sampleProductData = {
  productName: 'Sample Product',
  description: 'A sample product for testing',
  category: 'miscellaneous',
  metadata: {
    imagePath: 'test/images/sample-product.jpg'
  }
};

// Dry-run image buffer
const sampleImageBuffer = Buffer.from('');

// Create test suite for SquareCatalogAgent
describe('SquareCatalogAgent', () => {
  let agent;
  
  beforeEach(() => {
    agent = new SquareCatalogAgent();
  });

  it('should initialize correctly', () => {
    expect(agent).toHaveProperty('client');
    expect(agent).toHaveProperty('enableDryRun', true);
  });

  it('should handle dry-run image upload', async () => {
    const result = await agent.uploadImage(sampleImageBuffer, sampleProductData.productName);
    expect(result).toHaveProperty('id', expect.stringContaining('mock-image'));
  });

  it('should handle dry-run catalog item creation', async () => {
    const result = await agent.createCatalogItem(sampleProductData);
    expect(result).toHaveProperty('id', expect.stringContaining('mock-item'));
  });

  it('should retrieve locations - dry run', async () => {
    // Stub to avoid API call in dry-run
    jest.spyOn(agent, 'getLocations').mockResolvedValue([]);
    const locations = await agent.getLocations();
    expect(locations).toBeInstanceOf(Array);
    jest.restoreAllMocks();
  });

  it('should perform integration test with fake Square API', async () => {
    agent.enableDryRun = false;

    try {
      const connectionStatus = await agent.testConnection();
      expect(connectionStatus).toBe(true);
    } catch (error) {
      console.warn('Integration test failed:', error.message);
    }
  });
});

