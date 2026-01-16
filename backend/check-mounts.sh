#!/bin/bash
# Check if required mount points exist before starting transmission-frontend
# Reads directories from Transmission settings

SETTINGS_FILE="/etc/transmission-daemon/settings.json"

if [ ! -f "$SETTINGS_FILE" ]; then
    echo "ERROR: Transmission settings file not found: $SETTINGS_FILE"
    exit 1
fi

# Parse settings using jq
DOWNLOAD_DIR=$(jq -r '."download-dir"' "$SETTINGS_FILE")
INCOMPLETE_ENABLED=$(jq -r '."incomplete-dir-enabled"' "$SETTINGS_FILE")
INCOMPLETE_DIR=$(jq -r '."incomplete-dir"' "$SETTINGS_FILE")

check_mount() {
    local path=$1
    local description=$2
    
    if [ -z "$path" ] || [ "$path" = "null" ]; then
        echo "WARNING: $description is not configured"
        return 0
    fi
    
    if ! mountpoint -q "$path" 2>/dev/null; then
        echo "ERROR: $description ($path) is not a mount point"
        return 1
    fi
    
    echo "OK: $description ($path) is mounted"
    return 0
}

echo "Checking Transmission download directories..."

check_mount "$DOWNLOAD_DIR" "download-dir" || exit 1

if [ "$INCOMPLETE_ENABLED" = "true" ]; then
    check_mount "$INCOMPLETE_DIR" "incomplete-dir" || exit 1
else
    echo "INFO: incomplete-dir is disabled, skipping check"
fi

echo "All mount points verified. Starting service..."
exit 0
