// Core types for OpenAI Agent SDK integration with Chrome Extension

export interface OpenAIAgentConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface AgentMessage {
  id: string;
  type: 'request' | 'response' | 'error' | 'status';
  agentId: string;
  action: string;
  data?: any;
  timestamp: number;
  correlationId?: string;
}

export interface AgentResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  agentId: string;
  timestamp: number;
  correlationId: string;
}

export interface AgentStatus {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'error' | 'stopped';
  lastActivity: number;
  tasksCompleted: number;
  errors: number;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (params: any) => Promise<any>;
}

export interface AgentContext {
  sessionId: string;
  pageType: 'square-dashboard' | 'spocket-product' | 'unknown';
  url: string;
  timestamp: number;
  data?: Record<string, any>;
}

// Square-specific types
export interface SquareItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
  price?: number;
  images?: string[];
  seoTitle?: string;
  seoDescription?: string;
}

export interface SquareFormData {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  seoTitle?: string;
  seoDescription?: string;
}

// Spocket-specific types
export interface SpocketProduct {
  id: string;
  title: string;
  supplier: string;
  costPrice: string;
  sellPrice: string;
  profit?: string;
  profitMargin?: string;
  images: SpocketImage[];
  description?: string;
  origin?: string;
  processingTime?: string;
  shippingOptions?: string[];
}

export interface SpocketImage {
  src: string;
  originalSrc?: string;
  filename: string;
  width: number;
  height: number;
  isMain?: boolean;
  isVariant?: boolean;
}

// Chrome Extension specific types
export interface ExtensionMessage extends AgentMessage {
  tabId?: number;
  frameId?: number;
}

export interface ChromeStorageData {
  openaiApiKey?: string;
  agentConfigs?: Record<string, OpenAIAgentConfig>;
  agentStates?: Record<string, any>;
  catalogData?: any;
  spocketProducts?: SpocketProduct[];
  settings?: ExtensionSettings;
  agentContext?: AgentContext;
  [key: string]: any;
}

export interface ExtensionSettings {
  autoMode: boolean;
  imageSearchEnabled: boolean;
  seoUpdatesEnabled: boolean;
  agentLoggingEnabled: boolean;
  maxConcurrentAgents: number;
}

// Agent-specific interfaces
export interface SquareAutomationAgentTools {
  updateSEOFields: (data: SquareFormData) => Promise<boolean>;
  extractItemData: () => Promise<SquareItem>;
  fillForm: (data: SquareFormData) => Promise<boolean>;
  attachImages: (imageUrls: string[]) => Promise<boolean>;
  navigateToItem: (itemId: string) => Promise<boolean>;
}

export interface SpocketAgentTools {
  extractProductData: () => Promise<SpocketProduct>;
  captureImages: () => Promise<SpocketImage[]>;
  analyzeImage: (imageUrl: string) => Promise<any>;
  calculateProfitMargins: (costPrice: string, sellPrice: string) => Promise<any>;
  downloadImages: (images: SpocketImage[]) => Promise<boolean>;
}

export type AgentType = 'square-automation' | 'spocket-extraction';

export interface BaseAgent {
  id: string;
  type: AgentType;
  name: string;
  status: AgentStatus['status'];
  config: OpenAIAgentConfig;
  context?: AgentContext;
  tools: AgentTool[];
}

export interface AgentManagerInterface {
  createAgent(type: AgentType, config: OpenAIAgentConfig): Promise<string>;
  startAgent(agentId: string, context?: AgentContext): Promise<void>;
  stopAgent(agentId: string): Promise<void>;
  sendMessage(agentId: string, message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<AgentResponse>;
  getAgentStatus(agentId: string): Promise<AgentStatus>;
  listAgents(): Promise<AgentStatus[]>;
}
