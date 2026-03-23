#!/bin/bash
set -e

REPO="ItsTrag1c/Clank"
INSTALL_DIR="/usr/local/bin"

# Get latest version tag
VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')
if [ -z "$VERSION" ]; then
  echo "Error: Could not determine latest version."
  exit 1
fi

BINARY="Clank_${VERSION}_macos"
URL="https://github.com/$REPO/releases/download/v${VERSION}/${BINARY}"

echo "Installing Clank v${VERSION} for macOS..."

# Download
TMP=$(mktemp -d)
curl -fsSL "$URL" -o "$TMP/clank"
chmod +x "$TMP/clank"

# Install
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP/clank" "$INSTALL_DIR/clank"
else
  sudo mv "$TMP/clank" "$INSTALL_DIR/clank"
fi

rm -rf "$TMP"

echo "Installed clank v${VERSION} to $INSTALL_DIR/clank"
echo ""
echo "Get started:"
echo "  clank setup"
echo "  clank"
