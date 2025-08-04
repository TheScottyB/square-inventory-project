#!/bin/bash

# Script to set up Chrome for SEO agent debugging

echo "🔍 Setting up Chrome for SEO Agent debugging..."

# Check if Chrome is already running with remote debugging
if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    echo "✅ Chrome is already running with remote debugging enabled on port 9222"
    echo "🎯 The SEO agent should be able to connect automatically"
    exit 0
fi

echo "❌ Chrome remote debugging not detected on port 9222"
echo ""
echo "📋 To enable remote debugging, you have two options:"
echo ""
echo "🔶 Option 1: Launch new Chrome with debugging (will close existing Chrome):"
echo "   Close all Chrome windows manually first, then run:"
echo "   pnpm run seo:launch-chrome"
echo ""
echo "🔶 Option 2: Add debugging to your current Chrome session:"
echo "   1. Close ALL Chrome windows completely (Cmd+Q)"
echo "   2. Open Terminal and run:"
echo "      /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222"
echo "   3. Chrome will open with your existing profile and sessions"
echo "   4. Navigate to https://squareup.com/dashboard and log in if needed"
echo ""
echo "💡 Tip: Option 2 keeps your existing profile and login sessions"
