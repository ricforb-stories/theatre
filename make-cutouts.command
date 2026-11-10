#!/bin/bash
# Theatre on a Mac: makes see-through cut-outs for every portrait that does not have one yet (about 20 seconds each).
cd "$(dirname "$0")"
python3 make_cutouts.py
read -n 1 -s -r -p "Done. Press any key to close."
