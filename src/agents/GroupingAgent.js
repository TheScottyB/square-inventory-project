import { Agent, OpenAIChatCompletionsModel, system, user } from '@openai/agents';
import { config } from '../config/index.js';

/**
 * GroupingAgent - Clusters analyzed products into similar groups
 * Uses OpenAI Agent SDK to evaluate descriptions and similarity metrics
 */
export class GroupingAgent {
  constructor() {
    // Initialize the OpenAI model with configuration
    this.model = new OpenAIChatCompletionsModel({
      model: config.openai.model,
      temperature: config.openai.temperature,
      maxTokens: config.openai.maxTokens,
      apiKey: config.openai.apiKey,
    });

    // Create the agent with system instructions for grouping
    this.agent = new Agent({
      name: 'GroupingAgent',
      model: this.model,
      instructions: this.getSystemInstructions(),
    });

    // Configuration from central config
    this.similarityThreshold = config.agents.grouping.similarityThreshold;
    this.maxGroupSize = config.agents.grouping.maxGroupSize;
    this.enableDryRun = config.app.enableDryRun;
  }

  /**
   * Get system instructions for the grouping agent
   * @returns {string} System prompt for the agent
   */
  getSystemInstructions() {
    return system(`You are a master organizer specializing in grouping similar products into cohesive collections.
Your task is to process a list of product metadata, including descriptions, and group them into collections that are meaningful in retail environments.

For each product, determine its primary features and identify other items in the list that should belong to the same group.

Guidelines:
- Use ${this.similarityThreshold} as the baseline for grouping
- Limit groups to ${this.maxGroupSize} items or fewer
- Justify each grouping with a brief rationale

Output format must be valid JSON with the structure:
{
  "groups": [
    {
      "groupId": "string",
      "items": [{"id": "string", "justification": "string"}],
      "groupName": "string",
      "rationale": "string"
    }
  ],
  "confidence": number // 0-1 score for grouping confidence
}`);
  }

  /**
   * Groups a list of product descriptions into coherent collections
   * @param {Object[]} products - Array of product description objects
   * @returns {Promise<Object>} Grouping results
   */
  async groupProducts(products) {
    if (this.enableDryRun) {
      console.log(`[DRY RUN] Would group ${products.length} products based on similarity.`);
      return this.getMockGroupingResult(products);
    }

    try {
      console.log(`Grouping ${products.length} products using similarity threshold of ${this.similarityThreshold}...`);

      // Create user message with product descriptions
      const productDescriptions = products.map(prod => {
        return `Item ID: ${prod.metadata.filename}
Description: ${prod.description}
\n---\n`;
      }).join('\n');

      const groupingMessage = user([
        {
          type: 'text',
          text: `Analyze the following product descriptions and cluster similar items into groups according to specified guidelines.`
        },
        {
          type: 'text',
          text: productDescriptions
        }
      ]);

      // Run the agent
      const result = await this.agent.run([groupingMessage]);
      
      // Extract and parse the response
      const response = result.content.find(item => item.type === 'text')?.text || '';
      const groupingResult = this.parseAgentResponse(response);

      console.log(`✓ Successfully grouped products into ${groupingResult.groups.length} collections.`);
      return groupingResult;

    } catch (error) {
      console.warn(`Failed to group products: ${error.message}`);
      throw new Error(`Could not complete grouping operation: ${error.message}`);
    }
  }

  /**
   * Parses agent's JSON response for grouping
   * @param {string} response - Raw response from the agent
   * @returns {Object} Parsed grouping result
   */
  parseAgentResponse(response) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate and enforce group size constraints
      for (const group of parsed.groups) {
        if (group.items.length > this.maxGroupSize) {
          console.warn(`Group ${group.groupId} exceeds max size; reducing to top ${this.maxGroupSize} items.`);
          group.items = group.items.slice(0, this.maxGroupSize);
        }
      }
      return parsed;

    } catch (error) {
      console.warn(`Failed to parse JSON response for grouping operation: ${error.message}`);
      console.warn('Raw response:', response);
      return this.getFallbackGroupingResult(response);
    }
  }

  /**
   * Creates a mock grouping result for dry-run mode
   * @param {Object[]} products - List of product objects
   * @returns {Object} Mock grouping result
   */
  getMockGroupingResult(products) {
    return {
      groups: products.reduce((acc, prod, index) => {
        const groupId = `group-${Math.floor(index / this.maxGroupSize)}`;
        acc[groupId] = acc[groupId] || { groupId, items: [] };
        acc[groupId].items.push({ id: prod.metadata.filename, justification: '[DRY RUN] Mock justification for dummy grouping.' });
        return acc;
      }, {}),
      confidence: 0.5
    };
  }

  /**
   * Provides fallback grouping result when parsing fails
   * @param {string} rawResponse - Original response that failed to parse
   * @returns {Object} Fallback grouping result
   */
  getFallbackGroupingResult(rawResponse) {
    return {
      groups: [],
      confidence: 0.0,
      parseError: true,
      rawResponse: rawResponse.slice(0, 200) // keep a snippet for debugging
    };
  }
}

export default GroupingAgent;
