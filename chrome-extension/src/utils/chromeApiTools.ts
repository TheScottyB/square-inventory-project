import { AgentTool } from '@/types';

// Chrome Downloads API Tools
export const chromeDownloadsTools: AgentTool[] = [
  {
    name: 'downloadFile',
    description: 'Download a file from a URL using Chrome downloads API',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL of the file to download' },
        filename: { type: 'string', description: 'Filename to save as' },
        conflictAction: { 
          type: 'string', 
          enum: ['uniquify', 'overwrite', 'prompt'],
          description: 'How to handle filename conflicts'
        }
      },
      required: ['url', 'filename']
    },
    handler: async (params: { url: string; filename: string; conflictAction?: string }) => {
      try {
        const downloadId = await chrome.downloads.download({
          url: params.url,
          filename: params.filename,
          conflictAction: (params.conflictAction as any) || 'uniquify'
        });

        return {
          success: true,
          downloadId,
          message: `Download started: ${params.filename}`
        };
      } catch (error) {
        throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  },
  {
    name: 'getDownloadStatus',
    description: 'Get the status of a download by ID',
    parameters: {
      type: 'object',
      properties: {
        downloadId: { type: 'number', description: 'ID of the download to check' }
      },
      required: ['downloadId']
    },
    handler: async (params: { downloadId: number }) => {
      try {
        const downloads = await chrome.downloads.search({ id: params.downloadId });
        return downloads[0] || null;
      } catch (error) {
        throw new Error(`Failed to get download status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
];

// Chrome Storage API Tools
export const chromeStorageTools: AgentTool[] = [
  {
    name: 'storageGet',
    description: 'Get data from Chrome storage',
    parameters: {
      type: 'object',
      properties: {
        keys: { 
          type: 'array',
          items: { type: 'string' },
          description: 'Array of keys to retrieve, or null for all data'
        }
      }
    },
    handler: async (params: { keys?: string[] }) => {
      try {
        return new Promise((resolve) => {
          chrome.storage.local.get(params.keys || null, (result) => {
            resolve(result);
          });
        });
      } catch (error) {
        throw new Error(`Storage get failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  },
  {
    name: 'storageSet',
    description: 'Set data in Chrome storage',
    parameters: {
      type: 'object',
      properties: {
        data: { 
          type: 'object',
          description: 'Object with key-value pairs to store'
        }
      },
      required: ['data']
    },
    handler: async (params: { data: Record<string, any> }) => {
      try {
        return new Promise((resolve) => {
          chrome.storage.local.set(params.data, () => {
            resolve({ success: true, message: 'Data stored successfully' });
          });
        });
      } catch (error) {
        throw new Error(`Storage set failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  },
  {
    name: 'storageClear',
    description: 'Clear all data from Chrome storage',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      try {
        return new Promise((resolve) => {
          chrome.storage.local.clear(() => {
            resolve({ success: true, message: 'Storage cleared successfully' });
          });
        });
      } catch (error) {
        throw new Error(`Storage clear failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
];

// Chrome Tabs API Tools
export const chromeTabsTools: AgentTool[] = [
  {
    name: 'getCurrentTab',
    description: 'Get information about the current active tab',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
      } catch (error) {
        throw new Error(`Failed to get current tab: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  },
  {
    name: 'navigateTab',
    description: 'Navigate a tab to a specific URL',
    parameters: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'ID of the tab to navigate' },
        url: { type: 'string', description: 'URL to navigate to' }
      },
      required: ['tabId', 'url']
    },
    handler: async (params: { tabId: number; url: string }) => {
      try {
        await chrome.tabs.update(params.tabId, { url: params.url });
        return { success: true, message: `Navigated tab ${params.tabId} to ${params.url}` };
      } catch (error) {
        throw new Error(`Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  },
  {
    name: 'createTab',
    description: 'Create a new tab',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open in the new tab' },
        active: { type: 'boolean', description: 'Whether the new tab should be active' }
      },
      required: ['url']
    },
    handler: async (params: { url: string; active?: boolean }) => {
      try {
        const tab = await chrome.tabs.create({
          url: params.url,
          active: params.active !== false
        });
        return { success: true, tab, message: `New tab created: ${params.url}` };
      } catch (error) {
        throw new Error(`Tab creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
];

// Chrome Scripting API Tools
export const chromeScriptingTools: AgentTool[] = [
  {
    name: 'executeScript',
    description: 'Execute a script in a tab',
    parameters: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'ID of the tab to execute script in' },
        code: { type: 'string', description: 'JavaScript code to execute' },
        allFrames: { type: 'boolean', description: 'Execute in all frames' }
      },
      required: ['tabId', 'code']
    },
    handler: async (params: { tabId: number; code: string; allFrames?: boolean }) => {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: params.tabId, allFrames: params.allFrames },
          func: () => eval(params.code)
        });
        return { success: true, results, message: 'Script executed successfully' };
      } catch (error) {
        throw new Error(`Script execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  },
  {
    name: 'insertCSS',
    description: 'Insert CSS into a tab',
    parameters: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'ID of the tab to insert CSS into' },
        css: { type: 'string', description: 'CSS code to insert' },
        allFrames: { type: 'boolean', description: 'Insert in all frames' }
      },
      required: ['tabId', 'css']
    },
    handler: async (params: { tabId: number; css: string; allFrames?: boolean }) => {
      try {
        await chrome.scripting.insertCSS({
          target: { tabId: params.tabId, allFrames: params.allFrames },
          css: params.css
        });
        return { success: true, message: 'CSS inserted successfully' };
      } catch (error) {
        throw new Error(`CSS insertion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
];

// DOM Manipulation Tools (to be executed in content scripts)
export const domManipulationTools: AgentTool[] = [
  {
    name: 'clickElement',
    description: 'Click an element on the page',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the element to click' },
        waitForElement: { type: 'boolean', description: 'Wait for element to appear before clicking' },
        timeout: { type: 'number', description: 'Timeout in milliseconds for waiting' }
      },
      required: ['selector']
    },
    handler: async (params: { selector: string; waitForElement?: boolean; timeout?: number }) => {
      // This would be executed in a content script context
      const code = `
        (async () => {
          const selector = "${params.selector}";
          const waitForElement = ${params.waitForElement || false};
          const timeout = ${params.timeout || 5000};
          
          let element = document.querySelector(selector);
          
          if (!element && waitForElement) {
            const startTime = Date.now();
            while (!element && (Date.now() - startTime) < timeout) {
              await new Promise(resolve => setTimeout(resolve, 100));
              element = document.querySelector(selector);
            }
          }
          
          if (element) {
            element.click();
            return { success: true, message: 'Element clicked successfully' };
          } else {
            throw new Error('Element not found: ' + selector);
          }
        })();
      `;
      
      // This would need to be executed via chrome.scripting.executeScript
      // For now, return the code to be executed
      return { success: true, code, message: 'Click command prepared' };
    }
  },
  {
    name: 'fillInput',
    description: 'Fill an input field with text',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the input element' },
        value: { type: 'string', description: 'Value to fill in the input' },
        clearFirst: { type: 'boolean', description: 'Clear the input before filling' }
      },
      required: ['selector', 'value']
    },
    handler: async (params: { selector: string; value: string; clearFirst?: boolean }) => {
      const code = `
        (async () => {
          const selector = "${params.selector}";
          const value = "${params.value}";
          const clearFirst = ${params.clearFirst || true};
          
          const element = document.querySelector(selector);
          if (element) {
            if (clearFirst) {
              element.value = '';
            }
            
            element.focus();
            element.value = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.blur();
            
            return { success: true, message: 'Input filled successfully' };
          } else {
            throw new Error('Input element not found: ' + selector);
          }
        })();
      `;
      
      return { success: true, code, message: 'Fill input command prepared' };
    }
  },
  {
    name: 'extractText',
    description: 'Extract text content from an element',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the element' },
        attribute: { type: 'string', description: 'Attribute to extract instead of text content' }
      },
      required: ['selector']
    },
    handler: async (params: { selector: string; attribute?: string }) => {
      const code = `
        (async () => {
          const selector = "${params.selector}";
          const attribute = "${params.attribute || ''}";
          
          const element = document.querySelector(selector);
          if (element) {
            const value = attribute ? 
              element.getAttribute(attribute) : 
              element.textContent || element.innerText;
            
            return { success: true, value, message: 'Text extracted successfully' };
          } else {
            throw new Error('Element not found: ' + selector);
          }
        })();
      `;
      
      return { success: true, code, message: 'Extract text command prepared' };
    }
  }
];

// Combine all tools
export const allChromeApiTools: AgentTool[] = [
  ...chromeDownloadsTools,
  ...chromeStorageTools,
  ...chromeTabsTools,
  ...chromeScriptingTools,
  ...domManipulationTools
];
