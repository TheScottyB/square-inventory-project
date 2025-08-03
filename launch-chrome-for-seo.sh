#!/bin/bash

# Script to launch Chrome with remote debugging enabled for the SEO agent

echo "🚀 Launching Chrome with remote debugging for SEO Agent..."

# Kill any existing Chrome processes to ensure clean start
echo "📝 Closing existing Chrome processes..."
pkill -f "Google Chrome" || true

# Wait a moment for processes to close
sleep 2

# Launch Chrome with remote debugging enabled
echo "🌐 Starting Chrome with remote debugging on port 9222..."

# Create user data directory for debugging
USER_DATA_DIR="$HOME/.chrome-debugging"
mkdir -p "$USER_DATA_DIR"

# Launch Chrome with custom data directory and remote debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$USER_DATA_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  "https://squareup.com/dashboard" \
  > /dev/null 2>&1 &

echo "✅ Chrome launched with remote debugging"
echo "📍 Chrome will open to: https://squareup.com/dashboard"
echo "🔑 Please log in to Square manually in the browser"
echo ""
echo "Once logged in, run the SEO agent with:"
echo "   node testSEOAgent.js"
echo ""
echo "Or the full batch with:"
echo "   pnpm run seo:run-agent"
