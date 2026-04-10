#!/usr/bin/env bash
set -e

# Dev setup script: start backend and frontend in separate terminals (macOS)
# Usage: ./scripts/dev-setup.sh

open -a Terminal "$(pwd)/backend"
open -a Terminal "$(pwd)/frontend"

echo "Opened two Terminal windows. Run 'npm install' and 'node server.js' in backend, and 'npm install' and 'npm run dev' in frontend."
