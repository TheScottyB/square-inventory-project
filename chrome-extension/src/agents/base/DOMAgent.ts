import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';
import { AgentContext, AgentTask, AgentResult, DOMElement, DOMObserverConfig } from '../types';

/**
 * Base class for all DOM manipulation agents
 * Provides core functionality for interacting with web pages
 */
export abstract class DOMAgent {
  protected agent: Agent;
  protected context: AgentContext;
  protected observers: Map<string, MutationObserver> = new Map();
  protected taskQueue: AgentTask[] = [];
  protected isProcessing = false;
  protected state = {
    isInitialized: false,
    errorCount: 0,
    successCount: 0
  };

  constructor(context: AgentContext, agentConfig: { name: string; instructions: string; model?: string }) {
    this.context = context;
    
    this.agent = new Agent({
      name: agentConfig.name,
      instructions: agentConfig.instructions,
      model: agentConfig.model || 'gpt-4o-mini',
      tools: this.buildTools()
    });
  }

  /**
   * Build tools specific to this agent
   * Override in subclasses to add specialized tools
   */
  protected abstract buildTools(): any[];

  /**
   * Core DOM manipulation methods
   */
  protected async findElement(selector: string, timeout = 5000): Promise<DOMElement> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector) as HTMLElement;
      
      if (element) {
        return {
          selector,
          element,
          exists: true,
          visible: this.isElementVisible(element),
          value: this.getElementValue(element),
          attributes: this.getElementAttributes(element)
        };
      }
      
      await this.sleep(100);
    }
    
    return {
      selector,
      exists: false
    };
  }

  protected async findElements(selector: string): Promise<DOMElement[]> {
    const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    
    return elements.map(element => ({
      selector,
      element,
      exists: true,
      visible: this.isElementVisible(element),
      value: this.getElementValue(element),
      attributes: this.getElementAttributes(element)
    }));
  }

  protected async clickElement(selector: string): Promise<boolean> {
    const domElement = await this.findElement(selector);
    
    if (!domElement.exists || !domElement.element) {
      console.warn(`Element not found: ${selector}`);
      return false;
    }
    
    try {
      domElement.element.click();
      await this.sleep(100); // Small delay for page reaction
      return true;
    } catch (error) {
      console.error(`Failed to click element: ${selector}`, error);
      return false;
    }
  }

  protected async typeInElement(selector: string, text: string, clearFirst = true): Promise<boolean> {
    const domElement = await this.findElement(selector);
    
    if (!domElement.exists || !domElement.element) {
      console.warn(`Element not found: ${selector}`);
      return false;
    }
    
    try {
      const input = domElement.element as HTMLInputElement | HTMLTextAreaElement;
      
      if (clearFirst) {
        input.value = '';
      }
      
      // Simulate typing with events
      input.focus();
      input.value = text;
      
      // Trigger input events
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      
      return true;
    } catch (error) {
      console.error(`Failed to type in element: ${selector}`, error);
      return false;
    }
  }

  protected async selectOption(selector: string, value: string): Promise<boolean> {
    const domElement = await this.findElement(selector);
    
    if (!domElement.exists || !domElement.element) {
      console.warn(`Select element not found: ${selector}`);
      return false;
    }
    
    try {
      const select = domElement.element as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (error) {
      console.error(`Failed to select option: ${selector}`, error);
      return false;
    }
  }

  /**
   * DOM observation methods
   */
  protected observeElement(config: DOMObserverConfig): void {
    const { targetSelector, options, callback, debounceMs = 0 } = config;
    
    // Remove existing observer if any
    this.unobserveElement(targetSelector);
    
    const targetElement = document.querySelector(targetSelector);
    if (!targetElement) {
      console.warn(`Cannot observe - element not found: ${targetSelector}`);
      return;
    }
    
    let debounceTimer: NodeJS.Timeout;
    const debouncedCallback = (mutations: MutationRecord[]) => {
      if (debounceMs > 0) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => callback(mutations), debounceMs);
      } else {
        callback(mutations);
      }
    };
    
    const observer = new MutationObserver(debouncedCallback);
    observer.observe(targetElement, options);
    this.observers.set(targetSelector, observer);
  }

  protected unobserveElement(targetSelector: string): void {
    const observer = this.observers.get(targetSelector);
    if (observer) {
      observer.disconnect();
      this.observers.delete(targetSelector);
    }
  }

  /**
   * Utility methods
   */
  protected isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }

  protected getElementValue(element: HTMLElement): string | undefined {
    if (element instanceof HTMLInputElement || 
        element instanceof HTMLTextAreaElement || 
        element instanceof HTMLSelectElement) {
      return element.value;
    }
    return element.textContent || undefined;
  }

  protected getElementAttributes(element: HTMLElement): Record<string, string> {
    const attributes: Record<string, string> = {};
    for (const attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }
    return attributes;
  }

  protected async waitForElement(selector: string, timeout = 10000): Promise<boolean> {
    const domElement = await this.findElement(selector, timeout);
    return domElement.exists;
  }

  protected async waitForElementToDisappear(selector: string, timeout = 10000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (!element) {
        return true;
      }
      await this.sleep(100);
    }
    
    return false;
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Task execution with retry logic
   */
  async executeTask(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    
    try {
      // Add to queue
      this.taskQueue.push(task);
      
      // Process if not already processing
      if (!this.isProcessing) {
        return await this.processTaskQueue();
      }
      
      // Wait for task to be processed
      return await this.waitForTaskCompletion(task.id);
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  private async processTaskQueue(): Promise<AgentResult> {
    this.isProcessing = true;
    
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift()!;
      const result = await this.executeTaskWithRetry(task);
      
      if (result.success) {
        this.state.successCount++;
      } else {
        this.state.errorCount++;
      }
      
      // Store result for waiting tasks
      (task as any)._result = result;
    }
    
    this.isProcessing = false;
    return { success: true };
  }

  private async executeTaskWithRetry(task: AgentTask): Promise<AgentResult> {
    let lastError: Error | undefined;
    const maxRetries = task.maxRetries || 2;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        task.retryCount = attempt;
        const result = await this.executeTaskInternal(task);
        
        if (result.success) {
          return result;
        }
        
        lastError = new Error(result.error || 'Task failed');
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      
      // Wait before retry with exponential backoff
      if (attempt < maxRetries) {
        await this.sleep(Math.pow(2, attempt) * 1000);
      }
    }
    
    return {
      success: false,
      error: lastError?.message || 'Task failed after retries',
      retryCount: maxRetries
    };
  }

  protected abstract executeTaskInternal(task: AgentTask): Promise<AgentResult>;

  private async waitForTaskCompletion(taskId: string, timeout = 30000): Promise<AgentResult> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const task = this.taskQueue.find(t => t.id === taskId) || 
                  (this.taskQueue as any[]).find(t => t.id === taskId && t._result);
      
      if (task && (task as any)._result) {
        return (task as any)._result;
      }
      
      await this.sleep(100);
    }
    
    return {
      success: false,
      error: 'Task timeout'
    };
  }

  /**
   * Lifecycle methods
   */
  destroy(): void {
    // Clean up observers
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();
    
    // Clear task queue
    this.taskQueue = [];
    this.isProcessing = false;
  }
}