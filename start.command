#!/bin/bash
# Theatre on a Mac: starts the local server and opens the DM panel. Close this window to stop.
cd "$(dirname "$0")"

if [ ! -f campaigns.json ]; then
  echo "No campaigns.json yet: copy campaigns.example.json to campaigns.json and fill in your vault. See README.md."
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi

python3 server.py &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 2
open "http://localhost:8765/control"
echo "Theatre is running. Close this window to stop it."
wait $SERVER
