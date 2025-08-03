import { AgentMessage, AgentResponse, ExtensionMessage } from '@/types';

export class AgentCommunicationLayer {
  private messageHandlers: Map<string, (message: AgentMessage) => Promise<AgentResponse>> = new Map();
  private pendingRequests: Map<string, { resolve: (value: AgentResponse) => void; reject: (reason?: any) => void; timeout: NodeJS.Timeout }> = new Map();
  private defaultTimeout = 30000; // 30 seconds

  constructor() {
    this.setupMessageListeners();
  }

  private setupMessageListeners(): void {
    // Listen for messages from content scripts and other components
    chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
      if (message.messageType === 'agent-message') {
        this.handleIncomingMessage(message as ExtensionMessage, sender).then(sendResponse);
        return true; // Will respond asynchronously
      }
    });
  }

  private async handleIncomingMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<AgentResponse> {
    try {
      const handler = this.messageHandlers.get(message.action);
      if (handler) {
        return await handler(message);
      } else {
        return {
          success: false,
          error: `No handler found for action: ${message.action}`,
          agentId: message.agentId,
          timestamp: Date.now(),
          correlationId: message.correlationId || this.generateId()
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        agentId: message.agentId,
        timestamp: Date.now(),
        correlationId: message.correlationId || this.generateId()
      };
    }
  }

  public registerMessageHandler(action: string, handler: (message: AgentMessage) => Promise<AgentResponse>): void {
    this.messageHandlers.set(action, handler);
  }

  public unregisterMessageHandler(action: string): void {
    this.messageHandlers.delete(action);
  }

  public async sendMessageToAgent(agentId: string, action: string, data?: any, timeout: number = this.defaultTimeout): Promise<AgentResponse> {
    const correlationId = this.generateId();
    const message: ExtensionMessage = {
      id: this.generateId(),
      type: 'request',
      agentId,
      action,
      data,
      timestamp: Date.now(),
      correlationId
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Request timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(correlationId, {
        resolve,
        reject,
        timeout: timeoutHandle
      });

      // Send message to background script
      chrome.runtime.sendMessage(message, (response: AgentResponse) => {
        const pendingRequest = this.pendingRequests.get(correlationId);
        if (pendingRequest) {
          clearTimeout(pendingRequest.timeout);
          this.pendingRequests.delete(correlationId);
          
          if (chrome.runtime.lastError) {
            pendingRequest.reject(new Error(chrome.runtime.lastError.message));
          } else {
            pendingRequest.resolve(response);
          }
        }
      });
    });
  }

  public async sendMessageToContentScript(tabId: number, action: string, data?: any, timeout: number = this.defaultTimeout): Promise<any> {
    const correlationId = this.generateId();
    const message = {
      action,
      data,
      correlationId
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Content script request timed out after ${timeout}ms`));
      }, timeout);

      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timeoutHandle);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  public async broadcastMessage(action: string, data?: any): Promise<void> {
    // Get all tabs
    const tabs = await chrome.tabs.query({});
    
    const message = {
      action,
      data,
      timestamp: Date.now()
    };

    // Send to all tabs (content scripts)
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch (error) {
          // Ignore errors for tabs that don't have content scripts
          console.log(`Could not send message to tab ${tab.id}:`, error);
        }
      }
    }
  }

  public async sendStreamingMessage(agentId: string, action: string, data?: any, onChunk?: (chunk: any) => void): Promise<AgentResponse> {
    // Implementation for streaming responses from OpenAI agents
    const correlationId = this.generateId();
    
    return new Promise((resolve, reject) => {
      const message: ExtensionMessage = {
        id: this.generateId(),
        type: 'request',
        agentId,
        action,
        data: { ...data, streaming: true },
        timestamp: Date.now(),
        correlationId
      };

      // Set up streaming response handler
      const streamHandler = (response: any) => {
        if (response.correlationId === correlationId) {
          if (response.type === 'stream-chunk' && onChunk) {
            onChunk(response.data);
          } else if (response.type === 'stream-end') {
            resolve(response);
          } else if (response.type === 'stream-error') {
            reject(new Error(response.error));
          }
        }
      };

      // Register temporary handler for streaming responses
      chrome.runtime.onMessage.addListener(streamHandler);

      // Send the streaming request
      chrome.runtime.sendMessage(message, (initialResponse) => {
        if (chrome.runtime.lastError) {
          chrome.runtime.onMessage.removeListener(streamHandler);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!initialResponse.success) {
          chrome.runtime.onMessage.removeListener(streamHandler);
          reject(new Error(initialResponse.error));
        }
        // Keep listener active for streaming chunks
      });

      // Set timeout for the entire streaming operation
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(streamHandler);
        reject(new Error('Streaming request timed out'));
      }, this.defaultTimeout * 2); // Longer timeout for streaming
    });
  }

  public async retryMessage(agentId: string, action: string, data?: any, maxRetries: number = 3, baseDelay: number = 1000): Promise<AgentResponse> {
    let lastError: Error = new Error('No attempts made');
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.sendMessageToAgent(agentId, action, data);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < maxRetries) {
          // Exponential backoff with jitter
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
          await this.sleep(delay);
          console.log(`Retry attempt ${attempt + 1} for action ${action} after ${delay}ms`);
        }
      }
    }
    
    throw new Error(`Failed after ${maxRetries + 1} attempts: ${lastError.message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Clean up method
  public destroy(): void {
    // Clear all pending requests
    for (const [correlationId, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Communication layer destroyed'));
    }
    this.pendingRequests.clear();
    this.messageHandlers.clear();
  }
}

// Singleton instance
export const agentCommunication = new AgentCommunicationLayer();
