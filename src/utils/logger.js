/**
 * Simple logger utility for the project
 */

const logLevels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLogLevel = process.env.LOG_LEVEL || 'info';

export const logger = {
  debug: (message, data = {}) => {
    if (logLevels.debug >= logLevels[currentLogLevel]) {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, data);
    }
  },
  
  info: (message, data = {}) => {
    if (logLevels.info >= logLevels[currentLogLevel]) {
      console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data);
    }
  },
  
  warn: (message, data = {}) => {
    if (logLevels.warn >= logLevels[currentLogLevel]) {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data);
    }
  },
  
  error: (message, error = {}) => {
    if (logLevels.error >= logLevels[currentLogLevel]) {
      console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
    }
  }
};

export default logger;