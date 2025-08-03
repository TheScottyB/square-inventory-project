import { AgentTask, AgentResult, PageContext } from '../types';

describe('Agent Types', () => {
  describe('AgentTask', () => {
    it('should create a valid agent task', () => {
      const task: AgentTask = {
        id: 'test-123',
        type: 'seo-update',
        priority: 'high',
        data: { title: 'Test Product' }
      };

      expect(task.id).toBe('test-123');
      expect(task.type).toBe('seo-update');
      expect(task.priority).toBe('high');
      expect(task.data).toEqual({ title: 'Test Product' });
    });
  });

  describe('AgentResult', () => {
    it('should create a successful result', () => {
      const result: AgentResult = {
        success: true,
        message: 'Task completed successfully',
        data: { updated: true }
      };

      expect(result.success).toBe(true);
      expect(result.message).toBe('Task completed successfully');
      expect(result.data).toEqual({ updated: true });
    });

    it('should create a failed result', () => {
      const result: AgentResult = {
        success: false,
        error: 'Task failed due to timeout'
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task failed due to timeout');
    });
  });

  describe('PageContext', () => {
    it('should detect Square item detail page', () => {
      const context: PageContext = {
        url: 'https://app.squareup.com/items/library/ABC123',
        pageType: 'item-detail',
        itemId: 'ABC123',
        title: 'Product Name - Square'
      };

      expect(context.pageType).toBe('item-detail');
      expect(context.itemId).toBe('ABC123');
    });

    it('should detect Square items library page', () => {
      const context: PageContext = {
        url: 'https://app.squareup.com/items/library',
        pageType: 'items-library',
        title: 'Items Library - Square'
      };

      expect(context.pageType).toBe('items-library');
      expect(context.itemId).toBeUndefined();
    });
  });
});