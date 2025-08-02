#!/usr/bin/env node

import dotenv from 'dotenv';
import { SquareClient, SquareEnvironment } from 'square';

// Load environment variables
dotenv.config();

console.log('🔍 Debugging Square SDK initialization...\n');

console.log('Environment variables:');
console.log(`SQUARE_ACCESS_TOKEN: ${process.env.SQUARE_ACCESS_TOKEN ? 'SET' : 'NOT SET'}`);
console.log(`SQUARE_ENVIRONMENT: ${process.env.SQUARE_ENVIRONMENT || 'NOT SET'}\n`);

console.log('Square SDK version and exports:');
console.log('SquareClient:', typeof SquareClient);
console.log('SquareEnvironment:', SquareEnvironment);
console.log('SquareEnvironment.Sandbox:', SquareEnvironment.Sandbox);
console.log('SquareEnvironment.Production:', SquareEnvironment.Production);

try {
  console.log('\n🚀 Creating Square client...');
  
  const client = new SquareClient({
    environment: process.env.SQUARE_ENVIRONMENT === 'sandbox' 
      ? SquareEnvironment.Sandbox 
      : SquareEnvironment.Production,
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    timeout: 10000,
  });

  console.log('✅ Square client created successfully');
  console.log('Client object:', typeof client);
  console.log('Client properties:', Object.keys(client));
  
  console.log('\n🔍 Checking API objects...');
  console.log('catalogApi:', typeof client.catalogApi);
  console.log('locationsApi:', typeof client.locationsApi);
  
  if (client.catalogApi) {
    console.log('catalogApi methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client.catalogApi)));
  }
  
  if (client.locationsApi) {
    console.log('locationsApi methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client.locationsApi)));
  }

  // Try a simple API call
  if (client.locationsApi && typeof client.locationsApi.listLocations === 'function') {
    console.log('\n🔗 Testing API call...');
    const result = await client.locationsApi.listLocations();
    console.log('✅ API call successful');
    console.log('Locations found:', result.locations?.length || 0);
  } else {
    console.log('❌ locationsApi.listLocations is not available');
  }

} catch (error) {
  console.error('❌ Error creating or using Square client:', error.message);
  console.error('Full error:', error);
}
