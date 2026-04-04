#!/usr/bin/env bash
# tunnel-dev.sh
# Starts a named cloudflared tunnel (stable URL) and the Vite dev server together.
set -euo pipefail

TUNNEL_NAME="khord-dev"
TUNNEL_URL="https://dev.khord.app"
PORT=5173
DEV_PID=""

cleanup() {
  [[ -n "$DEV_PID" ]] && kill "$DEV_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo ""
echo "  Tunnel URL : $TUNNEL_URL"
echo "  Starting   : PUBLIC_APP_URL=$TUNNEL_URL npm run dev"
echo ""

PUBLIC_APP_URL="$TUNNEL_URL" npm run dev 2>&1 | while IFS= read -r devline; do
  printf '\033[2m[dev]\033[0m %s\n' "$devline"
  if [[ "$devline" == *"Local:"* ]]; then
    echo ""
    echo "  Tunnel URL : $TUNNEL_URL"
    echo ""
  fi
done &
DEV_PID=$!

cloudflared tunnel --url "http://localhost:$PORT" run "$TUNNEL_NAME" 2>&1 | while IFS= read -r line; do
  printf '\033[2m[tunnel]\033[0m %s\n' "$line"
done

wait "$DEV_PID"
