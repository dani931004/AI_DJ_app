#!/bin/bash

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Start the development server
npm run dev
