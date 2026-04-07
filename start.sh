#!/usr/bin/env bash

# Go into engine directory
cd "$(dirname "$0")/engine"

echo "Starting Bun Launcher..."

bun run launcher

echo ""
echo "Launcher exited."