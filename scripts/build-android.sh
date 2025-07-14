#!/bin/bash

# Exit on any error
set -e

echo "🚀 Starting Android build process..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build the web app
echo "🔨 Building web app..."
npm run build

# Sync with Android
echo "🔄 Syncing with Android..."
npx cap sync android

# Open Android Studio
echo "🤖 Opening Android Studio..."
npx cap open android

echo "✅ Build process completed!"
echo "In Android Studio, click on the 'Run' button (green play button) to build and run the APK on your device or emulator."
echo "If you encounter any issues, check the Android logs with: adb logcat -s "System.out" | grep -i error"
