---
name: theatre-setup
description: Prepare an Obsidian tabletop campaign vault for Theatre, the projector table screen (pictures, NPCs standing in scenes, places by region). Use when the user wants to set up, convert or "redo" an adventure or campaign for Theatre or the table screen, add "Show the players" boxes, fill in NPC or place properties for it, write campaigns.json, make NPC cut-outs, or keep the vault up to date for Theatre after a session.
---

# Preparing a campaign vault for Theatre

Theatre is a small local app (a Python server plus two web pages) that shows campaign pictures on a projector:
places, NPCs standing in front of them like a visual novel, weather and sound. It only **reads** the vault.
Your job is to make the vault follow the few conventions below, so Theatre finds everything.

The user's notes are their work. **Only add** boxes and properties. Never delete, reword, move or reformat their
prose. Before editing, ask them to make a backup or a git commit of the vault, and wait until they say it's done.

## What Theatre reads

### 1. "Show the players" boxes (the core)

Theatre lists pictures from Obsidian callouts in the notes of the folders set in `browse` (see campaigns.json).
Each box goes **directly under the heading of the scene** where the players see it; the heading becomes the scene
name in Theatre. Use exactly this shape:

A place (or a handout, a letter, a map the players may see):

```markdown
> [!example] Show the players: The Gilded Goose
> ![[The Gilded Goose 1.png|300]]
```

A person:

```markdown
> [!tip] Show the players: [[Old Marga|The Fishwife]]
> ![[Old Marga.png|300]] ![[Old Marga 2.png|300]]
```

- `[!example]` = place, `[!tip]` = person. Theatre shows places on the left and people on the right.
- The text after `Show the players:` is the label the DM sees and, for people, the **name plate on the projector**.
  For people the players don't know by name yet, use the name they know (`[[Note|The Fishwife]]`).
  Never put a secret name there.
- One or more `![[picture]]` embeds, inside the box (each line starts with `>`). Two portraits = two poses.
- Several boxes may follow each other under one heading.
- A DM-only map or secret picture never goes in a box.

### 2. NPC notes (folder `npc_notes`)

One note per NPC. Theatre reads:

- **The portrait(s)**: any `![[...png]]` embedded in the note. First one = main pose.
- Properties (frontmatter):

```yaml
---
location: The Gilded Goose, Rivergate   # "Place, Region": where the party would find them now
met: true                           # has the party met them? false or missing = not met yet
card_name: The Fishwife      # optional: the name the players know, if different from the note name
---
```

- `location`: start with the place exactly as its pictures are named (`The Gilded Goose`), then a comma and the
  region (`Rivergate`). Theatre uses it to list the NPC under that place and to show them "In scene" when that place is
  on the projector. If they're "with the party" or unknown, write that; Theatre then ignores it.
- `met`: `true` once the party has met them. Unmet NPCs are dimmed in the panel, so the DM doesn't reveal them by
  accident. (`card: published` also counts as met, for older vaults.)

### 3. Place pictures (folder `place_images`)

Named `<Place> 1.png`, `<Place> 2.png`, … The name without the number is the place name, and must match the place
note and the NPCs' `location`. A picture with `map` in its name counts as DM-only and is left out of the location
list.

### 4. Place notes (folder `place_notes`, optional)

One note per place, named exactly like its pictures (`The Gilded Goose.md`):

```yaml
---
region: Rivergate          # groups places in Theatre's location list
first_visited: Session 4   # any value = the party has been there; empty or missing = not yet
---
```

### 5. NPC portraits (folder `portrait_images`)

Portraits named after the NPC (`Old Marga.png`, `Old Marga 2.png` for a second pose). Theatre makes
see-through cut-outs from them so NPCs can stand in front of places.

### 6. campaigns.json (in the Theatre folder, not the vault)

```json
{
  "campaigns": {
    "Her Campaign": {
      "vault": "C:/Users/Her/Documents/Her Campaign",
      "browse": [["Adventure", "Adventure"], ["Sessions", "Sessions"]],
      "place_images": "Locations/Images",
      "place_notes": "Locations",
      "npc_notes": "NPCs",
      "portrait_images": "NPCs/Images",
      "skip_folders": ["Templates"]
    }
  }
}
```

Forward slashes even on Windows. Folders are relative to the vault. Several campaigns can be listed.

## How to do the conversion

Work in this order and check in with the user at each **stop**.

1. **Find things.** Ask where the vault is and where Theatre is installed (the folder with `server.py`). Ask which
   folders hold the adventure itself and the session notes.
2. **Survey, don't edit yet.** Look at the vault: its folders, how NPCs and places are written now (one note each,
   or inside chapters?), where pictures live and how they're named, existing properties, existing callouts.
   **Stop:** show the user a short mapping: "adventure = X, sessions = Y, NPC notes = Z, place pictures = W", what's
   missing (no NPC notes? pictures named differently?) and your plan. Wait for their OK and their backup.
3. **Write campaigns.json** in the Theatre folder from the agreed mapping.
4. **NPCs.** For each NPC note: add `location`, `met` (and `card_name` if the players know a different name) where
   missing. Never overwrite a value that's there. Make sure the portrait is embedded in the note. Take facts from the
   notes; if `met` or `location` isn't clear from the session notes, ask instead of guessing.
   If an NPC has a portrait but no note, **stop** and ask before creating notes.
5. **Pictures and places.** If pictures don't follow `<Place> N.png` / `<Name>.png`, **stop** and propose renames.
   Renaming breaks links: rename only with the user's OK, and then update every `![[old name]]` embed in the vault
   (search the whole vault). Add `region` / `first_visited` to place notes, or create minimal place notes if the
   user wants them.
6. **Boxes.** Go through each adventure and session note, scene by scene. Under the heading where the players first
   see a place, add an `[!example]` box with its picture(s). Where they meet a person, add a `[!tip]` box with the
   portrait(s) and the name they know. Add a box again in later scenes only when the picture should be shown again
   there. Don't add boxes for things the players never see. Only add lines; leave all text as it is.
   Do one chapter or file first, **stop** and let the user check it in Theatre, then continue.
7. **Cut-outs.** If the user has installed the extras (`pip install -r requirements.txt` in the Theatre folder), run
   `python make_cutouts.py "<Campaign>"` there (`python3` on a Mac). About 20 seconds per portrait; the first run
   downloads a model (about 1 GB). Then look at a few results: the whole figure should be kept (robes, held items,
   wings) with no background left. For a bad one, try `python make_cutouts.py "<Campaign>" --model isnet-anime "<Name>.png"`.
8. **Report.** List what you added (files and counts), and a clear to-do list: scenes that need a picture that
   doesn't exist yet, NPCs without a portrait, places without a region. Don't generate pictures unless asked.

## After each session

When the user writes up a session: set `met: true` for NPCs the party met, `first_visited` for new places, update
NPCs' `location` if they moved, add boxes for new pictures, and make cut-outs for new portraits
(`python make_cutouts.py` only makes the missing ones). Theatre picks up changes within about 20 seconds; no restart.

## Checking your work

Start Theatre (`start.bat` on Windows, `start.command` on a Mac), pick the campaign, choose the adventure file under
**Adventure**: every box should appear as a picture tile, grouped by scene; its people appear on the right under
**People → In scene**. Under **Location**, places should be grouped by region. If something is missing, the usual
cause is a box not starting with `> [!example] Show the players:` / `> [!tip] Show the players:`, an embed outside
the box, or a picture name that doesn't match the place or NPC name.
