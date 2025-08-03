#!/usr/bin/env node

import { SquareCatalogAgent } from '../../src/agents/SquareCatalogAgent.js';

/**
 * Diagnostic script to check Square catalog API responses
 */

class CatalogDiagnostic {
  constructor() {
    this.agent = new SquareCatalogAgent();
  }

  async main() {
    console.log('🔬 Square Catalog Diagnostic\n');
    
    try {
      // Test connection
      console.log('1. Testing connection...');
      const connected = await this.agent.testConnection();
      console.log(`   ✅ Connected: ${connected}\n`);
      
      // Check locations
      console.log('2. Checking locations...');
      const locations = await this.agent.getLocations();
      console.log(`   📍 Found ${locations.length} locations:`);
      locations.forEach((loc, i) => {
        console.log(`     ${i + 1}. ${loc.name} (${loc.id})`);
        console.log(`        Status: ${loc.status || 'N/A'}`);
        console.log(`        Type: ${loc.type || 'N/A'}`);
      });
      console.log('');
      
      // Try different catalog list approaches
      console.log('3. Testing catalog list with different parameters...');
      
      // Test 1: List all object types
      console.log('   🔍 Test 1: All object types...');
      try {
        const response1 = await this.agent.catalogApi.list({
          types: 'ITEM,ITEM_VARIATION,CATEGORY,IMAGE,TAX,DISCOUNT,MODIFIER_LIST,MODIFIER',
          limit: 100
        });
        
        const result1 = response1.result || response1;
        console.log(`      Response: ${JSON.stringify(result1, null, 2)}`);
        console.log(`      Objects found: ${result1.objects?.length || 0}`);
      } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
      }
      
      // Test 2: Just ITEM types
      console.log('   🔍 Test 2: Just ITEM objects...');
      try {
        const response2 = await this.agent.catalogApi.list({
          types: 'ITEM',
          limit: 100
        });
        
        const result2 = response2.result || response2;
        console.log(`      Objects found: ${result2.objects?.length || 0}`);
        if (result2.objects && result2.objects.length > 0) {
          console.log(`      First item: ${JSON.stringify(result2.objects[0], null, 2)}`);
        }
      } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
      }
      
      // Test 3: Search instead of list
      console.log('   🔍 Test 3: Search for objects...');
      try {
        const response3 = await this.agent.catalogApi.search({
          objectTypes: ['ITEM'],
          limit: 100
        });
        
        const result3 = response3.result || response3;
        console.log(`      Search results: ${result3.objects?.length || 0}`);
        if (result3.objects && result3.objects.length > 0) {
          console.log(`      First item: ${JSON.stringify(result3.objects[0], null, 2)}`);
        }
      } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
      }
      
      // Test 4: Get catalog info
      console.log('   🔍 Test 4: Get catalog info...');
      try {
        const response4 = await this.agent.catalogApi.info();
        const result4 = response4.result || response4;
        console.log(`      Catalog info: ${JSON.stringify(result4, null, 2)}`);
      } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
      }
      
      // Test 5: Check environment and permissions
      console.log('4. Environment check...');
      console.log(`   🌍 Environment: ${process.env.SQUARE_ENVIRONMENT}`);
      console.log(`   🔑 Access token (first 10 chars): ${process.env.SQUARE_ACCESS_TOKEN?.substring(0, 10)}...`);
      
    } catch (error) {
      console.error('💥 Diagnostic failed:', error.message);
      console.error('Stack:', error.stack);
    }
  }
}

// Run diagnostic
if (import.meta.url === `file://${process.argv[1]}`) {
  const diagnostic = new CatalogDiagnostic();
  diagnostic.main().catch(console.error);
}

export { CatalogDiagnostic };
