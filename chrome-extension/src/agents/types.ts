/**
 * Type definitions for the OpenAI Agents DOM automation system
 */

export interface PageContext {
  url: string;
  pageType: 'items-library' | 'item-detail' | 'dashboard' | 'spocket' | 'unknown';
  itemId?: string;
  title?: string;
  readyState?: DocumentReadyState;
}

export interface AgentCapabilities {
  canFillForms: boolean;
  canNavigate: boolean;
  canExtractData: boolean;
  canManageImages: boolean;
  supportedPageTypes: string[];
}

export interface AgentContext {
  page: PageContext;
  storage: typeof chrome.storage.local;
  messaging: typeof chrome.runtime;
  capabilities: AgentCapabilities;
}

export interface AgentTask {
  id: string;
  type: 'seo-update' | 'navigate' | 'extract-data' | 'fill-form' | 'manage-images' | 'search' | 'custom';
  priority: 'high' | 'medium' | 'low';
  data: any;
  maxRetries?: number;
  retryCount?: number;
  timeout?: number;
}

export interface AgentResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: any;
  executionTime?: number;
  retryCount?: number;
}

export interface DOMElement {
  selector: string;
  element?: HTMLElement;
  exists: boolean;
  visible?: boolean;
  value?: string;
  attributes?: Record<string, string>;
}

export interface DOMObserverConfig {
  targetSelector: string;
  options: MutationObserverInit;
  callback: (mutations: MutationRecord[]) => void;
  debounceMs?: number;
}

export interface SEOData {
  title?: string;
  description?: string;
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  searchTerms?: string[];
}

export interface SquareItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
  price?: number;
  imageUrl?: string;
  seoData?: SEOData;
}

export interface AgentMessage {
  from: string;
  to: string;
  type: 'request' | 'response' | 'event' | 'error';
  action: string;
  data: any;
  timestamp: number;
}

export interface AgentState {
  isInitialized: boolean;
  isProcessing: boolean;
  lastTask?: AgentTask;
  lastResult?: AgentResult;
  errorCount: number;
  successCount: number;
}