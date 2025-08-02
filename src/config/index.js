import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Validates that required environment variables are present
 * @param {string} varName - The environment variable name
 * @param {string} defaultValue - Optional default value
 * @returns {string} The environment variable value or default
 * @throws {Error} If required variable is missing and no default provided
 */
function requireEnvVar(varName, defaultValue = null) {
  const value = process.env[varName];
  if (!value && defaultValue === null) {
    throw new Error(`Required environment variable ${varName} is not set`);
  }
  return value || defaultValue;
}

/**
 * Centralized configuration object for the Square Inventory Project
 * Loads and validates all environment variables needed by the application
 */
export const config = {
  // OpenAI API Configuration
  openai: {
    apiKey: requireEnvVar('OPENAI_API_KEY'),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.1'),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1000'),
  },

  // File System Configuration
  filesystem: {
    imageSourceDir: requireEnvVar('IMAGE_SOURCE_DIR', './'),
    imageOutputDir: requireEnvVar('IMAGE_OUTPUT_DIR', './output'),
  },

  // Application Configuration
  app: {
    logLevel: process.env.LOG_LEVEL || 'info',
    enableDryRun: process.env.ENABLE_DRY_RUN === 'true',
  },

  // Agent-specific Configuration
  agents: {
    imageAnalysis: {
      maxDescriptionLength: parseInt(process.env.MAX_DESCRIPTION_LENGTH || '500'),
      retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
      retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000'),
    },
    grouping: {
      similarityThreshold: parseFloat(process.env.GROUPING_SIMILARITY_THRESHOLD || '0.8'),
      maxGroupSize: parseInt(process.env.MAX_GROUP_SIZE || '10'),
    },
  },

  // Workflow Configuration
  workflow: {
    concurrencyLimit: parseInt(process.env.CONCURRENCY_LIMIT || '5'),
    supportedImageExtensions: (process.env.SUPPORTED_IMAGE_EXTENSIONS || '.jpg,.jpeg,.png,.gif,.bmp,.webp').split(','),
  },
};

/**
 * Validates the entire configuration object
 * @throws {Error} If any configuration values are invalid
 */
export function validateConfig() {
  // Validate numeric ranges
  if (config.openai.temperature < 0 || config.openai.temperature > 2) {
    throw new Error('OPENAI_TEMPERATURE must be between 0 and 2');
  }

  if (config.agents.grouping.similarityThreshold < 0 || config.agents.grouping.similarityThreshold > 1) {
    throw new Error('GROUPING_SIMILARITY_THRESHOLD must be between 0 and 1');
  }

  if (config.agents.imageAnalysis.maxDescriptionLength < 1) {
    throw new Error('MAX_DESCRIPTION_LENGTH must be greater than 0');
  }

  // Validate directories exist or can be created
  // This will be handled at runtime in the workflow
}

// Auto-validate on import
validateConfig();

export default config;
