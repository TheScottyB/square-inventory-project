// Test script for manual login to Square
import PuppeteerSEOAgent from './src/agents/PuppeteerSEOAgent.js';
import chalk from 'chalk';

console.log(chalk.blue('🧪 Testing manual login to Square...'));
console.log(chalk.gray('This script will open a browser where you can manually login to Square.'));

(async () => {
  const agent = new PuppeteerSEOAgent({
    headless: false, // Show browser for manual login
    timeout: 60000   // Longer timeout for manual login
  });
  
  try {
    console.log(chalk.blue('🚀 Initializing browser...'));
    await agent.initialize();
    console.log(chalk.green('✅ Browser initialized successfully'));
    
    console.log(chalk.blue('🔐 Starting login process...'));
    console.log(chalk.yellow('Please login manually in the browser window that opened.'));
    console.log(chalk.gray('The script will wait for you to complete the login...'));
    
    const loginSuccess = await agent.loginToSquare();
    
    if (loginSuccess) {
      console.log(chalk.green('🎉 Login successful!'));
      
      // Test navigation to dashboard
      console.log(chalk.blue('🧭 Testing navigation to Square Dashboard...'));
      await agent.page.goto('https://squareup.com/dashboard', { waitUntil: 'networkidle2' });
      
      const url = agent.page.url();
      console.log(chalk.green(`✅ Successfully navigated to: ${url}`));
      
      console.log(chalk.green('🎯 Manual login test completed successfully!'));
      console.log(chalk.blue('The browser session is now saved for future use.'));
      
    } else {
      console.log(chalk.red('❌ Login failed or timed out'));
    }
    
    console.log(chalk.gray('Press Ctrl+C to close the browser and exit.'));
    
    // Keep browser open for inspection
    await new Promise(resolve => {
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\\n🔄 Closing browser...'));
        resolve();
      });
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Test failed:'), error.message);
  } finally {
    await agent.cleanup();
  }
})();
