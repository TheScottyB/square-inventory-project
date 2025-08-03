#!/usr/bin/env node

/**
 * Research Square Categories - Execute comprehensive category research
 * 
 * Investigates Square's API documentation for hidden category functionality
 * and internal sorting capabilities while preserving established categories.
 */

import { SquareAPIResearchAgent } from '../../src/agents/research/SquareAPIResearchAgent.js';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

async function main() {
  console.log(chalk.blue('🔬 Square API Category Research'));
  console.log(chalk.gray('Investigating hidden category functionality and internal sorting capabilities\n'));

  try {
    // Initialize the research agent
    const researchAgent = new SquareAPIResearchAgent({
      enableDryRun: process.env.ENABLE_DRY_RUN === 'true',
      researchDepth: 'comprehensive'
    });

    const spinner = ora('Initializing Square API research agent...').start();
    
    // Execute comprehensive category research
    spinner.text = 'Researching Square category capabilities...';
    const researchResults = await researchAgent.researchCategoryCapabilities();
    
    spinner.succeed('Research completed successfully');

    // Display executive summary
    console.log(chalk.green('\n📋 Executive Summary'));
    console.log(chalk.white('━'.repeat(60)));
    
    if (researchResults.executiveSummary) {
      console.log(chalk.yellow('Key Findings:'));
      researchResults.executiveSummary.keyFindings.forEach(finding => {
        console.log(chalk.gray(`  • ${finding}`));
      });

      console.log(chalk.yellow('\nMajor Opportunities:'));
      researchResults.executiveSummary.majorOpportunities.forEach(opportunity => {
        console.log(chalk.gray(`  • ${opportunity}`));
      });

      console.log(chalk.yellow('\nCritical Risks:'));
      researchResults.executiveSummary.criticalRisks.forEach(risk => {
        console.log(chalk.red(`  ⚠️  ${risk}`));
      });
    }

    // Display hidden categories findings
    console.log(chalk.green('\n🔍 Hidden Categories Research'));
    console.log(chalk.white('━'.repeat(60)));
    
    if (researchResults.findings.hiddenCategories) {
      const hiddenCats = researchResults.findings.hiddenCategories;
      
      console.log(chalk.yellow(`Hidden Category Support: ${hiddenCats.hiddenCategorySupport ? '✅ Available' : '❌ Not Available'}`));
      
      if (hiddenCats.visibilityOptions) {
        console.log(chalk.gray('Visibility Options:'));
        hiddenCats.visibilityOptions.forEach(option => {
          console.log(chalk.gray(`  • ${option}`));
        });
      }

      if (hiddenCats.implementationDetails) {
        console.log(chalk.gray(`\nImplementation: ${hiddenCats.implementationDetails}`));
      }

      if (hiddenCats.alternativeApproaches) {
        console.log(chalk.yellow('Alternative Approaches:'));
        hiddenCats.alternativeApproaches.forEach(approach => {
          console.log(chalk.gray(`  • ${approach}`));
        });
      }
    }

    // Display visibility controls findings
    console.log(chalk.green('\n🎛️  Visibility Controls Research'));
    console.log(chalk.white('━'.repeat(60)));
    
    if (researchResults.findings.visibilityControls) {
      const visibility = researchResults.findings.visibilityControls;
      
      console.log(chalk.yellow(`Visibility Control Available: ${visibility.visibilityControlAvailable ? '✅ Yes' : '❌ No'}`));
      console.log(chalk.yellow(`Toggle Capability: ${visibility.toggleCapability ? '✅ Yes' : '❌ No'}`));
      console.log(chalk.yellow(`Preserve Established Categories: ${visibility.preserveEstablishedCategories ? '✅ Safe' : '⚠️ Risk'}`));
      
      if (visibility.implementationSteps) {
        console.log(chalk.gray('Implementation Steps:'));
        visibility.implementationSteps.forEach((step, idx) => {
          console.log(chalk.gray(`  ${idx + 1}. ${step}`));
        });
      }
    }

    // Display internal sorting findings
    console.log(chalk.green('\n📊 Internal Sorting Research'));
    console.log(chalk.white('━'.repeat(60)));
    
    if (researchResults.findings.internalSorting) {
      const sorting = researchResults.findings.internalSorting;
      
      console.log(chalk.yellow(`Internal Sorting Supported: ${sorting.internalSortingSupported ? '✅ Yes' : '❌ No'}`));
      
      if (sorting.sortingMechanisms) {
        console.log(chalk.gray('Sorting Mechanisms:'));
        sorting.sortingMechanisms.forEach(mechanism => {
          console.log(chalk.gray(`  • ${mechanism}`));
        });
      }

      if (sorting.useCases) {
        console.log(chalk.gray('Use Cases:'));
        sorting.useCases.forEach(useCase => {
          console.log(chalk.gray(`  • ${useCase}`));
        });
      }
    }

    // Display advanced features
    console.log(chalk.green('\n🚀 Advanced Features Discovered'));
    console.log(chalk.white('━'.repeat(60)));
    
    if (researchResults.findings.advancedFeatures && researchResults.findings.advancedFeatures.length > 0) {
      researchResults.findings.advancedFeatures.forEach(feature => {
        console.log(chalk.yellow(`${feature.featureName} (${feature.availability})`));
        console.log(chalk.gray(`  Description: ${feature.description}`));
        console.log(chalk.gray(`  Use Case: ${feature.useCase}`));
        console.log(chalk.gray(`  Risk Level: ${feature.riskLevel}`));
        console.log('');
      });
    } else {
      console.log(chalk.gray('No advanced features discovered'));
    }

    // Display recommendations
    console.log(chalk.green('\n💡 Implementation Recommendations'));
    console.log(chalk.white('━'.repeat(60)));
    
    if (researchResults.recommendations && researchResults.recommendations.length > 0) {
      researchResults.recommendations.forEach(rec => {
        const priorityColor = rec.priority === 'critical' ? chalk.red : 
                             rec.priority === 'high' ? chalk.yellow : chalk.gray;
        
        console.log(priorityColor(`[${rec.priority.toUpperCase()}] ${rec.title}`));
        console.log(chalk.gray(`  ${rec.description}`));
        console.log(chalk.gray(`  Implementation: ${rec.implementation}`));
        console.log('');
      });
    }

    // Display next steps
    console.log(chalk.green('\n📋 Next Steps'));
    console.log(chalk.white('━'.repeat(60)));
    
    if (researchResults.nextSteps && researchResults.nextSteps.length > 0) {
      researchResults.nextSteps.forEach((step, idx) => {
        const priorityColor = step.priority === 'high' ? chalk.yellow : chalk.gray;
        console.log(priorityColor(`${idx + 1}. ${step.step} (${step.timeline})`));
        console.log(chalk.gray(`   ${step.description}`));
      });
    }

    // Display established categories protection
    console.log(chalk.green('\n🛡️  Established Categories Protection'));
    console.log(chalk.white('━'.repeat(60)));
    
    const establishedCategories = researchAgent.getEstablishedCategories();
    console.log(chalk.yellow('Protected Categories:'));
    Object.keys(establishedCategories).forEach(category => {
      console.log(chalk.gray(`  • ${category} ✅ Protected`));
    });

    // Save research report
    const spinner2 = ora('Saving research report...').start();
    
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = `./reports/square-category-research-${timestamp}.json`;
    
    // Ensure reports directory exists
    await fs.mkdir('./reports', { recursive: true });
    
    // Save comprehensive report
    await fs.writeFile(reportPath, JSON.stringify(researchResults, null, 2));
    
    spinner2.succeed(`Research report saved to ${reportPath}`);

    // Display processing stats
    const stats = researchAgent.getProcessingStats();
    console.log(chalk.green('\n📊 Research Statistics'));
    console.log(chalk.white('━'.repeat(60)));
    console.log(chalk.gray(`Documents Analyzed: ${stats.documentsAnalyzed}`));
    console.log(chalk.gray(`Features Discovered: ${stats.featuresDiscovered}`));
    console.log(chalk.gray(`Research Queries: ${stats.researchQueries}`));
    console.log(chalk.gray(`Findings Generated: ${stats.findingsGenerated}`));

    console.log(chalk.green('\n✅ Square API category research completed successfully!'));
    console.log(chalk.gray(`Full report available at: ${reportPath}`));

  } catch (error) {
    console.error(chalk.red('\n❌ Research failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});

// Run the research
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});