import { AgentContext, ChromeStorageData } from '@/types';

class AgentContextManager {
  private contextKey = 'agentContext';

  // Retrieve agent context from storage
  public async getContext(): Promise<AgentContext | null> {
    const data: ChromeStorageData = await this.getStorageData();
    return (data as any)[this.contextKey] || null;
  }

  // Save agent context to storage
  public async setContext(context: AgentContext): Promise<void> {
    const data: ChromeStorageData = await this.getStorageData();
    data[this.contextKey] = context;
    await this.setStorageData(data);
  }

  // Clear agent context from storage
  public async clearContext(): Promise<void> {
    const data: ChromeStorageData = await this.getStorageData();
    delete data[this.contextKey];
    await this.setStorageData(data);
  }

  // Serialize context to a string
  public serializeContext(context: AgentContext): string {
    return JSON.stringify(context);
  }

  // Deserialize context from a string
  public deserializeContext(serializedContext: string): AgentContext {
    return JSON.parse(serializedContext);
  }

  // Retrieve storage data
  private async getStorageData(): Promise<ChromeStorageData> {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (data) => {
        resolve(data as ChromeStorageData);
      });
    });
  }

  // Set storage data
  private async setStorageData(data: ChromeStorageData): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => {
        resolve();
      });
    });
  }

  // Cleanup memory leaks by removing old contexts
  public async cleanupContexts(): Promise<void> {
    const now = Date.now();
    const context = await this.getContext();
    if (context && now - context.timestamp > 24 * 60 * 60 * 1000) { // 1 day
      await this.clearContext();
    }
  }
}

// Singleton instance
export const agentContextManager = new AgentContextManager();
