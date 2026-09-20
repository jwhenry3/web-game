"""Extract MapleStory face sprites from maplestory.io for the paperdoll.

Pulls the `default` emotion frame for a curated set of face item ids and
writes each transparent sprite to tools/faces/ms<N>.png plus a manifest
with the sprite origin (needed to anchor the face on our head).

NOTE: these are Nexon assets — dev/reference placeholders, not shippable.
"""
import base64
import io
import json
import os
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACE_DIR = os.path.join(ROOT, "tools", "faces")
MANIFEST = os.path.join(FACE_DIR, "manifest.json")

API = "https://maplestory.io/api/GMS/270/item/{id}"
UA = {"User-Agent": "Mozilla/5.0"}

# Curated set — distinct silhouettes/expressions across the male (20xxx)
# and female (21xxx) series, base (black) eye color.
FACES = {
    "ms1":  20000,  # Defiant Face
    "ms2":  20005,  # Alert Face
    "ms3":  20022,  # Child's Play
    "ms4":  20026,  # Shuteye
    "ms5":  20033,  # Innocent Gaze
    "ms6":  20062,  # Sharp Eyes
    "ms7":  20080,  # Starlight Eyes Face
    "ms8":  20085,  # Composed Face
    "ms9":  21000,  # Defiant Face (female)
    "ms10": 21021,  # Compassion Look
    "ms11": 21045,  # Existentially Tired Face
    "ms12": 21052,  # Starling Face
    "ms13": 21080,  # Worried Face
    "ms14": 21095,  # Exceptional Explorer Face
}


def fetch_frame(item_id, emotion="default"):
    req = urllib.request.Request(API.format(id=item_id), headers=UA)
    book = json.load(urllib.request.urlopen(req))["frameBooks"][emotion]
    fx = book["frames"][0]["effects"]["face"]
    img = Image.open(io.BytesIO(base64.b64decode(fx["image"]))).convert("RGBA")
    return img, fx["origin"]


def main():
    os.makedirs(FACE_DIR, exist_ok=True)
    manifest = {}
    for key, item_id in FACES.items():
        img, origin = fetch_frame(item_id)
        img.save(os.path.join(FACE_DIR, f"{key}.png"))
        manifest[key] = {"itemId": item_id, "origin": origin,
                         "size": list(img.size)}
        print(key, item_id, img.size, origin)
    json.dump(manifest, open(MANIFEST, "w"), indent=1)


if __name__ == "__main__":
    main()
