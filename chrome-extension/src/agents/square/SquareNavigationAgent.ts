import { z } from 'zod';
import { tool } from '@openai/agents';
import { DOMAgent } from '../base/DOMAgent';
import { AgentContext, AgentTask, AgentResult } from '../types';

/**
 * Specialized agent for Square Dashboard navigation
 * Handles page navigation, search, and URL management
 */
export class SquareNavigationAgent extends DOMAgent {
  private readonly SQUARE_BASE_URL = 'https://app.squareup.com';
  
  constructor(context: AgentContext) {
    super(context, {
      name: 'Square Navigation Agent',
      instructions: `You are an expert at navigating the Square Dashboard.
      
      Your capabilities include:
      - Navigating to specific items by ID
      - Using the Square search functionality
      - Managing browser navigation and URLs
      - Handling page load states and transitions
      - Working with Square's single-page application routing
      
      Navigation patterns:
      - Items library: /items/library
      - Item details: /items/library/{ITEM_ID}
      - Dashboard: /dashboard
      - Settings: /settings
      
      Always ensure pages are fully loaded before proceeding.
      Handle navigation errors gracefully with retries.`
    });
  }

  protected buildTools() {
    return [
      tool({
        name: 'navigate_to_url',
        description: 'Navigate to a specific URL',
        parameters: z.object({
          url: z.string().url(),
          waitForSelector: z.string().optional()
        }),
        execute: this.navigateToUrl.bind(this)
      }),
      tool({
        name: 'navigate_to_square_item',
        description: 'Navigate to a specific Square item by ID',
        parameters: z.object({
          itemId: z.string(),
          waitForLoad: z.boolean().default(true)
        }),
        execute: this.navigateToSquareItem.bind(this)
      }),
      tool({
        name: 'search_square_catalog',
        description: 'Search for items in Square catalog',
        parameters: z.object({
          searchTerm: z.string(),
          clickFirstResult: z.boolean().default(false)
        }),
        execute: this.searchSquareCatalog.bind(this)
      }),
      tool({
        name: 'navigate_to_section',
        description: 'Navigate to a specific Square Dashboard section',
        parameters: z.object({
          section: z.enum(['dashboard', 'items', 'customers', 'orders', 'reports', 'settings'])
        }),
        execute: this.navigateToSection.bind(this)
      }),
      tool({
        name: 'go_back',
        description: 'Navigate back in browser history',
        parameters: z.object({}),
        execute: this.goBack.bind(this)
      })
    ];
  }

  private async navigateToUrl({ url, waitForSelector }: { url: string; waitForSelector?: string }): Promise<AgentResult> {
    try {
      console.log(`🔗 Navigating to: ${url}`);
      
      // Use window.location for navigation
      window.location.href = url;
      
      // Wait for navigation to complete
      if (waitForSelector) {
        const loaded = await this.waitForElement(waitForSelector, 15000);
        if (!loaded) {
          return {
            success: false,
            error: `Navigation succeeded but element not found: ${waitForSelector}`
          };
        }
      } else {
        // Default wait for common Square elements
        await this.waitForSquarePageLoad();
      }
      
      return {
        success: true,
        message: `Navigated to ${url}`,
        data: { url, currentUrl: window.location.href }
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Navigation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async navigateToSquareItem({ itemId, waitForLoad }: { itemId: string; waitForLoad: boolean }): Promise<AgentResult> {
    try {
      console.log(`📦 Navigating to Square item: ${itemId}`);
      
      // Construct the item URL
      const itemUrl = `${this.SQUARE_BASE_URL}/items/library/${itemId}`;
      
      // Check if already on the item page
      if (window.location.href.includes(`/items/library/${itemId}`)) {
        console.log('Already on item page');
        return {
          success: true,
          message: 'Already on item page',
          data: { itemId, url: window.location.href }
        };
      }
      
      // Navigate to the item
      const navResult = await this.navigateToUrl({
        url: itemUrl,
        waitForSelector: waitForLoad ? '[data-test-id="item-detail-view"], .item-detail-container' : undefined
      });
      
      if (!navResult.success) {
        return navResult;
      }
      
      // Additional wait for item data to load
      if (waitForLoad) {
        await this.waitForItemPageLoad();
      }
      
      return {
        success: true,
        message: `Navigated to item ${itemId}`,
        data: {
          itemId,
          url: window.location.href,
          pageTitle: document.title
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Failed to navigate to item: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async searchSquareCatalog({ searchTerm, clickFirstResult }: { searchTerm: string; clickFirstResult: boolean }): Promise<AgentResult> {
    try {
      console.log(`🔍 Searching Square catalog for: ${searchTerm}`);
      
      // Find search input
      const searchSelectors = [
        'input[placeholder*="Search"]',
        'input[type="search"]',
        '[data-test-id="search-input"]',
        '.search-input'
      ];
      
      let searchInput: any = null;
      for (const selector of searchSelectors) {
        searchInput = await this.findElement(selector, 2000);
        if (searchInput.exists) break;
      }
      
      if (!searchInput || !searchInput.exists) {
        return {
          success: false,
          error: 'Search input not found'
        };
      }
      
      // Clear and type search term
      await this.typeInElement(searchInput.selector, searchTerm);
      
      // Trigger search (Enter key)
      const input = searchInput.element as HTMLInputElement;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      
      // Wait for results
      await this.sleep(2000);
      await this.waitForSearchResults();
      
      // Click first result if requested
      if (clickFirstResult) {
        const firstResult = await this.findElement('.catalog-item:first-child, [data-test-id="catalog-item"]:first-child', 3000);
        
        if (firstResult.exists) {
          await this.clickElement(firstResult.selector);
          await this.waitForItemPageLoad();
          
          return {
            success: true,
            message: `Searched for "${searchTerm}" and clicked first result`,
            data: { searchTerm, resultClicked: true }
          };
        }
      }
      
      return {
        success: true,
        message: `Searched for "${searchTerm}"`,
        data: { searchTerm, resultClicked: false }
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async navigateToSection({ section }: { section: string }): Promise<AgentResult> {
    try {
      console.log(`📍 Navigating to section: ${section}`);
      
      const sectionUrls: Record<string, string> = {
        dashboard: '/dashboard',
        items: '/items/library',
        customers: '/customers/directory',
        orders: '/orders',
        reports: '/reports',
        settings: '/settings'
      };
      
      const path = sectionUrls[section];
      if (!path) {
        return {
          success: false,
          error: `Unknown section: ${section}`
        };
      }
      
      const url = `${this.SQUARE_BASE_URL}${path}`;
      
      return await this.navigateToUrl({ url });
      
    } catch (error) {
      return {
        success: false,
        error: `Section navigation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async goBack(): Promise<AgentResult> {
    try {
      console.log('⬅️ Going back...');
      
      window.history.back();
      await this.sleep(1000);
      await this.waitForSquarePageLoad();
      
      return {
        success: true,
        message: 'Navigated back',
        data: { currentUrl: window.location.href }
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Back navigation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async waitForSquarePageLoad(): Promise<void> {
    // Wait for common Square page indicators
    const indicators = [
      '[data-test-id="page-loaded"]',
      '.page-content',
      '[role="main"]',
      '.dashboard-content'
    ];
    
    for (const indicator of indicators) {
      const found = await this.waitForElement(indicator, 5000);
      if (found) break;
    }
    
    // Additional wait for any loading spinners to disappear
    await this.waitForElementToDisappear('.loading-spinner, .spinner, [data-test-id="loading"]', 5000);
  }

  private async waitForItemPageLoad(): Promise<void> {
    // Wait for item-specific elements
    await this.waitForElement('[data-test-id="item-name-input"], .item-detail-header, h1', 10000);
    
    // Wait for form fields to be ready
    await this.sleep(1000);
  }

  private async waitForSearchResults(): Promise<void> {
    // Wait for search results to appear
    const resultSelectors = [
      '.catalog-item',
      '[data-test-id="catalog-item"]',
      '.search-results',
      '.items-grid'
    ];
    
    for (const selector of resultSelectors) {
      const found = await this.waitForElement(selector, 5000);
      if (found) break;
    }
  }

  protected async executeTaskInternal(task: AgentTask): Promise<AgentResult> {
    switch (task.type) {
      case 'navigate':
        if (task.data.itemId) {
          return await this.navigateToSquareItem({
            itemId: task.data.itemId,
            waitForLoad: task.data.waitForLoad !== false
          });
        } else if (task.data.url) {
          return await this.navigateToUrl({
            url: task.data.url,
            waitForSelector: task.data.waitForSelector
          });
        } else if (task.data.section) {
          return await this.navigateToSection({ section: task.data.section });
        }
        break;
        
      case 'search':
        return await this.searchSquareCatalog({
          searchTerm: task.data.searchTerm,
          clickFirstResult: task.data.clickFirstResult || false
        });
        
      default:
        return {
          success: false,
          error: `Unknown task type: ${task.type}`
        };
    }
    
    return {
      success: false,
      error: 'Invalid navigation task data'
    };
  }
}