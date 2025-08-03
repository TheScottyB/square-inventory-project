import OpenAI from 'openai';
import {
  AgentManagerInterface,
  AgentType,
  OpenAIAgentConfig,
  AgentContext,
  AgentMessage,
  AgentResponse,
  AgentStatus,
  BaseAgent,
  AgentTool,
  ChromeStorageData
} from '@/types';

export class AgentManager implements AgentManagerInterface {
  private agents: Map<string, BaseAgent> = new Map();
  private openaiClients: Map<string, OpenAI> = new Map();
  private messageQueue: Map<string, AgentMessage[]> = new Map();
  private correlationMap: Map<string, (response: AgentResponse) => void> = new Map();

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    // Load existing agents from storage
    await this.loadAgentsFromStorage();
    
    // Set up message listeners
    this.setupMessageListeners();
    
    console.log('🤖 AgentManager initialized');
  }

  private async loadAgentsFromStorage(): Promise<void> {
    try {
      const data = await this.getStorageData();
      if (data.agentConfigs && data.agentStates) {
        for (const [agentId, config] of Object.entries(data.agentConfigs)) {
          const state = data.agentStates[agentId];
          if (state) {
            await this.restoreAgent(agentId, config, state);
          }
        }
      }
    } catch (error) {
      console.error('❌ Failed to load agents from storage:', error);
    }
  }

  private async saveAgentToStorage(agentId: string): Promise<void> {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) return;

      const data = await this.getStorageData();
      
      if (!data.agentConfigs) data.agentConfigs = {};
      if (!data.agentStates) data.agentStates = {};
      
      data.agentConfigs[agentId] = agent.config;
      data.agentStates[agentId] = {
        type: agent.type,
        name: agent.name,
        status: agent.status,
        context: agent.context
      };

      await this.setStorageData(data);
    } catch (error) {
      console.error('❌ Failed to save agent to storage:', error);
    }
  }

  private async restoreAgent(agentId: string, config: OpenAIAgentConfig, state: any): Promise<void> {
    try {
      const agent: BaseAgent = {
        id: agentId,
        type: state.type,
        name: state.name,
        status: 'stopped', // Always start in stopped state
        config: config,
        context: state.context,
        tools: this.getToolsForAgentType(state.type)
      };

      this.agents.set(agentId, agent);
      this.openaiClients.set(agentId, new OpenAI({ apiKey: config.apiKey }));
      
      console.log(`🔄 Restored agent: ${agent.name} (${agentId})`);
    } catch (error) {
      console.error(`❌ Failed to restore agent ${agentId}:`, error);
    }
  }

  private setupMessageListeners(): void {
    // Listen for messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'agent-message') {
        this.handleExtensionMessage(message, sender).then(sendResponse);
        return true; // Will respond asynchronously
      }
    });
  }

  private async handleExtensionMessage(message: any, sender: chrome.runtime.MessageSender): Promise<AgentResponse> {
    try {
      const agentMessage: AgentMessage = {
        id: this.generateId(),
        type: message.messageType || 'request',
        agentId: message.agentId,
        action: message.action,
        data: message.data,
        timestamp: Date.now(),
        correlationId: message.correlationId
      };

      return await this.sendMessage(message.agentId, agentMessage);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        agentId: message.agentId || 'unknown',
        timestamp: Date.now(),
        correlationId: message.correlationId || this.generateId()
      };
    }
  }

  public async createAgent(type: AgentType, config: OpenAIAgentConfig): Promise<string> {
    const agentId = this.generateId();
    
    try {
      // Test OpenAI connection
      const client = new OpenAI({ apiKey: config.apiKey });
      await client.models.list(); // Test API key
      
      const agent: BaseAgent = {
        id: agentId,
        type,
        name: this.getAgentName(type),
        status: 'idle',
        config,
        tools: this.getToolsForAgentType(type)
      };

      this.agents.set(agentId, agent);
      this.openaiClients.set(agentId, client);
      this.messageQueue.set(agentId, []);

      await this.saveAgentToStorage(agentId);

      console.log(`✅ Created agent: ${agent.name} (${agentId})`);
      return agentId;
    } catch (error) {
      console.error(`❌ Failed to create agent:`, error);
      throw new Error(`Failed to create agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async startAgent(agentId: string, context?: AgentContext): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.status = 'running';
    if (context) {
      agent.context = context;
    }

    await this.saveAgentToStorage(agentId);
    console.log(`▶️ Started agent: ${agent.name} (${agentId})`);
  }

  public async stopAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.status = 'stopped';
    await this.saveAgentToStorage(agentId);
    console.log(`⏹️ Stopped agent: ${agent.name} (${agentId})`);
  }

  public async sendMessage(agentId: string, message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<AgentResponse> {
    const agent = this.agents.get(agentId);
    const client = this.openaiClients.get(agentId);

    if (!agent || !client) {
      throw new Error(`Agent ${agentId} not found or not initialized`);
    }

    const fullMessage: AgentMessage = {
      ...message,
      id: this.generateId(),
      timestamp: Date.now()
    };

    try {
      // Add message to queue
      const queue = this.messageQueue.get(agentId) || [];
      queue.push(fullMessage);
      this.messageQueue.set(agentId, queue);

      // Process message with OpenAI
      const response = await this.processMessageWithOpenAI(agent, client, fullMessage);

      return {
        success: true,
        data: response,
        agentId,
        timestamp: Date.now(),
        correlationId: fullMessage.correlationId || fullMessage.id
      };
    } catch (error) {
      agent.status = 'error';
      await this.saveAgentToStorage(agentId);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        agentId,
        timestamp: Date.now(),
        correlationId: fullMessage.correlationId || fullMessage.id
      };
    }
  }

  private async processMessageWithOpenAI(agent: BaseAgent, client: OpenAI, message: AgentMessage): Promise<any> {
    // Create system prompt based on agent type and context
    const systemPrompt = this.createSystemPrompt(agent);
    
    // Prepare tools for OpenAI function calling
    const tools = agent.tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));

    // Create messages array
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: this.formatMessageForOpenAI(message) }
    ];

    // Call OpenAI with function calling
    const completion = await client.chat.completions.create({
      model: agent.config.model || 'gpt-4',
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: agent.config.temperature || 0.7,
      max_tokens: agent.config.maxTokens || 1000
    });

    const choice = completion.choices[0];
    
    // Handle function calls
    if (choice.message.tool_calls) {
      const results = [];
      for (const toolCall of choice.message.tool_calls) {
        const tool = agent.tools.find(t => t.name === toolCall.function.name);
        if (tool) {
          try {
            const params = JSON.parse(toolCall.function.arguments);
            const result = await tool.handler(params);
            results.push({ tool: toolCall.function.name, result });
          } catch (error) {
            results.push({ 
              tool: toolCall.function.name, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
          }
        }
      }
      return { response: choice.message.content, toolResults: results };
    }

    return { response: choice.message.content };
  }

  private createSystemPrompt(agent: BaseAgent): string {
    const basePrompt = `You are ${agent.name}, a specialized AI agent running inside a Chrome extension for automating ${agent.type === 'square-automation' ? 'Square Dashboard' : 'Spocket product extraction'} operations.`;

    const contextPrompt = agent.context ? 
      `\n\nCurrent context:\n- Page: ${agent.context.pageType}\n- URL: ${agent.context.url}\n- Session: ${agent.context.sessionId}` : '';

    const toolsPrompt = agent.tools.length > 0 ? 
      `\n\nYou have access to the following tools:\n${agent.tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}` : '';

    return basePrompt + contextPrompt + toolsPrompt + '\n\nAlways use the appropriate tools to complete tasks efficiently and provide helpful responses.';
  }

  private formatMessageForOpenAI(message: AgentMessage): string {
    return `Action: ${message.action}\nData: ${JSON.stringify(message.data, null, 2)}`;
  }

  public async getAgentStatus(agentId: string): Promise<AgentStatus> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      lastActivity: agent.context?.timestamp || 0,
      tasksCompleted: 0, // TODO: Track this
      errors: 0 // TODO: Track this
    };
  }

  public async listAgents(): Promise<AgentStatus[]> {
    const statuses: AgentStatus[] = [];
    for (const agent of this.agents.values()) {
      statuses.push(await this.getAgentStatus(agent.id));
    }
    return statuses;
  }

  private getAgentName(type: AgentType): string {
    switch (type) {
      case 'square-automation':
        return 'Square Automation Agent';
      case 'spocket-extraction':
        return 'Spocket Extraction Agent';
      default:
        return 'Unknown Agent';
    }
  }

  private getToolsForAgentType(type: AgentType): AgentTool[] {
    switch (type) {
      case 'square-automation':
        return this.getSquareAutomationTools();
      case 'spocket-extraction':
        return this.getSpocketExtractionTools();
      default:
        return [];
    }
  }

  private getSquareAutomationTools(): AgentTool[] {
    return [
      {
        name: 'updateSEOFields',
        description: 'Update SEO fields on Square item pages',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'SEO title' },
            description: { type: 'string', description: 'SEO description' }
          },
          required: ['title', 'description']
        },
        handler: async (params) => {
          // This will be implemented to communicate with content script
          return await this.executeContentScriptAction('updateSEOFields', params);
        }
      },
      {
        name: 'extractItemData',
        description: 'Extract current item data from Square page',
        parameters: {
          type: 'object',
          properties: {}
        },
        handler: async () => {
          return await this.executeContentScriptAction('extractItemData', {});
        }
      }
    ];
  }

  private getSpocketExtractionTools(): AgentTool[] {
    return [
      {
        name: 'extractProductData',
        description: 'Extract product data from Spocket page',
        parameters: {
          type: 'object',
          properties: {}
        },
        handler: async () => {
          return await this.executeContentScriptAction('extractProductData', {});
        }
      },
      {
        name: 'captureImages',
        description: 'Capture product images from Spocket page',
        parameters: {
          type: 'object',
          properties: {}
        },
        handler: async () => {
          return await this.executeContentScriptAction('captureImages', {});
        }
      }
    ];
  }

  private async executeContentScriptAction(action: string, params: any): Promise<any> {
    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Send message to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action,
        data: params
      });

      return response;
    } catch (error) {
      throw new Error(`Failed to execute content script action: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private async getStorageData(): Promise<ChromeStorageData> {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (data) => {
        resolve(data as ChromeStorageData);
      });
    });
  }

  private async setStorageData(data: ChromeStorageData): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => {
        resolve();
      });
    });
  }

  // Public method to destroy agent manager
  public async destroy(): Promise<void> {
    // Stop all agents
    for (const agentId of this.agents.keys()) {
      await this.stopAgent(agentId);
    }

    // Clear all data
    this.agents.clear();
    this.openaiClients.clear();
    this.messageQueue.clear();
    this.correlationMap.clear();

    console.log('🗑️ AgentManager destroyed');
  }
}
