#!/bin/bash

# Package Chrome Extension for Private Distribution
# This script creates both CRX and ZIP files for distribution

set -e

echo "🚀 Starting Chrome Extension packaging..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo -e "${RED}Error: dist directory not found. Run 'npm run build' first.${NC}"
    exit 1
fi

# Create releases directory
mkdir -p releases

# Get version from manifest
VERSION=$(grep '"version"' dist/manifest.json | cut -d'"' -f4)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo -e "${BLUE}Building version: ${VERSION}${NC}"

# Create ZIP file for distribution
ZIP_NAME="square-automation-extension-v${VERSION}-${TIMESTAMP}.zip"
echo "📦 Creating ZIP package..."
cd dist
zip -r "../releases/${ZIP_NAME}" . -x "*.map" "*.ts" "*.test.*"
cd ..

echo -e "${GREEN}✅ ZIP package created: releases/${ZIP_NAME}${NC}"

# Create update manifest for self-hosted updates
echo "📄 Creating update manifest..."
cat > releases/update.xml << EOF
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='YOUR_EXTENSION_ID_HERE'>
    <updatecheck codebase='https://your-domain.com/extensions/${ZIP_NAME}' version='${VERSION}' />
  </app>
</gupdate>
EOF

# Create distribution info
cat > releases/DISTRIBUTION_INFO.md << EOF
# Square Automation Extension - Private Distribution

Version: ${VERSION}
Build Date: $(date)
Package: ${ZIP_NAME}

## Installation Instructions

### Method 1: Direct Installation (Recommended for Testing)
1. Download \`${ZIP_NAME}\`
2. Extract the ZIP file to a permanent location
3. Open Chrome and navigate to \`chrome://extensions/\`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked" and select the extracted folder

### Method 2: CRX Installation (For End Users)
1. Download the .crx file (if provided)
2. Open Chrome and navigate to \`chrome://extensions/\`
3. Drag and drop the .crx file onto the page

### Method 3: Google Workspace Admin Console
For organization-wide deployment:
1. Sign in to Google Admin console
2. Go to Devices > Chrome > Apps & extensions
3. Click on "Users & browsers"
4. Add a new app by ID or URL
5. Upload the ZIP file or provide the extension ID

## Extension ID
To get your extension ID:
1. Load the unpacked extension
2. Find the ID in chrome://extensions/
3. Update the update.xml file with this ID

## Self-Hosted Updates
To enable automatic updates:
1. Host the update.xml file on your server
2. Add to manifest.json:
   \`"update_url": "https://your-domain.com/extensions/update.xml"\`

## Security Notes
- This extension requires permissions for squareup.com and related domains
- Review the manifest.json for full permission list
- For production use, consider code signing the extension

EOF

echo -e "${GREEN}✅ Distribution info created: releases/DISTRIBUTION_INFO.md${NC}"

# Create a simple install page
cat > releases/install.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Square Automation Extension - Private Distribution</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .version { 
            background: #e8f4f8; 
            padding: 10px; 
            border-radius: 5px; 
            display: inline-block;
            margin: 10px 0;
        }
        .button {
            background: #4CAF50;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 5px;
            display: inline-block;
            margin: 10px 0;
        }
        .instructions {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 5px;
            margin: 20px 0;
        }
        code {
            background: #e9ecef;
            padding: 2px 6px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔧 Square Automation Extension</h1>
        <div class="version">Version ${VERSION} - Built $(date)</div>
        
        <h2>Installation Instructions</h2>
        
        <div class="instructions">
            <h3>Quick Install (Development Mode)</h3>
            <ol>
                <li>Download the extension: <a href="${ZIP_NAME}" class="button">Download v${VERSION}</a></li>
                <li>Extract the ZIP file to a permanent location</li>
                <li>Open Chrome and go to <code>chrome://extensions/</code></li>
                <li>Enable "Developer mode" (toggle in top right)</li>
                <li>Click "Load unpacked" and select the extracted folder</li>
            </ol>
        </div>
        
        <div class="instructions">
            <h3>For IT Administrators</h3>
            <p>To deploy via Google Workspace Admin Console:</p>
            <ol>
                <li>Download the extension package</li>
                <li>Sign in to <a href="https://admin.google.com">Google Admin Console</a></li>
                <li>Navigate to Devices → Chrome → Apps & extensions</li>
                <li>Add the extension by uploading the ZIP file</li>
                <li>Configure permissions and user access</li>
            </ol>
        </div>
        
        <h2>Features</h2>
        <ul>
            <li>✨ AI-powered Square Dashboard automation</li>
            <li>🤖 OpenAI Agent SDK integration</li>
            <li>📝 Automated SEO optimization</li>
            <li>🔍 Smart navigation and search</li>
            <li>🛡️ Secure and privacy-focused</li>
        </ul>
        
        <h2>Support</h2>
        <p>For issues or questions, contact your IT administrator or the development team.</p>
    </div>
</body>
</html>
EOF

echo -e "${GREEN}✅ Install page created: releases/install.html${NC}"

# Summary
echo ""
echo -e "${GREEN}🎉 Packaging complete!${NC}"
echo ""
echo "📁 Files created in releases/:"
echo "  - ${ZIP_NAME} (distribute this to users)"
echo "  - DISTRIBUTION_INFO.md (installation guide)"
echo "  - install.html (web-based install page)"
echo "  - update.xml (for self-hosted updates)"
echo ""
echo "Next steps:"
echo "1. Test the packaged extension by loading it in Chrome"
echo "2. Get the extension ID from chrome://extensions/"
echo "3. Update the update.xml with the correct extension ID"
echo "4. Host files on your internal server for distribution"