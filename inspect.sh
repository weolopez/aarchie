#!/bin/bash
# Fetches the latest conversation from the server and prints a readable transcript.
# Usage: ./inspect.sh [conversation_id]
#   No args = latest conversation
#   With ID = specific conversation

BASE="http://localhost:3000/api/conversations"

if [ -n "$1" ]; then
  curl -s "$BASE/$1"
else
  curl -s "$BASE/latest"
fi
