import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

class PuppeteerSEOAgent {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.options = {
      headless: process.env.NODE_ENV === 'production',
      timeout: 30000,
      retries: 3,
      concurrency: 1, // Keep low to avoid rate limiting
      ...options
    };
    this.sessionFile = path.join(__dirname, '../../data/square-session.json');
    this.logFile = path.join(__dirname, '../../logs/seo-updates.log');
  }

  async initialize() {
    const spinner = ora('Starting SEO Agent...').start();
    
    try {
      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        defaultViewport: { width: 1280, height: 800 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      this.page = await this.browser.newPage();
      
      // Set user agent to avoid detection
      await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      spinner.succeed('SEO Agent initialized');
      
      // Load existing session if available
      await this.loadSession();
      
    } catch (error) {
      spinner.fail('Failed to initialize SEO Agent');
      throw error;
    }
  }

  async loadSession() {
    try {
      const sessionData = await fs.readFile(this.sessionFile, 'utf8');
      const cookies = JSON.parse(sessionData);
      
      if (cookies && cookies.length > 0) {
        await this.page.setCookie(...cookies);
        console.log(chalk.green('✓ Loaded existing session'));
        return true;
      }
    } catch (error) {
      console.log(chalk.yellow('⚠ No existing session found, will need to login'));
      return false;
    }
  }

  async saveSession() {
    try {
      const cookies = await this.page.cookies();
      await fs.writeFile(this.sessionFile, JSON.stringify(cookies, null, 2));
      console.log(chalk.green('✓ Session saved'));
    } catch (error) {
      console.error(chalk.red('✗ Failed to save session:'), error.message);
    }
  }

  async loginToSquare() {
    const spinner = ora('Logging into Square Dashboard...').start();
    
    try {
      await this.page.goto('https://squareup.com/login', { waitUntil: 'networkidle2' });
      
      // Check if already logged in
      try {
        await this.page.waitForSelector('[data-testid="dashboard"]', { timeout: 3000 });
        spinner.succeed('Already logged in');
        return true;
      } catch (e) {
        // Not logged in, proceed with login
      }

      // Check for credentials
      if (!process.env.SQUARE_EMAIL || !process.env.SQUARE_PASSWORD) {
        spinner.fail('Square credentials not found in environment variables');
        console.log(chalk.yellow('Please set SQUARE_EMAIL and SQUARE_PASSWORD in your .env file'));
        
        // Fallback: manual login
        console.log(chalk.blue('Please login manually in the browser window...'));
        await this.page.waitForSelector('[data-testid="dashboard"]', { timeout: 120000 });
        await this.saveSession();
        spinner.succeed('Manual login completed');
        return true;
      }

      // Automated login
      await this.page.waitForSelector('input[name="email"], input[type="email"]');
      await this.page.type('input[name="email"], input[type="email"]', process.env.SQUARE_EMAIL);
      
      await this.page.waitForSelector('input[name="password"], input[type="password"]');
      await this.page.type('input[name="password"], input[type="password"]', process.env.SQUARE_PASSWORD);
      
      await this.page.click('button[type="submit"], input[type="submit"]');
      
      // Handle potential 2FA
      try {
        await this.page.waitForSelector('[data-testid="dashboard"]', { timeout: 10000 });
        spinner.succeed('Login successful');
      } catch (e) {
        // Might be 2FA
        spinner.warn('2FA required - please complete in browser');
        await this.page.waitForSelector('[data-testid="dashboard"]', { timeout: 120000 });
        spinner.succeed('2FA completed');
      }
      
      await this.saveSession();
      return true;
      
    } catch (error) {
      spinner.fail('Login failed');
      await this.takeScreenshot('login-error');
      throw error;
    }
  }

  async navigateToItemSEO(itemId) {
    const spinner = ora(`Navigating to item ${itemId} SEO settings...`).start();
    
    try {
      // Navigate to items page
      await this.page.goto(`https://squareup.com/dashboard/items`, { waitUntil: 'networkidle2' });
      
      // Search for the item
      await this.page.waitForSelector('input[placeholder*="Search"], input[data-testid="search"]');
      await this.page.type('input[placeholder*="Search"], input[data-testid="search"]', itemId);
      await this.page.keyboard.press('Enter');
      
      // Wait for search results and click on the item
      await this.page.waitForSelector(`[data-testid="item-${itemId}"], a[href*="${itemId}"]`, { timeout: 10000 });
      await this.page.click(`[data-testid="item-${itemId}"], a[href*="${itemId}"]`);
      
      // Look for SEO/Online Store section
      await this.page.waitForSelector('button:has-text("Online Store"), [data-testid="online-store"], button:has-text("SEO")');
      
      // Try multiple possible selectors for SEO section
      const seoSelectors = [
        'button:has-text("Online Store")',
        '[data-testid="online-store"]',
        'button:has-text("SEO")',
        'a[href*="seo"]',
        'button:has-text("Website")'
      ];
      
      let seoSectionFound = false;
      for (const selector of seoSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 2000 });
          await this.page.click(selector);
          seoSectionFound = true;
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!seoSectionFound) {
        throw new Error('Could not find SEO section');
      }
      
      // Wait for SEO fields to load
      await this.page.waitForSelector('input[placeholder*="title"], textarea[placeholder*="description"], input[placeholder*="permalink"]', { timeout: 10000 });
      
      spinner.succeed('Successfully navigated to SEO settings');
      return true;
      
    } catch (error) {
      spinner.fail('Failed to navigate to SEO settings');
      await this.takeScreenshot(`navigation-error-${itemId}`);
      throw error;
    }
  }

  async updateSEOFields(seoData) {
    const spinner = ora('Updating SEO fields...').start();
    
    try {
      // Update SEO Title
      if (seoData.title) {
        const titleSelectors = [
          'input[placeholder*="title"]',
          'input[name*="title"]',
          'input[data-testid*="seo-title"]'
        ];
        
        for (const selector of titleSelectors) {
          try {
            await this.page.waitForSelector(selector, { timeout: 2000 });
            await this.page.click(selector, { clickCount: 3 }); // Select all
            await this.page.type(selector, seoData.title);
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      // Update SEO Description
      if (seoData.description) {
        const descriptionSelectors = [
          'textarea[placeholder*="description"]',
          'textarea[name*="description"]',
          'textarea[data-testid*="seo-description"]'
        ];
        
        for (const selector of descriptionSelectors) {
          try {
            await this.page.waitForSelector(selector, { timeout: 2000 });
            await this.page.click(selector, { clickCount: 3 }); // Select all
            await this.page.type(selector, seoData.description);
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      // Update Permalink
      if (seoData.permalink) {
        const permalinkSelectors = [
          'input[placeholder*="permalink"]',
          'input[name*="permalink"]',
          'input[data-testid*="permalink"]',
          'input[placeholder*="URL"]'
        ];
        
        for (const selector of permalinkSelectors) {
          try {
            await this.page.waitForSelector(selector, { timeout: 2000 });
            await this.page.click(selector, { clickCount: 3 }); // Select all
            await this.page.type(selector, seoData.permalink);
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      // Save changes
      const saveSelectors = [
        'button:has-text("Save")',
        'button[type="submit"]',
        'button[data-testid="save"]'
      ];
      
      for (const selector of saveSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 2000 });
          await this.page.click(selector);
          break;
        } catch (e) {
          continue;
        }
      }
      
      // Wait for save confirmation
      await this.page.waitForTimeout(2000);
      
      spinner.succeed('SEO fields updated successfully');
      return true;
      
    } catch (error) {
      spinner.fail('Failed to update SEO fields');
      await this.takeScreenshot('seo-update-error');
      throw error;
    }
  }

  async processItem(item) {
    const maxRetries = this.options.retries;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        await this.navigateToItemSEO(item.id);
        await this.updateSEOFields(item.seo);
        
        await this.logUpdate(item, 'SUCCESS');
        return { success: true, item: item.id };
        
      } catch (error) {
        attempt++;
        console.log(chalk.yellow(`⚠ Attempt ${attempt}/${maxRetries} failed for item ${item.id}: ${error.message}`));
        
        if (attempt === maxRetries) {
          await this.logUpdate(item, 'FAILED', error.message);
          return { success: false, item: item.id, error: error.message };
        }
        
        // Wait before retry
        await this.page.waitForTimeout(2000);
      }
    }
  }

  async processBatch(items) {
    const results = [];
    const total = items.length;
    
    console.log(chalk.blue(`🚀 Processing ${total} items...`));
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const progress = `${i + 1}/${total}`;
      
      console.log(chalk.cyan(`\n[${progress}] Processing: ${item.name || item.id}`));
      
      const result = await this.processItem(item);
      results.push(result);
      
      if (result.success) {
        console.log(chalk.green(`✓ [${progress}] ${item.id} updated successfully`));
      } else {
        console.log(chalk.red(`✗ [${progress}] ${item.id} failed: ${result.error}`));
      }
      
      // Add delay between items to avoid rate limiting
      if (i < items.length - 1) {
        await this.page.waitForTimeout(1000);
      }
    }
    
    return results;
  }

  async logUpdate(item, status, error = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      itemId: item.id,
      itemName: item.name,
      status,
      seoData: item.seo,
      error
    };
    
    try {
      await fs.appendFile(this.logFile, JSON.stringify(logEntry) + '\n');
    } catch (e) {
      console.error(chalk.red('Failed to write log:'), e.message);
    }
  }

  async takeScreenshot(name) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}-${timestamp}.png`;
      const filepath = path.join(__dirname, '../../logs/screenshots', filename);
      
      // Ensure screenshots directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      
      await this.page.screenshot({ path: filepath, fullPage: true });
      console.log(chalk.blue(`📸 Screenshot saved: ${filename}`));
    } catch (error) {
      console.error(chalk.red('Failed to take screenshot:'), error.message);
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      console.log(chalk.green('✓ Browser closed'));
    }
  }
}

export default PuppeteerSEOAgent;
