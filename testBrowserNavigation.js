// Simple test to verify browser can navigate to Square login page
import PuppeteerSEOAgent from './src/agents/PuppeteerSEOAgent.js';
import chalk from 'chalk';

console.log(chalk.blue('🧪 Testing browser navigation to Square...'));

(async () => {
  const agent = new PuppeteerSEOAgent({
    headless: false, // Show browser for verification
    timeout: 30000
  });
  
  try {
    await agent.initialize();
    console.log(chalk.green('✅ Browser initialized successfully'));
    
    // Navigate to Square login page
    console.log(chalk.blue('🌐 Navigating to Square login page...'));
    await agent.page.goto('https://squareup.com/login', { waitUntil: 'networkidle2' });
    
    const url = agent.page.url();
    console.log(chalk.green(`✅ Successfully navigated to: ${url}`));
    
    // Check if page has login elements
    const hasEmailInput = await agent.page.$('input[type="email"], input[name="email"]') !== null;
    const hasPasswordInput = await agent.page.$('input[type="password"], input[name="password"]') !== null;
    
    if (hasEmailInput && hasPasswordInput) {
      console.log(chalk.green('✅ Login form detected - page loaded correctly'));
    } else {
      console.log(chalk.yellow('⚠ Login form not detected - may need manual navigation'));
    }
    
    console.log(chalk.blue('🎉 Browser navigation test completed successfully!'));
    console.log(chalk.gray('The browser window should remain open - you can manually login to test further.'));
    console.log(chalk.gray('Press Ctrl+C to close the browser and exit.'));
    
    // Keep browser open for manual testing
    await new Promise(resolve => {
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\\n🔄 Closing browser...'));
        resolve();
      });
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Browser navigation test failed:'), error.message);
  } finally {
    await agent.cleanup();
  }
})();
