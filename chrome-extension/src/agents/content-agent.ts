import { AgentCoordinator } from './AgentCoordinator';
import { AgentContext, PageContext } from './types';

/**
 * Main entry point for the OpenAI Agents system in content scripts
 * Initializes and manages the agent coordinator
 */
export class ContentAgentManager {
  private coordinator: AgentCoordinator | null = null;
  private context: AgentContext;

  constructor() {
    this.context = {
      page: this.detectPageContext(),
      storage: chrome.storage.local,
      messaging: chrome.runtime,
      capabilities: {
        canFillForms: true,
        canNavigate: true,
        canExtractData: true,
        canManageImages: true,
        supportedPageTypes: ['items-library', 'item-detail', 'dashboard', 'spocket']
      }
    };
  }

  async initialize(): Promise<void> {
    console.log('🤖 Initializing Content Agent Manager...');
    
    try {
      this.coordinator = new AgentCoordinator(this.context);
      await this.coordinator.initialize();
      
      console.log('✅ Content Agent Manager ready');
      
      // Notify background script
      chrome.runtime.sendMessage({
        action: 'contentAgentsReady',
        pageContext: this.context.page,
        capabilities: this.context.capabilities
      });

    } catch (error) {
      console.error('❌ Failed to initialize Content Agent Manager:', error);
      throw error;
    }
  }

  private detectPageContext(): PageContext {
    const url = window.location.href;
    const title = document.title;
    const readyState = document.readyState;
    
    let pageType: PageContext['pageType'] = 'unknown';
    let itemId: string | undefined;

    if (url.includes('/items/library')) {
      const itemMatch = url.match(/\/items\/library\/([A-Z0-9]+)/);
      if (itemMatch) {
        pageType = 'item-detail';
        itemId = itemMatch[1];
      } else {
        pageType = 'items-library';
      }
    } else if (url.includes('/dashboard')) {
      pageType = 'dashboard';
    } else if (url.includes('spocket.co')) {
      pageType = 'spocket';
    }

    return { url, pageType, itemId, title, readyState };
  }

  async executeTask(task: any): Promise<any> {
    if (!this.coordinator) {
      throw new Error('Agent coordinator not initialized');
    }
    
    return await this.coordinator.executeTask(task);
  }

  async updateSEO(seoData: any): Promise<any> {
    if (!this.coordinator) {
      throw new Error('Agent coordinator not initialized');
    }
    
    return await this.coordinator.handleSEOUpdate(seoData);
  }

  async navigateToItem(itemId: string): Promise<any> {
    if (!this.coordinator) {
      throw new Error('Agent coordinator not initialized');
    }
    
    return await this.coordinator.handleNavigation(itemId);
  }

  getAvailableAgents(): string[] {
    return this.coordinator?.getAvailableAgents() || [];
  }

  destroy(): void {
    if (this.coordinator) {
      this.coordinator.destroy();
      this.coordinator = null;
    }
  }
}

// Global instance
let contentAgentManager: ContentAgentManager | null = null;

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAgents);
} else {
  initializeAgents();
}

async function initializeAgents() {
  try {
    if (!contentAgentManager) {
      contentAgentManager = new ContentAgentManager();
      await contentAgentManager.initialize();
      
      // Make it globally available for debugging
      (window as any).contentAgentManager = contentAgentManager;
    }
  } catch (error) {
    console.error('Failed to initialize content agents:', error);
  }
}

// Handle cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (contentAgentManager) {
    contentAgentManager.destroy();
    contentAgentManager = null;
  }
});

// Export for external use
export { contentAgentManager };