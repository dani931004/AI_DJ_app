#!/bin/bash

# Exit on any error
set -e

echo "🔍 Verifying Android build configuration..."

# Check if Android directory exists
if [ ! -d "android" ]; then
    echo "❌ Android directory not found. Run 'npx cap add android' first."
    exit 1
fi

# Check if web assets were copied correctly
if [ ! -d "android/app/src/main/assets/public" ]; then
    echo "❌ Web assets not found in Android project. Run 'npx cap sync' first."
    exit 1
fi

# Check if index.html exists in the assets
if [ ! -f "android/app/src/main/assets/public/index.html" ]; then
    echo "❌ index.html not found in Android assets. Check your build process."
    exit 1
fi

echo "✅ Android build configuration looks good!"
echo "You can now build the APK using the GitHub Actions workflow."
