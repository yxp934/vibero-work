#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
OMNI_DIR="$ROOT_DIR/omni"
BUILD_DIR="$ROOT_DIR/build"
OUTPUT_JA="$BUILD_DIR/omni.ja"

INSTALL_MODE=0
APP_PATH="/Users/yxp/Downloads/Vibero.app"

usage() {
  cat <<'EOF'
Usage:
  ./repack.sh
  ./repack.sh --install
  ./repack.sh --install /path/to/Vibero.app

Behavior:
  - Always rebuilds build/omni.ja from ./omni
  - With --install, also backs up and replaces the app's omni.ja
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install)
      INSTALL_MODE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      APP_PATH="$1"
      shift
      ;;
  esac
done

if [[ ! -d "$OMNI_DIR" ]]; then
  echo "Missing source directory: $OMNI_DIR" >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"
rm -f "$OUTPUT_JA"

(
  cd "$OMNI_DIR"
  zip -qr "$OUTPUT_JA" .
)

echo "Built: $OUTPUT_JA"

if [[ "$INSTALL_MODE" -eq 1 ]]; then
  APP_OMNI="$APP_PATH/Contents/Resources/app/omni.ja"
  if [[ ! -f "$APP_OMNI" ]]; then
    echo "Target app omni.ja not found: $APP_OMNI" >&2
    exit 1
  fi

  BACKUP_PATH="${APP_OMNI}.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$APP_OMNI" "$BACKUP_PATH"
  cp "$OUTPUT_JA" "$APP_OMNI"

  echo "Backup: $BACKUP_PATH"
  echo "Installed: $APP_OMNI"
fi
