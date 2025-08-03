import { z } from 'zod';
import { tool } from '@openai/agents';
import { DOMAgent } from '../base/DOMAgent';
import { AgentContext, AgentTask, AgentResult, SEOData } from '../types';

/**
 * Specialized agent for Square Dashboard SEO operations
 * Handles SEO form filling, content optimization, and bulk updates
 */
export class SquareSEOAgent extends DOMAgent {
  constructor(context: AgentContext) {
    super(context, {
      name: 'Square SEO Agent',
      instructions: `You are an expert at optimizing Square catalog items for SEO.
      
      Your capabilities include:
      - Filling SEO forms with optimized content
      - Generating compelling product titles and descriptions
      - Managing tags and search terms effectively
      - Ensuring all SEO fields are properly populated
      - Handling bulk SEO updates efficiently
      
      Best practices:
      - Use relevant keywords naturally in titles and descriptions
      - Keep titles concise but descriptive (60-70 characters)
      - Write unique, engaging descriptions that highlight key features
      - Use specific, searchable tags rather than generic ones
      - Include product variations and common search terms
      
      Always wait for forms to load completely before filling them.
      Verify that changes are saved successfully.`
    });
  }

  protected buildTools() {
    return [
      tool({
        name: 'fill_seo_form',
        description: 'Fill Square SEO form fields with optimized content',
        parameters: z.object({
          seoData: z.object({
            title: z.string().optional(),
            description: z.string().optional(),
            tags: z.array(z.string()).optional(),
            metaTitle: z.string().optional(),
            metaDescription: z.string().optional(),
            searchTerms: z.array(z.string()).optional()
          })
        }),
        execute: this.fillSEOForm.bind(this)
      }),
      tool({
        name: 'generate_seo_content',
        description: 'Generate optimized SEO content based on product information',
        parameters: z.object({
          productName: z.string(),
          productDescription: z.string().optional(),
          category: z.string().optional(),
          keywords: z.array(z.string()).optional()
        }),
        execute: this.generateSEOContent.bind(this)
      }),
      tool({
        name: 'validate_seo_fields',
        description: 'Validate that all SEO fields meet requirements',
        parameters: z.object({}),
        execute: this.validateSEOFields.bind(this)
      }),
      tool({
        name: 'save_seo_changes',
        description: 'Save SEO changes and verify success',
        parameters: z.object({}),
        execute: this.saveSEOChanges.bind(this)
      })
    ];
  }

  private async fillSEOForm({ seoData }: { seoData: SEOData }): Promise<AgentResult> {
    try {
      console.log('📝 Filling SEO form with:', seoData);

      // Square SEO form field selectors
      const selectors = {
        title: 'input[name="name"], input[data-test-id="item-name-input"]',
        description: 'textarea[name="description"], textarea[data-test-id="item-description-input"]',
        tags: 'input[placeholder*="tag"], input[data-test-id="item-tags-input"]',
        metaTitle: 'input[name="seo_title"], input[placeholder*="SEO title"]',
        metaDescription: 'textarea[name="seo_description"], textarea[placeholder*="SEO description"]'
      };

      const results: string[] = [];

      // Fill title
      if (seoData.title) {
        const filled = await this.typeInElement(selectors.title, seoData.title);
        results.push(`Title: ${filled ? '✅' : '❌'}`);
      }

      // Fill description
      if (seoData.description) {
        const filled = await this.typeInElement(selectors.description, seoData.description);
        results.push(`Description: ${filled ? '✅' : '❌'}`);
      }

      // Fill tags (Square uses a special tag input)
      if (seoData.tags && seoData.tags.length > 0) {
        const tagsFilled = await this.fillTags(seoData.tags);
        results.push(`Tags: ${tagsFilled ? '✅' : '❌'}`);
      }

      // Fill meta title if available
      if (seoData.metaTitle) {
        const filled = await this.typeInElement(selectors.metaTitle, seoData.metaTitle);
        results.push(`Meta Title: ${filled ? '✅' : '❌'}`);
      }

      // Fill meta description if available
      if (seoData.metaDescription) {
        const filled = await this.typeInElement(selectors.metaDescription, seoData.metaDescription);
        results.push(`Meta Description: ${filled ? '✅' : '❌'}`);
      }

      const allSuccess = results.every(r => r.includes('✅'));

      return {
        success: allSuccess,
        message: `SEO form filled: ${results.join(', ')}`,
        data: { results, seoData }
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to fill SEO form: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async fillTags(tags: string[]): Promise<boolean> {
    try {
      // Square's tag input requires special handling
      const tagInput = await this.findElement('input[placeholder*="tag"], input[data-test-id="item-tags-input"]');
      
      if (!tagInput.exists || !tagInput.element) {
        console.warn('Tag input not found');
        return false;
      }

      // Click to focus
      await this.clickElement(tagInput.selector);
      await this.sleep(200);

      // Add each tag
      for (const tag of tags) {
        // Type the tag
        await this.typeInElement(tagInput.selector, tag, false);
        
        // Press Enter to add the tag
        const input = tagInput.element as HTMLInputElement;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        
        await this.sleep(300); // Wait for tag to be added
        
        // Clear input for next tag
        input.value = '';
      }

      return true;

    } catch (error) {
      console.error('Failed to fill tags:', error);
      return false;
    }
  }

  private async generateSEOContent({ productName, productDescription, category, keywords }: any): Promise<SEOData> {
    // This would integrate with OpenAI to generate optimized content
    // For now, return a structured response
    
    const baseKeywords = keywords || [];
    if (category) baseKeywords.push(category.toLowerCase());
    
    return {
      title: this.optimizeTitle(productName),
      description: this.optimizeDescription(productDescription || productName),
      tags: this.generateTags(productName, category, baseKeywords),
      metaTitle: this.generateMetaTitle(productName, category),
      metaDescription: this.generateMetaDescription(productDescription || productName)
    };
  }

  private optimizeTitle(title: string): string {
    // Basic title optimization
    return title
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .slice(0, 70); // Keep under 70 chars
  }

  private optimizeDescription(description: string): string {
    // Ensure description is engaging and keyword-rich
    if (description.length < 50) {
      description += '. Premium quality product with exceptional craftsmanship and attention to detail.';
    }
    return description.slice(0, 500); // Keep reasonable length
  }

  private generateTags(productName: string, category?: string, keywords: string[] = []): string[] {
    const tags = new Set<string>();
    
    // Add category
    if (category) {
      tags.add(category.toLowerCase());
    }
    
    // Add keywords
    keywords.forEach(keyword => tags.add(keyword.toLowerCase()));
    
    // Extract words from product name
    const words = productName.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (word.length > 3) { // Skip short words
        tags.add(word);
      }
    });
    
    return Array.from(tags).slice(0, 10); // Limit to 10 tags
  }

  private generateMetaTitle(productName: string, category?: string): string {
    const parts = [productName];
    if (category) parts.push(`- ${category}`);
    parts.push('| Your Store Name');
    
    return parts.join(' ').slice(0, 60); // SEO title limit
  }

  private generateMetaDescription(description: string): string {
    // Create compelling meta description
    const cleaned = description.replace(/\s+/g, ' ').trim();
    if (cleaned.length > 155) {
      return cleaned.slice(0, 152) + '...';
    }
    return cleaned;
  }

  private async validateSEOFields(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    // Check title
    const titleElement = await this.findElement('input[name="name"], input[data-test-id="item-name-input"]');
    if (!titleElement.value || titleElement.value.length < 10) {
      issues.push('Title too short (min 10 characters)');
    }
    
    // Check description
    const descElement = await this.findElement('textarea[name="description"], textarea[data-test-id="item-description-input"]');
    if (!descElement.value || descElement.value.length < 20) {
      issues.push('Description too short (min 20 characters)');
    }
    
    // Check for tags
    const tagElements = await this.findElements('.tag-chip, [data-test-id*="tag"]');
    if (tagElements.length === 0) {
      issues.push('No tags added');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  private async saveSEOChanges(): Promise<AgentResult> {
    try {
      console.log('💾 Saving SEO changes...');
      
      // Find save button
      const saveButton = await this.findElement('button[type="submit"], button:contains("Save"), button[data-test-id="save-button"]');
      
      if (!saveButton.exists) {
        return {
          success: false,
          error: 'Save button not found'
        };
      }
      
      // Click save
      await this.clickElement(saveButton.selector);
      
      // Wait for save to complete (look for success message or loading indicator)
      await this.sleep(1000);
      
      // Check for success indicator
      const successIndicator = await this.findElement('.success-message, [data-test-id="success-message"], .saved-indicator', 3000);
      
      if (successIndicator.exists) {
        return {
          success: true,
          message: 'SEO changes saved successfully'
        };
      }
      
      // Check for error messages
      const errorIndicator = await this.findElement('.error-message, [data-test-id="error-message"]', 1000);
      
      if (errorIndicator.exists) {
        return {
          success: false,
          error: `Save failed: ${errorIndicator.value || 'Unknown error'}`
        };
      }
      
      // Assume success if no error
      return {
        success: true,
        message: 'SEO changes saved (no confirmation found)'
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Failed to save SEO changes: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  protected async executeTaskInternal(task: AgentTask): Promise<AgentResult> {
    switch (task.type) {
      case 'seo-update':
        return await this.handleSEOUpdate(task.data.seoData, task.data.itemId);
      
      case 'fill-form':
        return await this.fillSEOForm({ seoData: task.data });
      
      default:
        return {
          success: false,
          error: `Unknown task type: ${task.type}`
        };
    }
  }

  async handleSEOUpdate(seoData: SEOData, itemId?: string): Promise<AgentResult> {
    try {
      console.log(`🎯 Handling SEO update for item ${itemId || 'current'}`);
      
      // Ensure we're on the correct page
      if (itemId && !window.location.href.includes(itemId)) {
        return {
          success: false,
          error: 'Not on the correct item page',
          data: { suggestion: 'Navigate to item first' }
        };
      }
      
      // Wait for page to be ready
      await this.waitForElement('input[name="name"], input[data-test-id="item-name-input"]');
      
      // Fill the form
      const fillResult = await this.fillSEOForm({ seoData });
      
      if (!fillResult.success) {
        return fillResult;
      }
      
      // Validate fields
      const validation = await this.validateSEOFields();
      
      if (!validation.valid) {
        console.warn('⚠️ SEO validation issues:', validation.issues);
        // Continue anyway, but note the issues
      }
      
      // Save changes
      const saveResult = await this.saveSEOChanges();
      
      return {
        ...saveResult,
        data: {
          ...saveResult.data,
          validation,
          seoData,
          itemId
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: `SEO update failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}