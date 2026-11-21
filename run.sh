#!/usr/bin/env bash
# Quick launch script for FastClockWeb
cd "$(dirname "$0")"
echo "Starting FastClockWeb on http://localhost:8080..."
python3 server.py 8080
