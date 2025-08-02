#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';

console.log('🚀 Square Integration Setup Guide');
console.log('=====================================\n');

console.log('To perform integration testing with Square API, you need:\n');

console.log('1. 📋 Square Developer Account:');
console.log('   - Visit: https://developer.squareup.com/');
console.log('   - Create a developer account if you don\'t have one');
console.log('   - This is FREE for testing\n');

console.log('2. 🏗️  Create a Sandbox Application:');
console.log('   - Go to Square Developer Dashboard');
console.log('   - Click "Create your first application"');
console.log('   - Choose "Build on Square APIs"');
console.log('   - Give it a name like "Square Inventory Test"');
console.log('   - Select "Sandbox" environment\n');

console.log('3. 🔑 Get API Credentials:');
console.log('   - In your application dashboard');
console.log('   - Go to "Credentials" tab');
console.log('   - Copy the "Sandbox Access Token"');
console.log('   - Copy the "Sandbox Location ID" (if available)\n');

console.log('4. ⚙️  Configure Environment:');
console.log('   - Add to your .env file:');
console.log('     SQUARE_ACCESS_TOKEN=your_sandbox_access_token_here');
console.log('     SQUARE_ENVIRONMENT=sandbox');
console.log('     SQUARE_LOCATION_ID=your_location_id_here (optional)\n');

console.log('5. 🧪 Run Integration Tests:');
console.log('   node scripts/test-square-catalog-agent.js\n');

// Check current environment setup
console.log('📊 Current Environment Status:\n');

const envPath = path.join(process.cwd(), '.env');
const hasEnvFile = fs.existsSync(envPath);

console.log(`   .env file: ${hasEnvFile ? '✅ Found' : '❌ Missing'}`);

if (hasEnvFile) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const hasSquareToken = envContent.includes('SQUARE_ACCESS_TOKEN');
  const hasSquareEnv = envContent.includes('SQUARE_ENVIRONMENT');
  
  console.log(`   SQUARE_ACCESS_TOKEN: ${hasSquareToken ? '✅ Set' : '❌ Missing'}`);
  console.log(`   SQUARE_ENVIRONMENT: ${hasSquareEnv ? '✅ Set' : '❌ Missing'}`);
  
  if (hasSquareToken && hasSquareEnv) {
    console.log('\n🎉 Environment appears to be configured for Square integration!');
    console.log('   Run: node scripts/test-square-catalog-agent.js');
  }
} else {
  console.log('\n⚠️  Create a .env file to get started with Square integration.');
}

console.log('\n📚 Additional Resources:');
console.log('   - Square API Reference: https://developer.squareup.com/reference/square');
console.log('   - Node.js SDK Docs: https://github.com/square/square-nodejs-sdk');
console.log('   - API Explorer: https://developer.squareup.com/explorer/square');
