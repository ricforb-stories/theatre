"""Make see-through cut-outs of NPC portraits and item pictures, so people can stand in front of a place on the
projector and items can float over it.

Cut-outs go to cutouts/<campaign>/<picture name>.png next to this script. The vault is only read, never written.
Each campaign's folders come from campaigns.json ("portrait_images", and "item_images" if set).

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

import numpy
import onnxruntime
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage

APP_FOLDER = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL = "birefnet-general"
PORTRAIT_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")


def picture_folders():
    """Each campaign's folders to cut out, from campaigns.json: the NPC portraits, and the item pictures if set."""
    with open(os.path.join(APP_FOLDER, "campaigns.json"), encoding="utf-8") as handle:
        data = json.load(handle)

    folders = {}

    for name, settings in (data.get("campaigns") or {}).items():

        if name.startswith("_") or not isinstance(settings, dict) or not settings.get("vault"):
            continue

        vault = os.path.expanduser(settings["vault"])
        portraits = settings.get("portrait_images") or os.path.join(settings.get("npc_notes") or "", "Images")
        folders[name] = [os.path.join(vault, portraits)]

        if settings.get("item_images"):
            folders[name].append(os.path.join(vault, settings["item_images"]))

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


def clean_light_background(source, alpha):
    """Portraits painted on white or cream paper leave a white rim and white brush strokes on the cut-out.
    This clears near-paper pixels at the outer edge (never deep inside, so white clothes and hair stay),
    fades pale edge pixels, and takes the paper colour out of the soft edge.
    source: the full portrait (RGB array); alpha: the full-size mask (0-255).
    Returns the cleaned RGBA array, or None when the background isn't light (nothing to do)."""
    frame = [source[:6], source[-6:], source[:, :6], source[:, -6:]]
    border = numpy.concatenate([part.reshape(-1, 3) for part in frame])
    paper = numpy.median(border, axis=0)

    if paper.mean() < 170:
        return None

    distance = numpy.sqrt(((source.astype(numpy.float32) - paper) ** 2).sum(axis=2))
    near_paper = distance < 50
    transparent = alpha < 128
    labels, _count = ndimage.label(near_paper | transparent, structure=numpy.ones((3, 3)))
    touching = numpy.unique(labels[transparent])
    touching = touching[touching > 0]
    from_edge = ndimage.distance_transform_edt(~transparent)
    outside = numpy.isin(labels, touching) & near_paper & (from_edge < 22)
    # Portraits often fade into the paper at the bottom: there, clear plain paper further in.
    figure_rows = numpy.nonzero((alpha >= 128).any(axis=1))[0]

    if len(figure_rows):
        bottom_start = figure_rows[-1] - int((figure_rows[-1] - figure_rows[0]) * 0.18)
        plain_paper = distance < 28
        paper_labels, _paper_count = ndimage.label(plain_paper | transparent, structure=numpy.ones((3, 3)))
        # plain paper reaching the transparent area or the picture's bottom edge is background
        seeds = transparent.copy()
        seeds[-3:, :] |= plain_paper[-3:, :]
        paper_touching = numpy.unique(paper_labels[seeds])
        paper_touching = paper_touching[paper_touching > 0]
        bottom_paper = numpy.isin(paper_labels, paper_touching) & plain_paper
        bottom_paper[:bottom_start] = False
        outside |= bottom_paper

    cleaned_alpha = alpha.astype(numpy.float32)
    cleaned_alpha[outside] = 0
    edge_band = ndimage.binary_dilation(cleaned_alpha < 128, iterations=6) & (cleaned_alpha > 0)
    paleness = numpy.clip((distance - 50) / (130 - 50), 0, 1)
    cleaned_alpha[edge_band] *= paleness[edge_band]
    cleaned_alpha = ndimage.minimum_filter(cleaned_alpha, size=3)
    cleaned_alpha = ndimage.gaussian_filter(cleaned_alpha, 0.6)
    coverage = cleaned_alpha / 255.0
    colour = source.astype(numpy.float32)
    soft = (coverage > 0.02) & (coverage < 0.98)
    unmixed = (colour - (1 - coverage[..., None]) * paper) / numpy.maximum(coverage[..., None], 0.02)
    colour[soft] = numpy.clip(unmixed[soft], 0, 255)
    return numpy.dstack([colour, cleaned_alpha]).astype(numpy.uint8)


def find_offset(source, cutout):
    """Where an existing (cropped) cut-out sits in its portrait: its solid pixels are the portrait's own colours."""
    solid = ndimage.binary_erosion(cutout[:, :, 3] == 255, iterations=6)
    rows, columns = numpy.nonzero(solid)

    if not len(rows):
        return None

    anchor_row = rows[len(rows) // 2]
    anchor_column = columns[len(rows) // 2]
    patch = cutout[anchor_row - 5:anchor_row + 6, anchor_column - 5:anchor_column + 6, :3]
    candidates = numpy.argwhere(numpy.all(source == cutout[anchor_row, anchor_column, :3], axis=2))

    for candidate_row, candidate_column in candidates:
        window = source[candidate_row - 5:candidate_row + 6, candidate_column - 5:candidate_column + 6]

        if candidate_row >= anchor_row and candidate_column >= anchor_column and numpy.array_equal(window, patch):
            return candidate_row - anchor_row, candidate_column - anchor_column

    return None


def reclean(source_path, target_path):
    """Applies the light-background clean-up to a cut-out made before it existed. Returns True if it changed."""
    with Image.open(source_path) as portrait:
        source = numpy.array(portrait.convert("RGB"))

    # Always start from the untouched original (kept aside the first time), so running this twice is harmless.
    campaign_folder = os.path.dirname(target_path)
    original_folder = os.path.join(os.path.dirname(campaign_folder), "_originals", os.path.basename(campaign_folder))
    original_path = os.path.join(original_folder, os.path.basename(target_path))

    if not os.path.exists(original_path):
        os.makedirs(original_folder, exist_ok=True)
        Image.open(target_path).save(original_path)

    cutout = numpy.array(Image.open(original_path).convert("RGBA"))
    offset = find_offset(source, cutout)

    if offset is None:
        return False

    top, left = offset
    full_alpha = numpy.zeros(source.shape[:2], numpy.uint8)
    full_alpha[top:top + cutout.shape[0], left:left + cutout.shape[1]] = cutout[:, :, 3]
    cleaned = clean_light_background(source, full_alpha)

    if cleaned is None:
        return False

    result = Image.fromarray(cleaned)
    result.crop(result.getbbox()).save(target_path)
    return True


def make_cutout(session, source_path, target_path):
    with Image.open(source_path) as source:
        rgb = source.convert("RGB")
        result = remove(
            rgb,
            session=session,
            post_process_mask=True,
        )

    cleaned = clean_light_background(numpy.array(rgb), numpy.array(result.getchannel("A")))

    if cleaned is not None:
        result = Image.fromarray(cleaned)

    bounding_box = result.getbbox()

    if bounding_box:
        result = result.crop(bounding_box)

    result.save(target_path)


def pictures_in(source_folders):
    """Every picture in the folders, by file name (the first folder wins if two hold the same name)."""
    pictures = {}

    for source_folder in source_folders:

        if not os.path.isdir(source_folder):
            continue

        for file_name in sorted(os.listdir(source_folder)):

            if file_name.lower().endswith(PORTRAIT_EXTENSIONS):
                pictures.setdefault(file_name, os.path.join(source_folder, file_name))

    return pictures


def cut_campaign(session, arguments, campaign_name, source_folders):
    """Cuts out one campaign's portraits and item pictures. Returns the session (a fresh one if the old one had to be replaced)."""
    target_folder = cutout_folder(campaign_name)
    pictures = pictures_in(source_folders)
    requested = arguments.names or sorted(pictures)

    for file_name in requested:
        stem = os.path.splitext(file_name)[0]
        target_path = os.path.join(target_folder, stem + arguments.suffix + ".png")

        if not arguments.names and os.path.exists(target_path):
            continue

        if file_name not in pictures:
            print("not found:", file_name)
            continue

        source_path = pictures[file_name]

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


def reclean_campaigns(arguments, folders):
    campaign_names = [arguments.campaign] if arguments.campaign else list(folders)

    for campaign_name in campaign_names:
        target_folder = cutout_folder(campaign_name)
        pictures = pictures_in(folders[campaign_name])
        sources = {os.path.splitext(name)[0]: name for name in pictures}
        changed = 0

        for cutout_name in sorted(os.listdir(target_folder)):
            stem = os.path.splitext(cutout_name)[0]

            if not cutout_name.endswith(".png") or stem not in sources:
                continue

            if arguments.names and sources[stem] not in arguments.names:
                continue

            if reclean(pictures[sources[stem]], os.path.join(target_folder, cutout_name)):
                changed += 1

        print("%s: cleaned %d cut-outs" % (campaign_name, changed))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("campaign", nargs="?")
    parser.add_argument("names", nargs="*")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--suffix", default="")
    parser.add_argument("--reclean", action="store_true", help="only clean up existing cut-outs from light backgrounds")
    arguments = parser.parse_args()
    folders = picture_folders()

    if arguments.campaign and arguments.campaign not in folders:
        raise SystemExit("No campaign called %r in campaigns.json." % arguments.campaign)

    if arguments.reclean:
        reclean_campaigns(arguments, folders)
        return

    session = open_session(arguments.model)
    campaign_names = [arguments.campaign] if arguments.campaign else list(folders)

    for campaign_name in campaign_names:
        source_folders = folders[campaign_name]

        for source_folder in source_folders:

            if not os.path.isdir(source_folder):
                print("skipping in %s: no folder %s" % (campaign_name, source_folder))

        print("== %s" % campaign_name)
        session = cut_campaign(session, arguments, campaign_name, source_folders)


if __name__ == "__main__":
    main()
