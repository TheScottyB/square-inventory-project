# Chrome Extension Private Distribution Guide

This guide covers how to package and distribute the Square Automation Extension within your organization.

## Quick Start

```bash
# 1. Build and package for distribution
npm run distribute

# 2. Find your files in the releases/ directory
ls releases/
```

## Distribution Methods

### Method 1: Direct Installation (Development Teams)

Best for: Developers, QA teams, power users

1. **Package the extension:**
   ```bash
   npm run package:private
   ```

2. **Share the ZIP file** from `releases/` directory

3. **Users install by:**
   - Extracting ZIP to a permanent location
   - Opening `chrome://extensions/`
   - Enabling "Developer mode"
   - Clicking "Load unpacked"
   - Selecting the extracted folder

### Method 2: Google Workspace (Enterprise)

Best for: Organization-wide deployment

1. **Package the extension:**
   ```bash
   npm run package:private
   ```

2. **Get the Extension ID:**
   - Load the extension locally first
   - Copy ID from `chrome://extensions/`
   - Update `releases/update.xml` with this ID

3. **Deploy via Admin Console:**
   - Sign in to [Google Admin Console](https://admin.google.com)
   - Navigate to: Devices → Chrome → Apps & extensions → Users & browsers
   - Click ⊕ to add new app
   - Choose "Add from a custom app"
   - Upload the ZIP file
   - Configure:
     - Installation policy (force install, allow install)
     - Permissions
     - Update URL (if self-hosting)
     - User groups

### Method 3: Self-Hosted with Auto-Updates

Best for: Teams wanting automatic updates

1. **Set up hosting:**
   - Host the `releases/` directory on your internal server
   - Ensure HTTPS is configured
   - Set appropriate CORS headers

2. **Configure auto-updates:**
   - Add to `manifest.json`:
     ```json
     "update_url": "https://your-domain.com/extensions/update.xml"
     ```
   - Update `releases/update.xml` with correct paths

3. **Version management:**
   ```bash
   # Bump version before each release
   node scripts/bump-version.js patch  # or minor/major
   npm run distribute
   ```

4. **Deploy updates:**
   - Upload new files to server
   - Update `update.xml` with new version
   - Chrome will auto-update within 24 hours

## Security Considerations

### Permissions Review
The extension requires:
- `activeTab` - Access to current Square tab
- `storage` - Save settings and data
- `downloads` - Download product images
- Host permissions for Square domains

### Code Signing (Optional)
For additional security:
1. Generate a private key:
   ```bash
   openssl genrsa -out private.pem 2048
   ```

2. Package with signature:
   ```bash
   chrome --pack-extension=dist --pack-extension-key=private.pem
   ```

### Security Best Practices
- ✅ Review code before distribution
- ✅ Limit distribution to necessary users
- ✅ Use Google Workspace policies for access control
- ✅ Monitor extension usage via Admin Console
- ✅ Keep the extension updated

## Troubleshooting

### Common Issues

**"Manifest file is missing or unreadable"**
- Ensure you're selecting the extracted folder, not the ZIP

**"This extension is not listed in the Chrome Web Store"**
- Normal for private extensions
- Users may see a warning on first install

**Extension doesn't update automatically**
- Check update.xml is accessible
- Verify version number increased
- Chrome checks for updates every few hours

**Installation blocked by policy**
- Check with IT administrator
- May need to whitelist the extension ID

### Getting the Extension ID

The extension ID is required for:
- Google Workspace deployment
- Update manifests
- Policy configurations

To find it:
1. Load extension in Chrome
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Copy the ID string (looks like: `abcdefghijklmnopqrstuvwxyzabcdef`)

## Version Management

Use semantic versioning:
```bash
# Patch release (bug fixes)
node scripts/bump-version.js patch

# Minor release (new features)
node scripts/bump-version.js minor  

# Major release (breaking changes)
node scripts/bump-version.js major
```

Always bump version before packaging a new release.

## Support

For issues or questions:
1. Check the extension logs: Inspect views → background page
2. Review Chrome's extension documentation
3. Contact your IT administrator
4. File issues in the project repository

## Release Checklist

- [ ] Code review completed
- [ ] Version bumped appropriately
- [ ] Tested in development
- [ ] Built successfully (`npm run build`)
- [ ] Packaged (`npm run package:private`)
- [ ] Distribution files verified
- [ ] Update manifest configured (if using auto-updates)
- [ ] Documentation updated
- [ ] IT team notified (for enterprise deployments)