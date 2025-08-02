import { config, validateConfig } from '../index';

// Test suite for the central configuration module
describe('Configuration Module', () => {
  // Validation of environment variable loading
  it('should load and validate environment variables correctly', () => {
    expect(config.openai.apiKey).toBeDefined();
    expect(config.filesystem.imageSourceDir).toBeDefined();
    expect(config.filesystem.imageOutputDir).toBeDefined();
    expect(config.agents.imageAnalysis.maxDescriptionLength).toBeGreaterThan(0);
    validateConfig();
  });

  // Exception for missing required variables
  it('should throw an error if required environment variables are missing', () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => validateConfig()).toThrow('Required environment variable OPENAI_API_KEY is not set');
  });

  // Validate specific config constraints (e.g., temperature range)
  it('should have valid temperature and similarity threshold configurations', () => {
    expect(config.openai.temperature).toBeGreaterThanOrEqual(0);
    expect(config.openai.temperature).toBeLessThanOrEqual(2);
    expect(config.agents.grouping.similarityThreshold).toBeGreaterThanOrEqual(0);
    expect(config.agents.grouping.similarityThreshold).toBeLessThanOrEqual(1);
  });
});
