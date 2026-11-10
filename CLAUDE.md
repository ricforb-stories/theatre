# Theatre

A projector table screen for tabletop campaigns kept in Obsidian: a plain-Python local server (`server.py`, no
dependencies) serving the DM panel (`control.html`) and the projector screen (`screen.html`), with effects
(`fx.js`), sounds (`sound.js`) and window-to-window messages through the server (`relay.js`).

- **Setup and use:** README.md. The "Quick start" there is what a new user pastes to have Claude set everything up.
- **Preparing a vault:** follow `skills/theatre-setup/SKILL.md`. Theatre only reads vaults; the skill only adds
  boxes and properties, never rewrites notes, and asks for a backup first.
- **Campaigns** are configured in `campaigns.json` (copied from `campaigns.example.json`).

## Private files: never commit, upload or overwrite

`campaigns.json`, `regions-*.json`, `remote.json` (the Wi-Fi password hash), `cutouts/`, and anything the user put in
`sounds/`. They're in `.gitignore`; keep them there. When updating Theatre with `git pull`, these stay untouched.

## Working on the code

- Python 3.10+, standard library only for the app. `make_cutouts.py` needs `pip install -r requirements.txt`.
- To test changes without disturbing a running session, start a second copy on another port, e.g.
  `python -c "import server; server.ScreenServer(('127.0.0.1', 8766), server.ScreenHandler).serve_forever()"`,
  and open `http://localhost:8766/`. Don't change the user's `remote.json` while testing.
- After changing the pages, the browser needs Ctrl+F5 (Cmd+Shift+R on a Mac).
