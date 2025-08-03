#!/usr/bin/env node

import { spawn } from 'child_process';
import chalk from 'chalk';

console.log(chalk.blue('🚀 Launching Chrome with Remote Debugging...'));
console.log(chalk.gray('This will close any existing Chrome processes first.'));

// Kill existing Chrome processes
console.log(chalk.yellow('⚠ Closing existing Chrome processes...'));
const killChrome = spawn('pkill', ['-f', 'Google Chrome'], { stdio: 'inherit' });

killChrome.on('close', (code) => {
  // Wait a moment for processes to close
  setTimeout(() => {
    console.log(chalk.green('✓ Chrome processes closed'));
    
    // Launch Chrome with remote debugging
    console.log(chalk.blue('🌐 Starting Chrome with remote debugging on port 9222...'));
    
    const chromeArgs = [
      '--remote-debugging-port=9222',
      '--user-data-dir=' + process.env.HOME + '/.chrome-debugging',
      '--disable-features=VizDisplayCompositor',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check'
    ];
    
    const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromeArgs, {
      detached: true,
      stdio: 'ignore'
    });
    
    chrome.unref();
    
    console.log(chalk.green('✅ Chrome launched successfully!'));
    console.log(chalk.blue('📋 Next steps:'));
    console.log(chalk.blue('1. Navigate to https://squareup.com/dashboard'));
    console.log(chalk.blue('2. Login to your Square account'));
    console.log(chalk.blue('3. Run: pnpm run seo:test'));
    console.log(chalk.gray('\\nChrome is now running with remote debugging enabled on port 9222'));
    
    process.exit(0);
  }, 2000);
});

killChrome.on('error', (error) => {
  console.log(chalk.yellow('⚠ No existing Chrome processes found to close'));
  
  // Still launch Chrome
  setTimeout(() => {
    console.log(chalk.blue('🌐 Starting Chrome with remote debugging on port 9222...'));
    
    const chromeArgs = [
      '--remote-debugging-port=9222',
      '--user-data-dir=' + process.env.HOME + '/.chrome-debugging',
      '--disable-features=VizDisplayCompositor',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check'
    ];
    
    const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromeArgs, {
      detached: true,
      stdio: 'ignore'
    });
    
    chrome.unref();
    
    console.log(chalk.green('✅ Chrome launched successfully!'));
    console.log(chalk.blue('📋 Next steps:'));
    console.log(chalk.blue('1. Navigate to https://squareup.com/dashboard'));
    console.log(chalk.blue('2. Login to your Square account'));
    console.log(chalk.blue('3. Run: pnpm run seo:test'));
    console.log(chalk.gray('\\nChrome is now running with remote debugging enabled on port 9222'));
    
    process.exit(0);
  }, 1000);
});
