// API key management for OpenAI agents in Chrome Extension

// Function to retrieve the OpenAI API key from Chrome storage
export async function getOpenAIApiKey(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['openaiApiKey'], (result) => {
      resolve(result.openaiApiKey || null);
    });
  });
}

// Function to set the OpenAI API key in Chrome storage
export async function setOpenAIApiKey(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ openaiApiKey: apiKey }, () => {
      resolve();
    });
  });
}

// Function to remove the OpenAI API key from Chrome storage
export async function removeOpenAIApiKey(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['openaiApiKey'], () => {
      resolve();
    });
  });
}
