#!/bin/bash
set -e

# Clank — Universal installer for macOS and Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/ClankLabs/Clank/main/install.sh | bash

echo ""
echo "  Installing Clank..."
echo ""

# Detect platform
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin) PLATFORM="macOS" ;;
  Linux)  PLATFORM="Linux" ;;
  *)
    echo "  Error: Unsupported platform ($OS). Use 'npm install -g @clanklabs/clank' instead."
    exit 1
    ;;
esac

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo "  Node.js 20+ is required but not installed."
  echo ""
  if [ "$PLATFORM" = "macOS" ]; then
    echo "  Install Node.js:"
    echo "    brew install node"
    echo "    — or download from https://nodejs.org/"
  else
    echo "  Install Node.js:"
    echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "    sudo apt-get install -y nodejs"
    echo ""
    echo "    — or use nvm: https://github.com/nvm-sh/nvm"
  fi
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "  Error: Node.js 20+ required (found v$(node -v))."
  echo "  Update Node.js and try again."
  exit 1
fi

# Install via npm
echo "  Platform: $PLATFORM ($ARCH)"
echo "  Node.js:  $(node -v)"
echo ""

npm install -g @clanklabs/clank

echo ""
echo "  Clank installed successfully!"
echo ""
echo "  Get started:"
echo "    clank setup    — configure models, channels, API keys"
echo "    clank          — start gateway + TUI"
echo ""
if [ "$PLATFORM" = "Linux" ]; then
  echo "  Signal integration available on Linux:"
  echo "    clank setup --signal"
  echo ""
fi
