// Main export file for OpenAI Agents DOM automation system

export { DOMAgent } from './base/DOMAgent';
export { SquareSEOAgent } from './square/SquareSEOAgent';
export { SquareNavigationAgent } from './square/SquareNavigationAgent';
export { AgentCoordinator } from './AgentCoordinator';
export { ContentAgentManager, contentAgentManager } from './content-agent';

export type {
  AgentContext,
  AgentTask,
  AgentResult,
  AgentCapabilities,
  DOMElement,
  DOMObserverConfig,
  PageContext,
  SEOData,
  SquareItem
} from './types';

// Version info
export const AGENTS_VERSION = '1.0.0';
export const OPENAI_AGENTS_SDK_VERSION = '^0.1.0';

// Agent registry for easy access
export const AGENT_TYPES = {
  SEO: 'seo',
  NAVIGATION: 'navigation',
  IMAGE: 'image',
  FORM: 'form',
  DATA_EXTRACTION: 'data-extraction'
} as const;

export type AgentType = typeof AGENT_TYPES[keyof typeof AGENT_TYPES];