# Theatre

A table screen for tabletop campaigns kept in **Obsidian**. Put a projector or TV over the table, and Theatre shows
your scene pictures on it while you run the game from a DM panel:

- **Places and handouts** straight from your adventure notes, scene by scene.
- **NPCs standing in front of the place**, visual-novel style, with name plates (see-through cut-outs made from
  your portraits).
- **Weather and mood**: rain, storm with lightning, snow, mist, ash, embers, fireflies, crows, underwater, old
  recording, torchlight, night, dream and more.
- **Sound**: rain, wind, fire, crowds, thunder, swords… built in, plus your own sound files.
- **Prepare mode**: set up place, people and weather quietly, then reveal it all at once.
- **Run it from another laptop** on the same Wi-Fi, with a password, and a projector-only link for the PC on the TV.

Theatre itself only **reads** your vault. A Claude skill is included that prepares a vault for it, and Claude can
do the whole setup for you: see the quick start right below.

---

## Quick start: let Claude set it up (VS Code)

This is the easy way. Claude does the downloading, the settings and the vault preparation; you answer a few
questions and approve its plan.

**You need:**

1. [**VS Code**](https://code.visualstudio.com/) with the **Claude Code** extension (in VS Code: Extensions →
   search "Claude Code" → Install, then sign in).
2. [**Python**](https://www.python.org/downloads/) (Windows: in the installer, tick **"Add python.exe to PATH"**).
   Claude checks this for you and tells you if it's missing.
3. Your campaign in an **Obsidian vault**, with pictures for places and NPCs.

**Then:**

1. In VS Code: **File → Open Folder…** and open your **Documents** folder (Theatre will be put in there).
2. Open the Claude panel and paste this whole message:

````text
Please set up Theatre for me, the table screen app from https://github.com/ricforb-stories/theatre

1. Clone the repo into a folder called "Theatre" here (it must stay outside my Obsidian vault). If git isn't
   installed, download the ZIP from GitHub and unzip it there instead.
2. Read Theatre's README.md and skills/theatre-setup/SKILL.md so you know how the app and its vault conventions work.
3. Check that Python 3.10 or newer is installed and works from the terminal ("python" on Windows, "python3" on a Mac).
   If not, tell me exactly what to install and wait for me.
4. Ask me where my Obsidian campaign vault is, and the campaign's name.
5. Copy the folder skills/theatre-setup from Theatre into my vault as .claude/skills/theatre-setup (create the
   .claude folder if needed), so the skill is there next time I open my vault with Claude.
6. Ask me to back up my vault (copy the folder, or commit it if it's a git repo) and wait until I say it's done.
7. Prepare my vault by following the theatre-setup skill step by step: survey first and show me your plan before
   changing anything, write campaigns.json in the Theatre folder, fill in NPC and place properties, and add the
   "Show the players" boxes one chapter at a time so I can check each one in Theatre. Only add things; never rewrite
   or delete my notes. Ask me whenever something is unclear instead of guessing.
8. Ask whether I want NPCs to stand in front of places (the cut-outs need about 2 GB and some minutes). If yes, run
   "pip install -r requirements.txt" in the Theatre folder ("pip3" on a Mac) and then "python make_cutouts.py",
   and check a few cut-outs look right.
9. On Windows, give me a desktop shortcut: run the PowerShell command inside make-shortcut.bat (not the .bat itself,
   it waits for a key press).
10. Start Theatre (start.bat on Windows, start.command on a Mac; on a Mac first run "chmod +x *.command"), and
    tell me how to open the projector window and what to click first.
11. Finish with a short list of what you did and what's still missing (scenes without pictures, NPCs without
    portraits, places without a region).
````

3. Answer Claude's questions and approve its plan. When it's done, Theatre is running and your vault is ready.

**Later, after each session**, open your **vault** in VS Code and tell Claude:

```text
Update my vault for Theatre after this session: mark the NPCs we met, the places we visited, add "Show the
players" boxes for any new pictures, and make cut-outs for new portraits (Theatre is in Documents/Theatre).
```

**To get a newer version of Theatre**, open the Theatre folder in VS Code and tell Claude:

```text
Update Theatre: pull the latest version from GitHub (keep my campaigns.json, sounds and cut-outs), copy the
newest skills/theatre-setup into my vault's .claude/skills folder, and tell me what changed.
```

Everything below is the manual version and the full reference: what each setting means, how the vault should look,
and every feature of the DM panel.

---

## Contents

0. [Quick start: let Claude set it up (VS Code)](#quick-start-let-claude-set-it-up-vs-code)
1. [What you need](#what-you-need)
2. [Install](#install)
3. [Tell Theatre where your campaign is](#tell-theatre-where-your-campaign-is)
4. [How your vault needs to look](#how-your-vault-needs-to-look)
5. [Prepare your vault with Claude](#prepare-your-vault-with-claude)
6. [Run a session](#run-a-session)
7. [Saved scenes](#saved-scenes)
8. [People in front of places (cut-outs)](#people-in-front-of-places-cut-outs)
9. [Effects](#effects)
10. [Sounds](#sounds)
11. [Other laptops and a projector PC](#other-laptops-and-a-projector-pc)
12. [Troubleshooting](#troubleshooting)

---

## What you need

- **Python 3.10 or newer** (free).
  - Windows: install from [python.org/downloads](https://www.python.org/downloads/). In the installer, tick
    **"Add python.exe to PATH"**.
  - Mac: install from [python.org/downloads](https://www.python.org/downloads/) too.
- A **browser** (Chrome, Edge or Firefox).
- Your campaign in an **Obsidian vault**, with pictures for places and NPCs.
- Optional: **Claude Code**, to prepare your vault with the included skill.
- Optional: about 2 GB of disk space for the cut-out tool (people in front of places).

## Install

**Easiest:** on the GitHub page click **Code → Download ZIP**, then unzip it somewhere you'll find again, for
example `Documents\Theatre`. (Or, if you use git: `git clone https://github.com/ricforb-stories/theatre.git`.)

Keep the Theatre folder **outside** your vault, so Obsidian doesn't sync or index it.

## Tell Theatre where your campaign is

1. In the Theatre folder, copy `campaigns.example.json` and name the copy `campaigns.json`.
2. Open `campaigns.json` in a text editor (Notepad is fine) and fill it in. Lines starting with `"_` are just
   explanations. A filled-in example:

```json
{
  "campaigns": {
    "Curse of Strahd": {
      "vault": "C:/Users/Anna/Documents/Curse of Strahd",
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

| Setting | What it is |
|---|---|
| `vault` | The vault folder (the one with the hidden `.obsidian` folder inside). Use **forward slashes** `/`, also on Windows. Mac: `/Users/anna/Documents/Curse of Strahd`. |
| `browse` | Folders whose notes appear in the panel's **Adventure** list, as `[label, folder]`. Usually the adventure chapters and the session notes. |
| `place_images` | Folder with place pictures (`<Place> 1.png`…). |
| `place_notes` | Folder with one note per place (for regions). Leave it out if you have none. |
| `npc_notes` | Folder with one note per NPC. |
| `portrait_images` | Folder with NPC portraits (for the cut-outs). |
| `skip_folders` | Folders to ignore when looking for pictures. |
| `region_file` | Optional, instead of place notes: a file in the Theatre folder like `regions-mycampaign.json` with `{"The Gilded Goose": "Rivergate", …}` listing visited places and their regions. |

Folders inside the vault are written relative to the vault. You can list several campaigns; the panel has a
campaign picker. Theatre notices changes to `campaigns.json` by itself.

If you'd rather not edit this by hand, the Claude skill writes it for you.

## How your vault needs to look

Theatre finds pictures through four simple conventions. The Claude skill applies them for you, but here they are:

**1. "Show the players" boxes in your adventure notes.** Under the heading of the scene where the players see
something, add a box (an Obsidian callout) with the picture inside:

```markdown
## The tavern at night

> [!example] Show the players: The Gilded Goose
> ![[The Gilded Goose 1.png|300]]

> [!tip] Show the players: [[Old Marga|The Fishwife]]
> ![[Old Marga.png|300]] ![[Old Marga 2.png|300]]
```

- `[!example]` is a **place** (or a handout); `[!tip]` is a **person**.
- The text after `Show the players:` is the label. For people it's also the **name plate on the projector**, so
  use the name the players know.
- Pictures must be inside the box (every line starts with `>`). Two portraits = two poses.

**2. NPC notes** (one note per NPC, in `npc_notes`) with the portrait embedded and these properties:

```yaml
---
location: The Gilded Goose, Rivergate
met: true
card_name: The Fishwife
---
```

`location` is "Place, Region", with the place written exactly like its picture name. `met: true` once the party
has met them; unmet NPCs are dimmed in the panel. `card_name` is optional: the name the players know.

**3. Picture names.** Places: `<Place> 1.png`, `<Place> 2.png`. People: `<Name>.png`, `<Name> 2.png`. A place
picture with "map" in its name is treated as DM-only.

**4. Place notes** (optional, in `place_notes`), named exactly like the place, with:

```yaml
---
region: Rivergate
first_visited: Session 4
---
```

Places with a `first_visited` are listed under their region; the rest under "Not visited yet".

## Prepare your vault with Claude

The folder `skills/theatre-setup` is a skill for [Claude Code](https://claude.com/claude-code) that converts your
vault to the conventions above. It surveys first, shows you a plan, asks before anything risky, and **only adds**
boxes and properties: it never rewrites your notes.

1. **Back up your vault first** (copy the folder, or commit it if you use git).
2. Install the skill: copy the folder `skills/theatre-setup` from Theatre into your vault, so you get
   `<your vault>/.claude/skills/theatre-setup/SKILL.md`. (The `.claude` folder is hidden; create it if it isn't
   there.) To have it in every project instead, copy it to `~/.claude/skills/theatre-setup/` in your user folder.
3. Open Claude Code in your vault folder and say, for example:

   > Set up my vault for Theatre. Theatre is installed in C:/Users/Anna/Documents/Theatre.

4. Claude will look around, propose which folders are what, and wait for your OK. It writes `campaigns.json`,
   fills in NPC and place properties, and adds "Show the players" boxes one chapter at a time so you can check
   each in Theatre. At the end you get a to-do list of scenes still missing a picture.

After each session you can say "update the vault for Theatre after session 5": it marks NPCs as met, places as
visited, and adds boxes for new pictures.

## Run a session

1. Start Theatre:
   - **Windows:** double-click `start.bat`.
   - **Mac:** double-click `start.command`. The first time, macOS may refuse to open it: right-click it → **Open**
     → **Open**. If it says it isn't allowed to run, open Terminal in the Theatre folder and type
     `chmod +x *.command` once.
   A small server window opens (leave it open; close it to stop Theatre) and the **DM panel** opens in your browser.
   Windows tip: double-click `make-shortcut.bat` once to get a **Theatre** shortcut with the app icon on your
   desktop.
2. In the DM panel, click **Open projector window**, drag that window to the projector or TV, and click anywhere in
   it: it goes full screen and is allowed to play sound.
3. Pick your campaign at the top.

**The DM panel**

- **Left: Places.** *Adventure* lists the files from `browse`; pick one and its pictures appear as tiles, grouped
  by scene. *Location* lists places by region. Click a tile to show it; **Shift+click** puts a second picture beside
  it; **Both** shows a pair.
- **Right: the monitor** shows exactly what's on the projector. Below it: **Effects**, **Sounds** and **People**.
  Effects and Sounds fold away (click their title) to a one-line summary.
- **People.** *In scene* shows the people of the open file and of the place on screen (with the names the players
  know); *All* shows everyone, with filters for name, region, place and met. Click a pose to stand that person in
  front of the place (up to four); click again or ✕ to send them off. **Portrait** shows their full picture
  instead.
- **Arrange people on the monitor:** drag a person to move them (sideways, up to stand further back, or down past the bottom edge to bring them close), turn
  the mouse wheel over them to make them bigger or smaller, click ⇋ in their name tag to turn them around, and
  double-click to put them back. The projector follows as you drag.
- **Prepare mode** (top): your clicks build a green **Ready** view without touching the projector; press **Space**
  or **Show it** to reveal everything at once. **B** (black screen) always works immediately.
- **Fill screen (F)** crops pictures to fill the projector (people and effects always fill it).
- **Names (C)** shows name plates under people.
- Drag the line between the two halves to resize them; the panel remembers.

**Keys:** → / ← next or previous picture in the file · **B** black screen · **C** names · **F** fill screen ·
**K** shake · **X** clear people · **/** search pictures · **P** filter people · **Space** reveal (prepare mode).
The **Keys** button in the panel lists them too.

## Saved scenes

The **Scenes** tab (on the Places side, next to Adventure and Location) keeps set-ups you want to bring back with one click: "the tavern brawl", "the
throne room at night".

- Set up the place, the people (with their positions, sizes and flips), effects, Fill screen, names and the loops
  you want, open the **Scenes** tab, type a name and click **Save scene** (or press Enter). Saving with a name that already exists replaces that scene.
- To change a saved scene: click it, adjust anything, and click **Update scene** (the name box fills in when you
  pick a scene, and its tile is highlighted). Change the name first to save a variation as a new scene instead.
- Click a scene's tile to bring all of it back. In prepare mode it waits in the **Ready** view, and its loops start
  when you press **Show it**.
- **✕** on a tile deletes it (click twice: the first click asks).
- Scenes are kept per campaign in `scenes.json` in the Theatre folder (private, never uploaded). A second laptop on
  the Wi-Fi sees the same scenes.

## People in front of places (cut-outs)

To stand NPCs in front of a place, Theatre needs a see-through copy of each portrait. These are made by an
optional tool that runs on your computer (no internet needed after the first download).

1. Install it once. Open a terminal in the Theatre folder (Windows: in the folder's address bar type `cmd` and
   press Enter; Mac: right-click the folder → New Terminal at Folder) and run:
   - Windows: `pip install -r requirements.txt`
   - Mac: `pip3 install -r requirements.txt`
2. Double-click **make-cutouts.bat** (Windows) or **make-cutouts.command** (Mac). It makes cut-outs for every
   portrait that doesn't have one yet: about 20 seconds each. The first run downloads the cut-out model
   (about 1 GB).
3. New portraits later: run it again; it only does the new ones. A bad cut-out (part of a robe missing, background
   left over): delete it from `cutouts/<campaign>/` and run again, or try the other model:
   `python make_cutouts.py "<Campaign>" --model isnet-anime "<Name>.png"`.

Portraits painted on white or cream paper are cleaned up automatically: the white rim and the white brush strokes
where a painting fades into the paper are removed, while white clothes and hair inside the figure stay. Cut-outs
made before this clean-up existed can be fixed in seconds with `python make_cutouts.py --reclean` (the untouched
originals are kept in `cutouts/_originals/`).

People without a cut-out still work: they show their normal portrait instead, marked "no cut-out".

## Effects

The **Effects** row: mix as many as you like, pick **Light / Medium / Heavy**, **None** turns them off. They fade
in and out, stay on when you change pictures, follow prepare mode, and **B** clears them.

- **Weather:** Rain, Storm (rain with lightning), Snow, Mist, Ash, Leaves.
- **In the air:** Embers, Dust, Fireflies, Crows, Bats.
- **Look:** Underwater, Recording (old footage: sepia, grain, scan lines), Torchlight.
- **Eberron:** Lightning rail, Airship.
- **Mood** (one at a time): Night, Gray, Blood, Dream.
- **Shake (K)** jolts the projector once.

## Sounds

The **Sounds** row. Built-in sounds come with Theatre (recordings in the `audio` folder), no setup needed:

- **Loops** (play until clicked again): Rain light, Rain hard, Wind soft, Wind hard, Fire, Waves, Cave drips, Tavern
  crowd, Tavern empty, Forest day, Forest night, plus Eberron's Lightning rail, Airship,
  Sharn streets, Clock, Clock ominous, and Sothmere's Windmill.
- **Once:** Thunder, Sword, Explosion, Underwater explosion, Roar, Knock, Heavy knock, Creak, Heartbeat, Bell,
  Whoosh, Healing magic, Dark magic, Elemental magic, Rail horn, Steam hiss, Arcane zap.
- **Match effects:** effects bring their sound (Rain → light rain, Storm → hard rain and wind, Snow and Ash → soft
  wind, Embers → fire, Underwater → waves…) and each lightning flash is followed by thunder.
- **Play on:** *this laptop* or *projector PC* (which speakers it comes out of).
- Separate volumes for **Loops** and **Once**; **Stop sounds** fades everything out.

**Your own sounds:** put mp3/ogg/wav/m4a files in the `sounds` folder. `sounds/Loops` repeat, `sounds/Effects` play
once, any other folder becomes its own group (put "loop" in a folder or file name to make it repeat). Free
recordings: [Tabletop Audio](https://tabletopaudio.com), [Freesound](https://freesound.org) (check each file's
licence).

## Other laptops and a projector PC

Theatre can be run from another computer on the same Wi-Fi. A typical setup: one PC runs Theatre, a second PC is
plugged into the projector, and you run the game from a laptop.

1. On the computer running Theatre, open **Share** (top right of the DM panel), type a password (4+ characters)
   and click **Turn on**. That computer itself never needs the password.
2. Share shows two links:
   - **The DM panel link** (like `http://192.168.1.20:8765/`): open it on your laptop and type the password. It
     stays signed in for 30 days.
   - **The projector link**: open it once on the projector PC. It needs no password, can't control anything, and
     can only load the pictures currently on screen. Click its window once for full screen and sound.
3. Everything stays in step: any panel drives the same projector and shows the others' changes.

The first time, Windows may ask whether Python may use the network: allow it on **private** networks. Changing the
password signs every other computer out and replaces the projector link; **Turn off other laptops** closes access.
The password is only stored as a scrambled hash (in `remote.json`). Use this on your home Wi-Fi; on public Wi-Fi,
use a strong password or keep it off.

## Troubleshooting

- **The panel says nothing / the campaign list is empty:** `campaigns.json` is missing or has a typo. The server
  window prints what's wrong. Check commas and quotes, and use `/` in paths.
- **A picture doesn't appear in a file:** the box must start with `> [!example] Show the players:` or
  `> [!tip] Show the players:`, and the `![[picture]]` must be on a line starting with `>` right below it.
- **An NPC isn't "In scene":** their note's `location` must start with the place exactly as its pictures are named
  (`The Gilded Goose, Rivergate` for `The Gilded Goose 1.png`).
- **No sound on the projector PC:** click the projector window once; browsers only allow sound after a click.
- **The panel looks old after an update:** press **Ctrl+F5** (Mac: **Cmd+Shift+R**).
- **"Port 8765 is busy":** Theatre is already running in another window. Close it, then start again.

## Files

| File | What it is |
|---|---|
| `start.bat` / `start.command` | Start Theatre (Windows / Mac). |
| `make-shortcut.bat` | Puts a Theatre shortcut with the icon on your Windows desktop. |
| `theatre.ico`, `favicon.ico`, `icon.png` | The app icon. |
| `campaigns.example.json` | Template for your `campaigns.json`. |
| `server.py` | The local server (plain Python). |
| `control.html`, `screen.html` | The DM panel and the projector screen. |
| `fx.js`, `sound.js`, `relay.js` | Effects, sounds, and messages between windows. |
| `make_cutouts.py`, `make-cutouts.bat` / `.command`, `requirements.txt` | The optional cut-out tool. |
| `skills/theatre-setup/` | The Claude skill that prepares a vault. |
| `CLAUDE.md` | Tells Claude about the project when it is opened in the Theatre folder. |
| `audio/` | The built-in sound recordings. |
| `sounds/` | Your own sound files. |

Your own files stay private and are never uploaded: `campaigns.json`, `remote.json`, `scenes.json`, `cutouts/`, your sound files.
