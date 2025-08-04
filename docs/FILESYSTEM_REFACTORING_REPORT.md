# Filesystem Refactoring Report

## Overview
This report summarizes the current repository structure and highlights opportunities for filesystem refactoring. The assessment is based on the directory listing captured with `find . -maxdepth 2 -type d`.

## Current Structure Highlights
- **Project root contains numerous standalone scripts and test files** such as `testBrowserNavigation.js`, `testManualLogin.js`, and `runPuppeteerAgent.js`.
- **Duplicate testing directories**: both `test/` and `tests/` exist.
- **Image assets spread across multiple folders**: `assets/images`, `assets/organized`, and `downloaded-images`.
- **Historic or archived code**: separate `archive/` directory in the root and `scripts/archived/`.
- **Chrome extension code** stored in `chrome-extension/` alongside core project code.

## Refactoring Recommendations
1. **Unify test locations**
   - Consolidate `test/` and `tests/` into a single `tests/` directory.
   - Move root-level test scripts into the consolidated directory with descriptive names.

2. **Streamline image asset folders**
   - Merge `downloaded-images` and `assets/organized` into `assets/images` with subfolders for source or state.

3. **Consistent archival strategy**
   - Merge `archive/` and `scripts/archived/` into a single `archived/` directory or remove if no longer needed.

4. **Isolate extension code**
   - Move `chrome-extension/` into a top-level `packages/` or `extensions/` directory to separate it from the Node project.

5. **Clean project root**
   - Relocate standalone scripts (`runPuppeteerAgent.js`, `testBrowserNavigation.js`, etc.) into appropriate `scripts/` or `tests/` subdirectories.

Implementing these changes will reduce clutter, improve maintainability, and clarify the separation between production code, experiments, tests, and assets.

