"""Contact sheet of the campaign stills: a row per concept and theme, its PNGs side by side.

python3 scripts/contact-sheet.py out/campaign  ->  out/campaign/contact-sheet.png
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CONCEPTS = ["nudge", "language", "ask", "notes", "remind", "free"]
FORMATS = ["story", "feed", "x", "linkedin", "web", "email"]
ROW_H = 260
GAP = 16
LABEL = 34

root = Path(sys.argv[1])
rows = []
for c in CONCEPTS:
    for t, label in (("", c), ("-dark", f"{c} · dark")):
        files = [p for p in (root / c / f"{f}{t}.png" for f in FORMATS) if p.exists()]
        if files:
            rows.append((label, files))

def font(size):
    for p in ("/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()

thumbs = []
width = 0
for c, files in rows:
    ims = []
    for p in files:
        im = Image.open(p).convert("RGB")
        im.thumbnail((10_000, ROW_H), Image.LANCZOS)
        ims.append((p.stem, im))
    w = sum(im.width for _, im in ims) + GAP * (len(ims) + 1)
    width = max(width, w)
    thumbs.append((c, ims))

height = sum(ROW_H + LABEL * 2 + GAP for _ in thumbs) + GAP
sheet = Image.new("RGB", (width, height), (34, 34, 38))
d = ImageDraw.Draw(sheet)
big, small = font(26), font(16)
y = GAP
for c, ims in thumbs:
    d.text((GAP, y), c, fill=(240, 240, 240), font=big)
    y += LABEL
    x = GAP
    for name, im in ims:
        sheet.paste(im, (x, y))
        d.text((x, y + ROW_H + 6), name, fill=(170, 170, 176), font=small)
        x += im.width + GAP
    y += ROW_H + LABEL + GAP

out = root / "contact-sheet.png"
sheet.save(out, optimize=True)
print(f"{out}  {out.stat().st_size / 1e6:.2f} MB  {sheet.width}x{sheet.height}")
