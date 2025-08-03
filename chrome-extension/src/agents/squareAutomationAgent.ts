import { AgentTool, SquareAutomationAgentTools, SquareFormData, SquareItem } from '@/types';

export const squareAutomationTools: AgentTool[] = [
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
    handler: async (params: SquareFormData) => {
      // Logic to update SEO fields
      console.log('Updating SEO fields with:', params);
      // Simulate success
      return true;
    }
  },
  {
    name: 'extractItemData',
    description: 'Extract current item data from Square page',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: async (): Promise<SquareItem> => {
      // Logic to extract item data
      console.log('Extracting item data');
      // Simulate extracted data
      return {
        id: 'example-id',
        name: 'Example Item'
      };
    }
  },
  {
    name: 'fillForm',
    description: 'Fill Square item form with provided data',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Item name' },
        description: { type: 'string', description: 'Item description' },
        price: { type: 'number', description: 'Item price' },
        category: { type: 'string', description: 'Item category' }
      },
      required: ['name', 'price']
    },
    handler: async (data: SquareFormData) => {
      // Logic to fill form
      console.log('Filling form with:', data);
      // Simulate success
      return true;
    }
  }
];
