import { AgentManager } from '@/agents/AgentManager';
import { getOpenAIApiKey } from '@/utils/apiKeyManager';

(async () => {
  try {
    const apiKey = await getOpenAIApiKey();
    if (apiKey) {
      const config = { apiKey };
      const agentManager = new AgentManager();
      await agentManager.createAgent('square-automation', config);
      await agentManager.createAgent('spocket-extraction', config);

      console.log('OpenAI agents initialized');
    } else {
      console.log('No OpenAI API key found in storage. Please set it first.');
    }
  } catch (error) {
    console.error('Failed to initialize OpenAI agents:', error);
  }
})();

