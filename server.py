"""Theatre: a tiny local server that reads Obsidian campaign vaults and serves the DM panel and the projector screen.

Run start.bat / start.command (or: python server.py). Campaigns are set in campaigns.json.
Nothing is ever written to a vault.
"""
import hashlib
import hmac
import json
import os
import queue
import re
import secrets
import socket
import threading
import time
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

APP_FOLDER = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(APP_FOLDER, "campaigns.json")
ALWAYS_SKIPPED_FOLDERS = {".git", ".obsidian", ".claude", ".trash"}
_campaign_cache = {"modified": None, "campaigns": {}}


def campaigns():
    """The campaigns in campaigns.json (see campaigns.example.json). Re-read whenever the file changes."""
    try:
        modified = os.path.getmtime(SETTINGS_FILE)
    except OSError:
        return {}

    if modified != _campaign_cache["modified"]:
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError) as error:
            print("campaigns.json could not be read: %s" % error)
            return _campaign_cache["campaigns"]

        loaded = {}

        for name, settings in (data.get("campaigns") or {}).items():

            if name.startswith("_") or not isinstance(settings, dict) or not settings.get("vault"):
                continue

            loaded[name] = {
                "vault": os.path.expanduser(settings["vault"]),
                "groups": [tuple(pair) for pair in settings.get("browse") or settings.get("groups") or []],
                "place_images": settings.get("place_images") or "",
                "place_notes": settings.get("place_notes") or None,
                "region_file": settings.get("region_file") or None,
                "npc_notes": settings.get("npc_notes") or "",
                "portrait_images": settings.get("portrait_images") or "",
                "item_notes": settings.get("item_notes") or "",
                "item_images": settings.get("item_images") or "",
                "skip_folders": set(settings.get("skip_folders") or []),
            }

        _campaign_cache["modified"] = modified
        _campaign_cache["campaigns"] = loaded

    return _campaign_cache["campaigns"]


# Place pictures with these words in the name are DM-only and never listed by location.
DM_ONLY_PLACE_WORDS = ("map",)
# NPC locations that aren't places.
IGNORED_NPC_LOCATIONS = {"unknown", "with the party", ""}
PORT = 8765
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".gif")
CACHE_SECONDS = 20

CALLOUT_PATTERN = re.compile(r"^>\s*\[!(\w+)\][-+]?\s*Show the players:\s*(.*)$", re.IGNORECASE)
EMBED_PATTERN = re.compile(r"!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]")
WIKILINK_PATTERN = re.compile(r"\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]")
HEADING_PATTERN = re.compile(r"^(#{1,5})\s+(.*)$")

_image_cache = {}


def campaign_vault(campaign_name):
    campaign = campaigns().get(campaign_name)

    if not campaign:
        return None

    return campaign["vault"]


def walk_vault(root, campaign_name=None):
    campaign = campaigns().get(campaign_name) or {}
    skipped = ALWAYS_SKIPPED_FOLDERS | campaign.get("skip_folders", set())

    for folder, subfolders, file_names in os.walk(root):
        subfolders[:] = [name for name in subfolders if name not in skipped]
        yield folder, file_names


def build_image_index(campaign_name):
    """Every image in the campaign's vault by lower-case file name. Rebuilt at most every 20 seconds, so new pictures appear on their own."""
    now = time.time()
    cached = _image_cache.get(campaign_name)

    if cached and now - cached["built_at"] < CACHE_SECONDS:
        return cached["index"]

    vault = campaign_vault(campaign_name)
    image_index = {}

    if vault:

        for folder, file_names in walk_vault(vault, campaign_name):

            for file_name in file_names:

                if file_name.lower().endswith(IMAGE_EXTENSIONS):
                    image_index.setdefault(file_name.lower(), os.path.join(folder, file_name))

    _image_cache[campaign_name] = {"built_at": now, "index": image_index}
    return image_index


def clean_label(raw_label):
    def replace_link(match):
        return match.group(2) or match.group(1)

    return WIKILINK_PATTERN.sub(replace_link, raw_label).strip()


def natural_key(text):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", text)]


def list_adventure_files(campaign_name):
    campaign = campaigns().get(campaign_name)

    if not campaign:
        return []

    vault = campaign["vault"]
    groups = []

    for group_name, folder_name in campaign["groups"]:
        root = os.path.join(vault, folder_name)
        entries = []

        if not os.path.isdir(root):
            continue

        for folder, file_names in walk_vault(root, campaign_name):

            for file_name in file_names:

                if not file_name.endswith(".md"):
                    continue

                full_path = os.path.join(folder, file_name)

                try:
                    with open(full_path, encoding="utf-8") as handle:
                        has_pictures = "Show the players" in handle.read()
                except OSError:
                    has_pictures = False

                if has_pictures:
                    entries.append({"path": os.path.relpath(full_path, vault), "name": file_name[:-3]})

        entries.sort(key=lambda entry: natural_key(entry["path"]))

        if entries:
            groups.append({"group": group_name, "files": entries})

    return groups


def read_scenes(campaign_name, relative_path):
    vault = campaign_vault(campaign_name)

    if not vault:
        return []

    full_path = os.path.normpath(os.path.join(vault, relative_path))

    if not full_path.startswith(os.path.normpath(vault)) or not os.path.isfile(full_path):
        return []

    image_index = build_image_index(campaign_name)

    with open(full_path, encoding="utf-8") as handle:
        lines = handle.read().split("\n")

    scenes = []
    current_heading = os.path.basename(full_path)[:-3]
    heading_stack = {}
    index = 0

    while index < len(lines):
        line = lines[index]
        heading_match = HEADING_PATTERN.match(line)

        if heading_match:
            level = len(heading_match.group(1))
            heading_stack = {key: value for key, value in heading_stack.items() if key < level}
            heading_stack[level] = clean_label(heading_match.group(2))
            levels = sorted(heading_stack)
            deepest = heading_stack[levels[-1]]

            if len(levels) > 1 and levels[-1] >= 4:
                current_heading = heading_stack[levels[-2]] + " › " + deepest
            else:
                current_heading = deepest

            index += 1
            continue

        callout_match = CALLOUT_PATTERN.match(line.strip())

        if not callout_match:
            index += 1
            continue

        kind = callout_match.group(1).lower()
        label = clean_label(callout_match.group(2))
        images = []
        index += 1

        while index < len(lines) and lines[index].lstrip().startswith(">"):

            for embed in EMBED_PATTERN.findall(lines[index]):
                image_name = os.path.basename(embed.strip())

                if image_name.lower() in image_index:
                    images.append(image_name)

            index += 1

        if images:
            item = {"label": label, "kind": kind, "images": images}

            if scenes and scenes[-1]["heading"] == current_heading:
                scenes[-1]["items"].append(item)
            else:
                scenes.append({"heading": current_heading, "items": [item]})

    return scenes


FRONTMATTER_LINE = re.compile(r"^([A-Za-z_ ]+):\s*(.*)$")
TRAILING_NUMBER = re.compile(r"\s+\d+$")


def read_frontmatter(text):
    fields = {}

    if not text.startswith("---"):
        return fields

    end = text.find("\n---", 3)

    if end == -1:
        return fields

    for line in text[3:end].split("\n"):
        match = FRONTMATTER_LINE.match(line.strip())

        if match:
            fields[match.group(1).strip().lower()] = match.group(2).strip().strip('"').strip("'")

    return fields


def is_met(fields):
    """An NPC the party has met: `met: true` in the note, or `card: published` (the older way)."""
    return fields.get("met", "").lower() in ("true", "yes") or fields.get("card", "").lower() == "published"


def note_title(text, fallback):

    for line in text.split("\n"):

        if line.startswith("# "):
            return clean_label(line[2:])

    return fallback


NOT_VISITED_GROUP = "Not visited yet"
ELSEWHERE_GROUP = "Elsewhere"


def name_core(name):
    lowered = name.lower().strip()

    if lowered.startswith("the "):
        lowered = lowered[4:]

    return lowered


def load_region_file(campaign):
    region_file = campaign.get("region_file")

    if not region_file:
        return {}

    try:
        with open(os.path.join(APP_FOLDER, region_file), encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return {}

    return {name: region for name, region in data.items() if not name.startswith("_")}


def new_place(name):
    return {"name": name, "region": "", "visited": False, "images": [], "people": []}


def list_locations(campaign_name):
    """Places from the place-picture folder, each with its pictures and the people whose notes say they're there.

    Each place gets a `group`: its region if the party has been there, otherwise "Not visited yet".
    """
    campaign = campaigns().get(campaign_name)

    if not campaign or not campaign.get("place_images"):
        return []

    vault = campaign["vault"]
    image_index = build_image_index(campaign_name)
    places = {}
    place_folder = os.path.join(vault, campaign["place_images"])

    if os.path.isdir(place_folder):

        for file_name in sorted(os.listdir(place_folder), key=natural_key):

            if not file_name.lower().endswith(IMAGE_EXTENSIONS):
                continue

            stem = os.path.splitext(file_name)[0]

            if any(word in stem.lower() for word in DM_ONLY_PLACE_WORDS):
                continue

            place_name = TRAILING_NUMBER.sub("", stem)
            places.setdefault(place_name, new_place(place_name))
            places[place_name]["images"].append(file_name)

    for place_name, region in load_region_file(campaign).items():

        if place_name in places:
            places[place_name]["region"] = region
            places[place_name]["visited"] = True

    if campaign.get("place_notes"):
        notes_folder = os.path.join(vault, campaign["place_notes"])
        note_names = os.listdir(notes_folder) if os.path.isdir(notes_folder) else []

        for file_name in note_names:

            if not file_name.endswith(".md"):
                continue

            with open(os.path.join(notes_folder, file_name), encoding="utf-8") as handle:
                fields = read_frontmatter(handle.read())

            place_name = file_name[:-3]

            if place_name in places:
                places[place_name]["region"] = fields.get("region", "")
                places[place_name]["visited"] = bool(fields.get("first_visited", ""))

    known_regions = sorted({place["region"] for place in places.values() if place["region"]}, key=len, reverse=True)
    npc_folder = os.path.join(vault, campaign["npc_notes"])
    npc_names = sorted(os.listdir(npc_folder), key=natural_key) if os.path.isdir(npc_folder) else []

    for file_name in npc_names:

        if not file_name.endswith(".md"):
            continue

        with open(os.path.join(npc_folder, file_name), encoding="utf-8") as handle:
            text = handle.read()

        fields = read_frontmatter(text)
        npc_location = fields.get("location", "")

        if npc_location.lower() in IGNORED_NPC_LOCATIONS:
            continue

        images = []

        for embed in EMBED_PATTERN.findall(text):
            image_name = os.path.basename(embed.strip())

            if image_name.lower() in image_index and image_name not in images:
                images.append(image_name)

        if not images:
            continue

        person = {
            "name": fields.get("card_name") or note_title(text, file_name[:-3]),
            "images": images[:3],
            "met": is_met(fields),
        }
        location_lower = npc_location.lower()
        first_segment = name_core(re.split(r"[,;—(/]", npc_location)[0])
        matched = []

        for place in places.values():
            place_core = name_core(place["name"])

            if not place["images"]:
                continue

            whole_word = re.search(r"(?<![\w'])" + re.escape(place_core) + r"(?![\w'])", location_lower)

            if whole_word or (len(first_segment) > 3 and first_segment == place_core):
                matched.append(place)

        if not matched and len(first_segment) > 3:
            matched = [
                place for place in places.values()
                if place["images"] and first_segment in name_core(place["name"])
            ]

            if len(matched) > 1:
                matched = []

        if matched:
            longest = max(len(place["name"]) for place in matched)

            for place in matched:

                if len(place["name"]) == longest:
                    place["people"].append(person)

            continue

        # Only trust a region named as its own part of the location ("Old Mill, Rivergate"),
        # never one buried inside a place name ("Riverside Market" is not the region "River").
        location_parts = [name_core(part) for part in re.split(r"[,;—(/)]", npc_location) if part.strip()]
        region_hit = next((region for region in known_regions if name_core(region) in location_parts[1:]), "")
        extra_name = re.split(r"[,;—(/]", npc_location)[0].strip()

        if name_core(extra_name) in {name_core(region) for region in known_regions}:
            region_hit = next(region for region in known_regions if name_core(region) == name_core(extra_name))
            extra_name = region_hit + " (around)"

        places.setdefault(extra_name, new_place(extra_name))
        extra_place = places[extra_name]
        extra_place["region"] = extra_place["region"] or region_hit
        extra_place["people"].append(person)

        if person["met"]:
            extra_place["visited"] = True

    for place in places.values():

        if not place["images"]:
            place["visited"] = place["visited"] or any(person["met"] for person in place["people"])

        if place["visited"]:
            place["group"] = place["region"] or ELSEWHERE_GROUP
        else:
            place["group"] = NOT_VISITED_GROUP

    def sort_key(place):
        group_rank = 2 if place["group"] == NOT_VISITED_GROUP else (1 if place["group"] == ELSEWHERE_GROUP else 0)
        around_rank = 0 if place["name"].endswith("(around)") else 1
        return (group_rank, place["group"].lower(), around_rank, natural_key(place["name"]))

    return sorted(places.values(), key=sort_key)


def list_people(campaign_name):
    """Every NPC with a portrait: name, met or not, the place and region the location view puts them in,
    and their portraits (poses), each marked with whether it has a cut-out."""
    campaign = campaigns().get(campaign_name)

    if not campaign:
        return []

    available = set(list_cutouts(campaign_name))
    image_index = build_image_index(campaign_name)
    placed = {}

    for place in list_locations(campaign_name):

        for person in place["people"]:
            placed.setdefault(person["name"], {"place": place["name"], "region": place["region"]})

    npc_folder = os.path.join(campaign["vault"], campaign["npc_notes"])
    note_names = sorted(os.listdir(npc_folder), key=natural_key) if os.path.isdir(npc_folder) else []
    people = []
    claimed = set()

    for file_name in note_names:

        if not file_name.endswith(".md"):
            continue

        with open(os.path.join(npc_folder, file_name), encoding="utf-8") as handle:
            text = handle.read()

        fields = read_frontmatter(text)
        poses = []

        for embed in EMBED_PATTERN.findall(text):
            image_name = os.path.basename(embed.strip())
            stem = os.path.splitext(image_name)[0].lower()

            if image_name.lower() not in image_index or any(pose["image"] == image_name for pose in poses):
                continue

            poses.append({"image": image_name, "cutout": stem + ".png" in available})

        if not poses:
            continue

        claimed.update(os.path.splitext(pose["image"])[0].lower() for pose in poses)
        name = fields.get("card_name") or note_title(text, file_name[:-3])
        where = placed.get(name, {})
        people.append({
            "name": name,
            "met": is_met(fields),
            "location": fields.get("location", ""),
            "place": where.get("place", ""),
            "region": where.get("region", ""),
            "poses": poses[:3],
        })

    # Item pictures share the cut-out folder; they belong to the Items tab.
    item_stems = {
        os.path.splitext(entry["image"])[0].lower()
        for item in list_items(campaign_name)
        for entry in item["pictures"]
    }

    # Portraits with a cut-out that no note embeds still get listed, under their file name.
    for cutout_name in sorted(available, key=natural_key):
        stem = os.path.splitext(cutout_name)[0]

        if stem in claimed or stem in item_stems:
            continue

        portrait = next(
            (os.path.basename(path) for name, path in image_index.items() if os.path.splitext(name)[0] == stem),
            None,
        )

        if portrait:
            people.append({
                "name": os.path.splitext(portrait)[0],
                "met": False,
                "location": "",
                "place": "",
                "region": "",
                "poses": [{"image": portrait, "cutout": True}],
            })

    return people


def is_found(fields):
    """An item the players have seen or hold: `found: true` in its note."""
    return fields.get("found", "").lower() in ("true", "yes")


def list_items(campaign_name):
    """Every item with a picture: the item notes (pictures embedded in them, `found`, `card_name`, `location`),
    then any picture in the item picture folder that no note embeds, named after its file."""
    campaign = campaigns().get(campaign_name)

    if not campaign:
        return []

    available = set(list_cutouts(campaign_name))
    image_index = build_image_index(campaign_name)
    items = []
    claimed = set()

    def picture(image_name):
        stem = os.path.splitext(image_name)[0].lower()
        return {"image": image_name, "cutout": stem + ".png" in available}

    if campaign["item_notes"]:
        notes_folder = os.path.join(campaign["vault"], campaign["item_notes"])
        note_names = sorted(os.listdir(notes_folder), key=natural_key) if os.path.isdir(notes_folder) else []

        for file_name in note_names:

            if not file_name.endswith(".md"):
                continue

            with open(os.path.join(notes_folder, file_name), encoding="utf-8") as handle:
                text = handle.read()

            fields = read_frontmatter(text)
            pictures = []

            for embed in EMBED_PATTERN.findall(text):
                image_name = os.path.basename(embed.strip())

                if image_name.lower() not in image_index or any(entry["image"] == image_name for entry in pictures):
                    continue

                pictures.append(picture(image_name))

            if not pictures:
                continue

            claimed.update(entry["image"].lower() for entry in pictures)
            note_name = note_title(text, file_name[:-3])
            items.append({
                "name": fields.get("card_name") or note_name,
                "noteName": note_name,
                "found": is_found(fields),
                "location": fields.get("location", ""),
                "pictures": pictures[:3],
            })

    if campaign["item_images"]:
        picture_folder = os.path.join(campaign["vault"], campaign["item_images"])
        file_names = sorted(os.listdir(picture_folder), key=natural_key) if os.path.isdir(picture_folder) else []
        loose = {}

        for file_name in file_names:

            if not file_name.lower().endswith(IMAGE_EXTENSIONS) or file_name.lower() in claimed:
                continue

            item_name = TRAILING_NUMBER.sub("", os.path.splitext(file_name)[0])
            loose.setdefault(item_name, []).append(picture(file_name))

        for item_name, pictures in loose.items():
            items.append({
                "name": item_name,
                "noteName": "",
                "found": True,
                "location": "",
                "pictures": pictures[:3],
            })

    return items


SOUND_EXTENSIONS = (".mp3", ".ogg", ".wav", ".m4a", ".webm", ".flac")


def list_sounds():
    """Sound files in the app's sounds folder: one group per folder. Loops repeat; the rest play once."""
    root = os.path.join(APP_FOLDER, "sounds")
    sounds = []

    if not os.path.isdir(root):
        return sounds

    for folder, subfolders, file_names in os.walk(root):
        subfolders.sort(key=natural_key)
        relative_folder = os.path.relpath(folder, root)
        group = "Sounds" if relative_folder == "." else relative_folder.replace(os.sep, " / ")

        for file_name in sorted(file_names, key=natural_key):

            if not file_name.lower().endswith(SOUND_EXTENSIONS):
                continue

            relative_path = os.path.relpath(os.path.join(folder, file_name), APP_FOLDER).replace(os.sep, "/")
            loop = "loop" in relative_path.lower()
            sounds.append({
                "id": "file:" + relative_path,
                "name": os.path.splitext(file_name)[0],
                "group": group,
                "loop": loop,
                "url": "/" + urllib.parse.quote(relative_path),
            })

    return sounds


# ---------- saved scenes: place, people, effects and sounds, recalled with one click ----------

SAVED_SCENES_FILE = os.path.join(APP_FOLDER, "scenes.json")
_saved_scenes_lock = threading.Lock()


def load_saved_scenes():
    try:
        with open(SAVED_SCENES_FILE, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return {}

    return data if isinstance(data, dict) else {}


def saved_scenes_for(campaign_name):
    return load_saved_scenes().get(campaign_name, [])


def change_saved_scenes(campaign_name, request):
    """save (replaces a scene with the same name) or delete. Returns the campaign's scenes."""
    with _saved_scenes_lock:
        everything = load_saved_scenes()
        scenes = everything.get(campaign_name, [])
        name = str(request.get("name", "")).strip()[:80]

        if request.get("action") == "save" and name and isinstance(request.get("scene"), dict):
            entry = {"name": name, "scene": request["scene"], "saved": time.strftime("%Y-%m-%d %H:%M")}
            existing = [index for index, scene in enumerate(scenes) if scene.get("name") == name]

            if existing:
                scenes[existing[0]] = entry
            else:
                scenes.append(entry)

        elif request.get("action") == "delete":
            scenes = [scene for scene in scenes if scene.get("name") != name]

        everything[campaign_name] = scenes
        temporary = SAVED_SCENES_FILE + ".tmp"

        with open(temporary, "w", encoding="utf-8") as handle:
            json.dump(everything, handle, indent=2, ensure_ascii=False)

        os.replace(temporary, SAVED_SCENES_FILE)
        return scenes


def cutout_folder(campaign_name):
    if campaign_name not in campaigns():
        return None

    return os.path.join(APP_FOLDER, "cutouts", campaign_name)


def list_cutouts(campaign_name):
    """Portrait names (lower case, as in the vault) that have a transparent cut-out made by make_cutouts.py."""
    folder = cutout_folder(campaign_name)

    if not folder or not os.path.isdir(folder):
        return []

    return sorted(file_name.lower() for file_name in os.listdir(folder) if file_name.lower().endswith(".png"))


def cutout_file(campaign_name, image_name):
    """The cut-out for a portrait: same name, always .png."""
    folder = cutout_folder(campaign_name)

    if not folder:
        return None

    file_name = os.path.splitext(os.path.basename(image_name))[0] + ".png"
    cutout_path = os.path.join(folder, file_name)

    if not os.path.isfile(cutout_path):
        return None

    return cutout_path


# ---------- other laptops on the Wi-Fi: password, sessions and the message relay ----------

REMOTE_FILE = os.path.join(APP_FOLDER, "remote.json")
SESSION_COOKIE = "table_screen_session"
VIEWER_COOKIE = "table_screen_projector"
# What a projector-only computer may send back: that it is there, lightning, and which sounds play.
VIEWER_MESSAGES = {"screen-ready", "lightning", "sound-status"}
LOCAL_ADDRESSES = {"127.0.0.1", "::1", "::ffff:127.0.0.1"}
# Only these app files may be fetched directly; everything else (remote.json, server.py, cutouts) stays private.
PUBLIC_FILES = {"/control.html", "/screen.html", "/fx.js", "/sound.js", "/relay.js"}
# The app icon is shown even on the login page.
ICON_FILES = {"/favicon.ico", "/icon.png"}
_remote_lock = threading.Lock()


def load_remote():
    try:
        with open(REMOTE_FILE, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return {}


def save_remote(settings):
    with open(REMOTE_FILE, "w", encoding="utf-8") as handle:
        json.dump(settings, handle, indent=2)


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 200000).hex()


def set_password(password):
    """Stores only a salted hash. A new password also logs out every other laptop."""
    with _remote_lock:
        salt = secrets.token_hex(16)
        save_remote({
            "salt": salt,
            "hash": password_hash(password, salt),
            "secret": secrets.token_hex(32),
        })


def turn_off_remote():
    with _remote_lock:
        save_remote({})


def check_password(password):
    settings = load_remote()

    if not settings.get("hash"):
        return False

    return hmac.compare_digest(password_hash(password, settings["salt"]), settings["hash"])


def session_token():
    settings = load_remote()

    if not settings.get("secret"):
        return None

    return hmac.new(bytes.fromhex(settings["secret"]), b"table-screen-session", hashlib.sha256).hexdigest()


def projector_key():
    """The key in the projector-only link. It changes whenever the password does."""
    settings = load_remote()

    if not settings.get("secret"):
        return None

    return hmac.new(bytes.fromhex(settings["secret"]), b"table-screen-projector", hashlib.sha256).hexdigest()[:32]


def lan_addresses():
    """This computer's addresses on the local network, for the link to share."""
    addresses = []

    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("192.168.0.1", 9))  # no packet is sent; this only picks the outgoing interface
        addresses.append(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass

    try:
        for address in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not address.startswith("127.") and address not in addresses:
                addresses.append(address)
    except OSError:
        pass

    return addresses


class Relay:
    """Passes messages between control and projector windows on any computer, through the server."""

    def __init__(self):
        self.lock = threading.Lock()
        self.listeners = []
        self.last_show = None

    def subscribe(self):
        listener = queue.Queue()

        with self.lock:
            self.listeners.append(listener)

            # a window that joins late gets the picture that is up right now
            if self.last_show:
                listener.put(self.last_show)

        return listener

    def unsubscribe(self, listener):
        with self.lock:
            if listener in self.listeners:
                self.listeners.remove(listener)

    def shown_pictures(self):
        """File names of the pictures and cut-outs on the projector right now."""
        with self.lock:
            text = self.last_show

        if not text:
            return set()

        try:
            state = json.loads(text).get("state") or {}
        except ValueError:
            return set()

        names = {name.lower() for name in state.get("images") or []}

        for person in state.get("people") or []:
            names.add(str(person.get("image", "")).lower())

        if isinstance(state.get("item"), dict):
            names.add(str(state["item"].get("image", "")).lower())

        return names

    def publish(self, message):
        text = json.dumps(message)

        with self.lock:
            if message.get("type") == "show":
                self.last_show = text

            for listener in self.listeners:
                listener.put(text)


RELAY = Relay()

LOGIN_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Theatre</title>
<link rel="icon" href="/favicon.ico" sizes="any">
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #17110f; color: #efe3d4; font-family: "Segoe UI", system-ui, sans-serif; }
  form { background: #221915; border: 1px solid #3f2e27; border-radius: 8px; padding: 24px; width: min(320px, 90vw); display: flex; flex-direction: column; gap: 12px; }
  h1 { margin: 0; font-family: "Palatino Linotype", Georgia, serif; color: #e5693a; font-size: 1.3rem; }
  input, button { font: inherit; color: #efe3d4; background: #2c201b; border: 1px solid #3f2e27; border-radius: 4px; padding: 8px 10px; }
  button { cursor: pointer; border-color: #c9a45c; }
  .error { color: #e07a7a; font-size: 0.9rem; min-height: 1.2em; margin: 0; }
</style></head><body>
<form method="post" action="/login">
  <h1>Theatre</h1>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
  <input type="hidden" name="next" value="%s">
  <p class="error">%s</p>
  <button type="submit">Open the DM panel</button>
</form></body></html>"""


class ScreenHandler(SimpleHTTPRequestHandler):
    # Keeps the projector's live connection from blocking the server from closing.
    protocol_version = "HTTP/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_FOLDER, **kwargs)

    def log_message(self, message_format, *args):
        return

    def end_headers(self):
        # The control and projector pages must never come from the browser's cache, or updates don't show.
        if not self.path.startswith(("/img/", "/cutout/", "/api/")):
            self.send_header("Cache-Control", "no-store")

        super().end_headers()

    def send_json(self, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- who is asking ----------

    def is_local(self):
        return self.client_address[0] in LOCAL_ADDRESSES

    def cookie(self, wanted_name):

        for part in self.headers.get("Cookie", "").split(";"):
            name, _separator, value = part.strip().partition("=")

            if name == wanted_name:
                return value

        return ""

    def is_signed_in(self):

        if self.is_local():
            return True

        token = session_token()
        return bool(token) and hmac.compare_digest(self.cookie(SESSION_COOKIE), token)

    def is_projector(self):
        """A projector-only computer: may show the screen, nothing else."""
        key = projector_key()
        return bool(key) and hmac.compare_digest(self.cookie(VIEWER_COOKIE), key)

    def projector_may_get(self, path):
        """Projector-only computers get the app's screen files, sounds, and only the pictures on screen."""

        if path in ("/screen", "/fx.js", "/sound.js", "/relay.js", "/api/events"):
            return True

        decoded = urllib.parse.unquote(path)

        if decoded.startswith(("/sounds/", "/audio/")):
            return True

        if decoded.startswith(("/img/", "/cutout/")):
            image_name = decoded.split("/", 3)[-1].lower()
            shown = RELAY.shown_pictures()
            stem = os.path.splitext(image_name)[0]
            return image_name in shown or any(os.path.splitext(name)[0] == stem for name in shown)

        return False

    def send_text(self, status, body, content_type="text/html; charset=utf-8", extra_headers=None):
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))

        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)

        self.end_headers()
        self.wfile.write(data)

    def redirect(self, location, extra_headers=None):
        self.send_response(303)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")

        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)

        self.end_headers()

    def read_body(self):
        length = int(self.headers.get("Content-Length", "0") or 0)

        if length > 1_000_000:
            return b""

        return self.rfile.read(length) if length else b""

    def stream_events(self):
        listener = RELAY.subscribe()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        try:
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()

            while True:
                try:
                    message = listener.get(timeout=15)
                    self.wfile.write(("data: " + message + "\n\n").encode("utf-8"))
                except queue.Empty:
                    self.wfile.write(b": still here\n\n")

                self.wfile.flush()
        except OSError:
            pass
        finally:
            RELAY.unsubscribe(listener)

    # ---------- requests ----------

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/login":
            fields = urllib.parse.parse_qs(self.read_body().decode("utf-8", "replace"))
            password = fields.get("password", [""])[0]

            if password and check_password(password):
                cookie = "%s=%s; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict" % (SESSION_COOKIE, session_token())
                next_page = fields.get("next", ["/"])[0]
                return self.redirect(next_page if next_page in ("/", "/screen") else "/", {"Set-Cookie": cookie})

            time.sleep(1)  # slows down guessing
            message = "Wrong password." if load_remote().get("hash") else "Remote access is off on the DM's computer."
            next_page = fields.get("next", ["/"])[0]
            next_page = next_page if next_page in ("/", "/screen") else "/"
            return self.send_text(401, LOGIN_PAGE % (next_page, message))

        signed_in = self.is_signed_in()

        if not signed_in and not (self.is_projector() and parsed.path == "/api/relay"):
            return self.send_text(403, "Sign in first.", "text/plain; charset=utf-8")

        if parsed.path == "/api/relay":
            try:
                message = json.loads(self.read_body().decode("utf-8"))
            except ValueError:
                return self.send_text(400, "Bad message.", "text/plain; charset=utf-8")

            if not isinstance(message, dict):
                return self.send_text(400, "Bad message.", "text/plain; charset=utf-8")

            if not signed_in and message.get("type") not in VIEWER_MESSAGES:
                return self.send_text(403, "The projector can only show.", "text/plain; charset=utf-8")

            RELAY.publish(message)
            return self.send_json({"ok": True})

        if parsed.path == "/api/saved-scenes":
            try:
                request = json.loads(self.read_body().decode("utf-8"))
            except ValueError:
                return self.send_text(400, "Bad request.", "text/plain; charset=utf-8")

            campaign_name = str(request.get("campaign", ""))

            if campaign_name not in campaigns():
                return self.send_text(404, "No such campaign.", "text/plain; charset=utf-8")

            return self.send_json(change_saved_scenes(campaign_name, request))

        if parsed.path == "/api/remote":

            # only the DM's own computer may change the password
            if not self.is_local():
                return self.send_text(403, "Only on the DM's computer.", "text/plain; charset=utf-8")

            try:
                request = json.loads(self.read_body().decode("utf-8"))
            except ValueError:
                request = {}

            if request.get("off"):
                turn_off_remote()
            elif len(request.get("password", "")) >= 4:
                set_password(request["password"])
            else:
                return self.send_text(400, "The password needs at least 4 characters.", "text/plain; charset=utf-8")

            return self.send_json(self.remote_status())

        self.send_error(404)

    def remote_status(self):
        enabled = bool(load_remote().get("hash"))
        addresses = lan_addresses()
        status = {
            "local": self.is_local(),
            "enabled": enabled,
            "links": ["http://%s:%d/" % (address, PORT) for address in addresses],
        }

        # only the DM's own computer is shown the projector link
        if enabled and self.is_local():
            status["projectorLinks"] = ["http://%s:%d/screen?key=%s" % (address, PORT, projector_key()) for address in addresses]

        return status

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        campaign_name = query.get("campaign", [""])[0]

        if parsed.path == "/api/quit":

            # A newly started server asks the old one to step aside, so two never answer at once.
            if not self.is_local():
                return self.send_text(403, "No.", "text/plain; charset=utf-8")

            self.send_json({"stopping": True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return

        if parsed.path in ICON_FILES:
            return super().do_GET()

        if parsed.path == "/login":
            message = "" if load_remote().get("hash") else "Remote access is off on the DM's computer."
            next_page = query.get("next", ["/"])[0]
            next_page = next_page if next_page in ("/", "/screen") else "/"
            return self.send_text(200, LOGIN_PAGE % (next_page, message))

        # the projector-only link: /screen?key=... remembers this computer as a projector
        if parsed.path == "/screen" and query.get("key"):
            key = projector_key()

            if key and hmac.compare_digest(query["key"][0], key):
                cookie = "%s=%s; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict" % (VIEWER_COOKIE, key)
                return self.redirect("/screen", {"Set-Cookie": cookie})

            return self.send_text(403, "This projector link is out of date. Ask the DM for the new one.", "text/plain; charset=utf-8")

        if not self.is_signed_in():

            if self.is_projector() and self.projector_may_get(parsed.path):
                pass
            elif parsed.path in ("/", "/control", "/screen"):
                return self.redirect("/login?next=" + ("/screen" if parsed.path == "/screen" else "/"))
            else:
                return self.send_text(403, "Sign in first.", "text/plain; charset=utf-8")

        if parsed.path in ("/", "/control"):
            self.path = "/control.html"
            return super().do_GET()

        if parsed.path == "/screen":
            self.path = "/screen.html"
            return super().do_GET()

        if parsed.path == "/api/events":
            return self.stream_events()

        if parsed.path == "/api/remote":
            return self.send_json(self.remote_status())

        if parsed.path == "/api/campaigns":
            return self.send_json(list(campaigns().keys()))

        if parsed.path == "/api/locations":
            return self.send_json(list_locations(campaign_name))

        if parsed.path == "/api/files":
            return self.send_json(list_adventure_files(campaign_name))

        if parsed.path == "/api/scenes":
            relative_path = query.get("file", [""])[0]
            return self.send_json(read_scenes(campaign_name, relative_path))

        if parsed.path == "/api/search":
            words = [word for word in query.get("q", [""])[0].lower().split() if word]
            image_index = build_image_index(campaign_name)
            matches = [
                os.path.basename(path)
                for name, path in image_index.items()
                if words and all(word in name for word in words)
            ]
            matches.sort(key=natural_key)
            return self.send_json(matches[:120])

        if parsed.path == "/api/people":
            return self.send_json(list_people(campaign_name))

        if parsed.path == "/api/items":
            return self.send_json(list_items(campaign_name))

        if parsed.path == "/api/saved-scenes":
            return self.send_json(saved_scenes_for(campaign_name))

        if parsed.path == "/api/sounds":
            return self.send_json(list_sounds())

        if parsed.path == "/api/cutouts":
            return self.send_json(list_cutouts(campaign_name))

        if parsed.path.startswith("/cutout/"):
            remainder = urllib.parse.unquote(parsed.path[len("/cutout/"):])
            cutout_campaign, _separator, image_name = remainder.partition("/")
            cutout_path = cutout_file(cutout_campaign, image_name)

            if not cutout_path:
                self.send_error(404)
                return

            with open(cutout_path, "rb") as handle:
                data = handle.read()

            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if parsed.path.startswith("/img/"):
            remainder = urllib.parse.unquote(parsed.path[len("/img/"):])
            image_campaign, _separator, image_name = remainder.partition("/")
            image_path = build_image_index(image_campaign).get(image_name.lower())

            if not image_path:
                self.send_error(404)
                return

            with open(image_path, "rb") as handle:
                data = handle.read()

            extension = os.path.splitext(image_path)[1].lower()
            content_type = {".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}.get(extension, "image/jpeg")
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "max-age=300")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        # plain files: only the app's own pages and scripts, its built-in audio, and the sounds folder
        if parsed.path in PUBLIC_FILES or urllib.parse.unquote(parsed.path).startswith(("/sounds/", "/audio/")):
            return super().do_GET()

        self.send_error(404)


class ScreenServer(ThreadingHTTPServer):
    # On Windows, address reuse lets a second server share the port and answer with old code.
    allow_reuse_address = False
    daemon_threads = True


def start_server():
    try:
        urllib.request.urlopen("http://127.0.0.1:%d/api/quit" % PORT, timeout=2).read()
        print("Stopped the table screen that was already running.")
    except OSError:
        pass

    for _attempt in range(20):
        try:
            return ScreenServer(("0.0.0.0", PORT), ScreenHandler)
        except OSError:
            time.sleep(0.5)

    raise SystemExit("Port %d is busy: close the other table screen window and try again." % PORT)


if __name__ == "__main__":
    server = start_server()
    print("Theatre on http://localhost:%d  (close this window to stop)" % PORT)

    if not campaigns():
        print("No campaigns yet: copy campaigns.example.json to campaigns.json and fill in your vault (see README).")

    if load_remote().get("hash"):
        for address in lan_addresses():
            print("Other laptops on this Wi-Fi: http://%s:%d/  (password needed)" % (address, PORT))
    else:
        print("Other laptops: off. Set a password under Share in the control window to allow them.")
    server.serve_forever()
