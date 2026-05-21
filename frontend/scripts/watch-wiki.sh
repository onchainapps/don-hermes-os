#!/bin/bash
# Watch ~/wiki for changes and regenerate wiki-data.json
# Polls every 10 seconds (no inotify needed)

WIKI_DIR="$HOME/wiki"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GENERATOR="$SCRIPT_DIR/generate-wiki-data.py"
OUTPUT="$SCRIPT_DIR/../public/wiki-data.json"

echo "Watching $WIKI_DIR for changes (polling every 10s)..."

# Get initial hash of wiki content (excluding raw/transcripts)
get_hash() {
    find "$WIKI_DIR" -name "*.md" -not -path "*/raw/transcripts/*" -newer /tmp/.wiki-last-gen 2>/dev/null | wc -l
}

# Initial generation
python3 "$GENERATOR"
touch /tmp/.wiki-last-gen

while true; do
    sleep 30
    # Check if any .md files changed since last generation
    CHANGED=$(find "$WIKI_DIR" -name "*.md" -not -path "*/raw/transcripts/*" -newer /tmp/.wiki-last-gen 2>/dev/null | wc -l)
    if [ "$CHANGED" -gt 0 ]; then
        echo "[$(date +%H:%M:%S)] $CHANGED files changed — regenerating..."
        python3 "$GENERATOR"
        cp "$OUTPUT" "$(dirname "$OUTPUT")/../dist/wiki-data.json" 2>/dev/null
        touch /tmp/.wiki-last-gen
        echo "[$(date +%H:%M:%S)] Done."
    fi
done
