#!/usr/bin/env node

/**
 * Version bump utility for Chrome extension
 * Updates version in both package.json and manifest.json
 */

const fs = require('fs');
const path = require('path');

const validBumpTypes = ['major', 'minor', 'patch'];
const bumpType = process.argv[2];

if (!bumpType || !validBumpTypes.includes(bumpType)) {
  console.error('Usage: node bump-version.js [major|minor|patch]');
  process.exit(1);
}

// Read current versions
const packagePath = path.join(__dirname, '..', 'package.json');
const manifestPath = path.join(__dirname, '..', 'manifest.json');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Parse current version
const currentVersion = packageJson.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

// Calculate new version
let newVersion;
switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

// Update manifest.json
manifestJson.version = newVersion;
fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 2) + '\n');

console.log(`✅ Version bumped from ${currentVersion} to ${newVersion}`);
console.log('📝 Updated files:');
console.log('  - package.json');
console.log('  - manifest.json');