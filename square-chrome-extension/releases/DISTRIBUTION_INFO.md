# Square Automation Extension - Private Distribution

Version: 1.0.0
Build Date: Sun Aug  3 03:53:50 CDT 2025
Package: square-automation-extension-v1.0.0-20250803_035350.zip

## Installation Instructions

### Method 1: Direct Installation (Recommended for Testing)
1. Download `square-automation-extension-v1.0.0-20250803_035350.zip`
2. Extract the ZIP file to a permanent location
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked" and select the extracted folder

### Method 2: CRX Installation (For End Users)
1. Download the .crx file (if provided)
2. Open Chrome and navigate to `chrome://extensions/`
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
   `"update_url": "https://your-domain.com/extensions/update.xml"`

## Security Notes
- This extension requires permissions for squareup.com and related domains
- Review the manifest.json for full permission list
- For production use, consider code signing the extension

