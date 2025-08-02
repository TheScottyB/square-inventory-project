import { exec } from 'child_process';

// CLI script to run tests
const runTests = (testType) => {
  const commandMap = {
    'unit': 'pnpm test tests/unit/SquareCatalogAgent.test.js',
    'integration': 'pnpm test tests/unit/SquareCatalogAgent.test.js --testNamePattern="integration"'
  };

  const command = commandMap[testType];
  if (!command) {
    console.error('Invalid test type. Use "unit" or "integration".');
    return;
  }

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error(`Error executing ${testType} tests:`, stderr);
    } else {
      console.log(`${testType.charAt(0).toUpperCase() + testType.slice(1)} Tests Output:\n`, stdout);
    }
  });
};

if (process.argv.length < 3) {
  console.log('Usage: node run-tests.js <unit|integration>');
  process.exit(1);
}

runTests(process.argv[2]);

