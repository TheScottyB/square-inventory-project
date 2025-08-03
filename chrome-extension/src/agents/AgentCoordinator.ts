import { Agent, run } from '@openai/agents';
import { z } from 'zod';
import { DOMAgent } from './base/DOMAgent';
import { SquareSEOAgent } from './square/SquareSEOAgent';
import { SquareNavigationAgent } from './square/SquareNavigationAgent';
import { AgentContext, AgentTask, AgentResult, PageContext } from './types';

/**
 * Central coordinator for managing multiple DOM agents
 * Handles task routing, agent lifecycle, and inter-agent communication
 */
export class AgentCoordinator {
  private agents: Map<string, DOMAgent> = new Map();
  private coordinatorAgent: Agent;
  private context: AgentContext;
  private isInitialized = false;

  constructor(context: AgentContext) {
    this.context = context;
    
    // Initialize the meta-agent that coordinates other agents
    this.coordinatorAgent = new Agent({
      name: 'Agent Coordinator',
      instructions: `You are the central coordinator for a team of specialized DOM automation agents.
      
      Your role is to:
      - Route tasks to the most appropriate specialized agent
      - Coordinate multi-step workflows that require multiple agents
      - Handle fallbacks when agents fail
      - Optimize task execution order for efficiency
      - Monitor agent performance and health
      
      Available agents and their capabilities:
      - SquareSEOAgent: SEO optimization, form filling, content generation
      - SquareNavigationAgent: Page navigation, search, URL management
      
      Always choose the most specialized agent for each task type.`,
      model: 'gpt-4o-mini',
      tools: this.buildCoordinatorTools()
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('🚀 Initializing Agent Coordinator...');

    try {
      // Initialize specialized agents based on page context
      await this.initializeAgents();
      
      // Set up inter-agent communication
      this.setupAgentCommunication();
      
      // Start monitoring page changes
      this.startPageMonitoring();
      
      this.isInitialized = true;
      console.log('✅ Agent Coordinator initialized successfully');
      
      // Notify background script
      chrome.runtime.sendMessage({
        action: 'agentCoordinatorReady',
        agentCount: this.agents.size,
        pageContext: this.context.page
      });

    } catch (error) {
      console.error('❌ Failed to initialize Agent Coordinator:', error);
      throw error;
    }
  }

  private async initializeAgents(): Promise<void> {
    const { pageType } = this.context.page;

    // Always initialize navigation agent for Square pages
    if (pageType !== 'unknown' && window.location.hostname.includes('squareup.com')) {
      const navAgent = new SquareNavigationAgent(this.context);
      this.agents.set('navigation', navAgent);
      console.log('📍 Navigation agent initialized');
    }

    // Initialize SEO agent for item pages
    if (pageType === 'item-detail' || pageType === 'items-library') {
      const seoAgent = new SquareSEOAgent(this.context);
      this.agents.set('seo', seoAgent);
      console.log('🎯 SEO agent initialized');
    }

    // Could add more agents here based on page context
    // - ImageAgent for image-heavy pages
    // - FormAgent for form-heavy pages
    // - DataExtractionAgent for catalog pages
  }

  private buildCoordinatorTools() {
    return [
      {
        name: 'route_task_to_agent',
        description: 'Route a task to the most appropriate specialized agent',
        parameters: z.object({
          agentType: z.enum(['seo', 'navigation', 'image', 'form']).describe('Type of agent to use'),
          task: z.object({
            type: z.string(),
            data: z.any(),
            priority: z.enum(['high', 'medium', 'low']).optional()
          }).describe('Task to execute')
        }),
        handler: this.routeTaskToAgent.bind(this)
      },
      {
        name: 'execute_workflow',
        description: 'Execute a multi-step workflow across multiple agents',
        parameters: z.object({
          workflow: z.object({
            name: z.string(),
            steps: z.array(z.object({
              agentType: z.string(),
              action: z.string(),
              data: z.any(),
              dependsOn: z.array(z.string()).optional()
            }))
          })
        }),
        handler: this.executeWorkflow.bind(this)
      },
      {
        name: 'get_agent_status',
        description: 'Get status and capabilities of all agents',
        parameters: z.object({}),
        handler: this.getAgentStatus.bind(this)
      },
      {
        name: 'reinitialize_agents',
        description: 'Reinitialize agents for new page context',
        parameters: z.object({
          newPageContext: z.object({
            url: z.string(),
            pageType: z.string(),
            itemId: z.string().optional()
          })
        }),
        handler: this.reinitializeAgents.bind(this)
      }
    ];
  }

  private async routeTaskToAgent({ agentType, task }): Promise<AgentResult> {
    const agent = this.agents.get(agentType);
    
    if (!agent) {
      return {
        success: false,
        error: `Agent type '${agentType}' not available. Available agents: ${Array.from(this.agents.keys()).join(', ')}`
      };
    }

    console.log(`🎯 Routing ${task.type} task to ${agentType} agent`);

    const agentTask: AgentTask = {
      id: `${agentType}-${Date.now()}`,
      type: task.type as any,
      priority: task.priority || 'medium',
      data: task.data,
      maxRetries: 2,
      retryCount: 0
    };

    return await agent.executeTask(agentTask);
  }

  private async executeWorkflow({ workflow }): Promise<{ success: boolean; results: AgentResult[]; message: string }> {
    console.log(`🔄 Executing workflow: ${workflow.name}`);
    
    const results: AgentResult[] = [];
    const stepResults = new Map<string, AgentResult>();

    try {
      // Execute steps in dependency order
      for (const step of workflow.steps) {
        // Check if dependencies are satisfied
        if (step.dependsOn) {
          const dependenciesMet = step.dependsOn.every(dep => 
            stepResults.has(dep) && stepResults.get(dep)?.success
          );
          
          if (!dependenciesMet) {
            const failedResult: AgentResult = {
              success: false,
              error: `Dependencies not met for step: ${step.action}`,
              data: step.data
            };
            results.push(failedResult);
            stepResults.set(step.action, failedResult);
            continue;
          }
        }

        // Execute the step
        const result = await this.routeTaskToAgent({
          agentType: step.agentType as any,
          task: {
            type: step.action,
            data: step.data,
            priority: 'medium'
          }
        });

        results.push(result);
        stepResults.set(step.action, result);

        // If step failed and it's critical, stop workflow
        if (!result.success) {
          console.warn(`⚠️ Workflow step failed: ${step.action}`, result.error);
          // Continue with non-critical failures, but log them
        }
      }

      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;

      return {
        success: successCount > 0,
        results,
        message: `Workflow '${workflow.name}' completed: ${successCount}/${totalCount} steps successful`
      };

    } catch (error) {
      return {
        success: false,
        results,
        message: `Workflow '${workflow.name}' failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async getAgentStatus(): Promise<{ agents: Record<string, any>; coordinator: any }> {
    const agentStatus: Record<string, any> = {};

    for (const [name, agent] of this.agents) {
      agentStatus[name] = {
        initialized: true,
        capabilities: (agent as any).context?.capabilities || {},
        taskQueueLength: (agent as any).taskQueue?.length || 0,
        isProcessing: (agent as any).isProcessing || false
      };
    }

    return {
      agents: agentStatus,
      coordinator: {
        initialized: this.isInitialized,
        agentCount: this.agents.size,
        pageContext: this.context.page
      }
    };
  }

  private async reinitializeAgents({ newPageContext }): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔄 Reinitializing agents for new page context:', newPageContext);

      // Update context
      this.context.page = newPageContext as PageContext;

      // Cleanup existing agents
      for (const agent of this.agents.values()) {
        agent.destroy();
      }
      this.agents.clear();

      // Reinitialize with new context
      await this.initializeAgents();

      return {
        success: true,
        message: `Agents reinitialized for ${newPageContext.pageType} page`
      };

    } catch (error) {
      return {
        success: false,
        message: `Agent reinitialization failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private setupAgentCommunication(): void {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleExternalMessage(message, sender, sendResponse);
      return true; // Will respond asynchronously
    });
  }

  private async handleExternalMessage(message: any, sender: any, sendResponse: Function): Promise<void> {
    try {
      console.log('📨 Coordinator received message:', message);

      switch (message.action) {
        case 'executeTask':
          const result = await this.executeTask(message.task);
          sendResponse(result);
          break;

        case 'executeWorkflow':
          const workflowResult = await this.executeWorkflow({ workflow: message.workflow });
          sendResponse(workflowResult);
          break;

        case 'getStatus':
          const status = await this.getAgentStatus();
          sendResponse(status);
          break;

        case 'updateSEO':
          const seoResult = await this.handleSEOUpdate(message.data);
          sendResponse(seoResult);
          break;

        case 'navigateToItem':
          const navResult = await this.handleNavigation(message.itemId);
          sendResponse(navResult);
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }

    } catch (error) {
      console.error('❌ Error handling message:', error);
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  private startPageMonitoring(): void {
    // Monitor for page navigation
    let currentUrl = window.location.href;
    
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        this.handlePageChange();
      }
    });

    urlObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private async handlePageChange(): Promise<void> {
    console.log('📄 Page change detected, updating context...');
    
    // Detect new page context
    const newPageContext = await this.detectPageContext();
    
    // Reinitialize agents if needed
    if (newPageContext.pageType !== this.context.page.pageType) {
      await this.reinitializeAgents({ newPageContext });
    } else {
      // Just update context
      this.context.page = newPageContext;
    }
  }

  private async detectPageContext(): Promise<PageContext> {
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

  /**
   * Public API methods
   */
  async executeTask(task: AgentTask): Promise<AgentResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const prompt = `Execute the following task using the most appropriate agent:
    
Task Type: ${task.type}
Priority: ${task.priority}
Data: ${JSON.stringify(task.data)}

Analyze the task and route it to the correct specialized agent.`;

    try {
      const result = await run(this.coordinatorAgent, prompt, {
        context: this.context
      });

      return {
        success: true,
        message: result,
        data: task.data
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async handleSEOUpdate(seoData: any): Promise<AgentResult> {
    const seoAgent = this.agents.get('seo') as SquareSEOAgent;
    
    if (!seoAgent) {
      return {
        success: false,
        error: 'SEO agent not available for current page'
      };
    }

    return await seoAgent.handleSEOUpdate(seoData.seoData, seoData.itemId);
  }

  async handleNavigation(itemId: string): Promise<AgentResult> {
    const navAgent = this.agents.get('navigation') as SquareNavigationAgent;
    
    if (!navAgent) {
      return {
        success: false,
        error: 'Navigation agent not available'
      };
    }

    return await navAgent.navigateToSquareItem(itemId);
  }

  getAvailableAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  isAgentAvailable(agentType: string): boolean {
    return this.agents.has(agentType);
  }

  destroy(): void {
    console.log('🧹 Destroying Agent Coordinator...');
    
    for (const agent of this.agents.values()) {
      agent.destroy();
    }
    
    this.agents.clear();
    this.isInitialized = false;
  }
}