#!/usr/bin/env bash
# ==============================================================================
# dwdbar - Multi-Platform Entrypoint
# Delegiert auf Linux an linux/install.sh
# ==============================================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "${SCRIPT_DIR}/linux/install.sh" ]; then
    exec "${SCRIPT_DIR}/linux/install.sh" "$@"
else
    echo -e "\033[1;31m[FEHLER]\033[0m linux/install.sh nicht gefunden!" >&2
    exit 1
fi
