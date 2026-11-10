"""Make see-through cut-outs of NPC portraits, so people can stand in front of a place on the projector.

Cut-outs go to cutouts/<campaign>/<portrait name>.png next to this script. The vault is only read, never written.
Each campaign's portrait folder comes from campaigns.json ("portrait_images").

    python make_cutouts.py                                         # every campaign: portraits without a cut-out yet
    python make_cutouts.py "My Campaign"                           # one campaign
    python make_cutouts.py "My Campaign" "Jack.png" "Jack 2.png"   # just these (redoes them)
    python make_cutouts.py "My Campaign" --model isnet-anime "Jack.png"   # try the other model on a bad one

Needs: pip install -r requirements.txt (the first run downloads the cut-out model, about 1 GB).
"""
import argparse
import gc
import json
import os
import sys

import onnxruntime
from PIL import Image
from rembg import new_session, remove

APP_FOLDER = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL = "birefnet-general"
PORTRAIT_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")


def portrait_folders():
    """Each campaign's portrait folder, from campaigns.json."""
    with open(os.path.join(APP_FOLDER, "campaigns.json"), encoding="utf-8") as handle:
        data = json.load(handle)

    folders = {}

    for name, settings in (data.get("campaigns") or {}).items():

        if name.startswith("_") or not isinstance(settings, dict) or not settings.get("vault"):
            continue

        relative = settings.get("portrait_images") or os.path.join(settings.get("npc_notes") or "", "Images")
        folders[name] = os.path.join(os.path.expanduser(settings["vault"]), relative)

    return folders


def open_session(model_name):
    # Without these, onnxruntime keeps growing its memory pool and fails after a couple of pictures.
    options = onnxruntime.SessionOptions()
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    return new_session(model_name, sess_opts=options)


def cutout_folder(campaign_name):
    folder = os.path.join(APP_FOLDER, "cutouts", campaign_name)
    os.makedirs(folder, exist_ok=True)
    return folder


def make_cutout(session, source_path, target_path):
    with Image.open(source_path) as source:
        result = remove(
            source.convert("RGB"),
            session=session,
            post_process_mask=True,
        )

    bounding_box = result.getbbox()

    if bounding_box:
        result = result.crop(bounding_box)

    result.save(target_path)


def cut_campaign(session, arguments, campaign_name, source_folder):
    """Cuts out one campaign's portraits. Returns the session (a fresh one if the old one had to be replaced)."""
    target_folder = cutout_folder(campaign_name)
    requested = arguments.names or sorted(
        file_name
        for file_name in os.listdir(source_folder)
        if file_name.lower().endswith(PORTRAIT_EXTENSIONS)
    )

    for file_name in requested:
        stem = os.path.splitext(file_name)[0]
        target_path = os.path.join(target_folder, stem + arguments.suffix + ".png")

        if not arguments.names and os.path.exists(target_path):
            continue

        source_path = os.path.join(source_folder, file_name)

        try:
            make_cutout(session, source_path, target_path)
        except Exception as error:
            # The model sometimes runs out of memory mid-batch; a fresh session usually gets past it.
            print("retrying", file_name, "after:", str(error)[:120])
            session = None
            gc.collect()
            session = open_session(arguments.model)

            try:
                make_cutout(session, source_path, target_path)
            except Exception as second_error:
                print("FAILED", file_name, str(second_error)[:120])
                sys.stdout.flush()
                continue

        print("made", os.path.basename(target_path))
        sys.stdout.flush()

    return session


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("campaign", nargs="?")
    parser.add_argument("names", nargs="*")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--suffix", default="")
    arguments = parser.parse_args()
    folders = portrait_folders()

    if arguments.campaign and arguments.campaign not in folders:
        raise SystemExit("No campaign called %r in campaigns.json." % arguments.campaign)

    session = open_session(arguments.model)
    campaign_names = [arguments.campaign] if arguments.campaign else list(folders)

    for campaign_name in campaign_names:
        source_folder = folders[campaign_name]

        if not os.path.isdir(source_folder):
            print("skipping %s: no folder %s" % (campaign_name, source_folder))
            continue

        print("== %s" % campaign_name)
        session = cut_campaign(session, arguments, campaign_name, source_folder)


if __name__ == "__main__":
    main()
