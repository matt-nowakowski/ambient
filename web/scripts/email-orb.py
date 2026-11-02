"""Renders the email header orb (APNG) exactly as the app's intro draws it.

src/intro/Intro.tsx: the B1 lockup orb is four sharp dots, 17px wide on a 14px
half-pitch (a 45px box), opacities 1, .5, .26, .38 clockwise from top-left.
Here it is scaled to a 20px box (40px at 2x).

Frame 1 is the finished mark, so clients that don't animate APNG (Outlook on
Windows, some webmail) show it as is. Clients that do play one soft bloom
behind it, like the intro's, once, ending on the same frame.

    python3 web/scripts/email-orb.py      (needs Pillow + numpy)

Writes web/public/email/orb.png (ink, with a faint white halo so it survives a
client forcing dark mode on the email) and orb-dark.png (white, with the
intro's glow).
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public" / "email"
BOX = 45  # intro: GAP * 2 + DOT
SIZE = 40  # 20 css px at 2x
SS = 8
FRAMES = 24
DOTS = [((-1, -1), 1.0), ((1, -1), 0.5), ((1, 1), 0.26), ((-1, 1), 0.38)]


def dots_alpha(s):
    k = s / BOX
    a = np.zeros((s, s), dtype=np.float32)
    for (dx, dy), op in DOTS:
        c = Image.new("L", (s, s), 0)
        cx, cy = s / 2 + dx * 14 * k, s / 2 + dy * 14 * k
        r = 17 * k / 2
        ImageDraw.Draw(c).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
        a = np.maximum(a, np.asarray(c, dtype=np.float32) * op)
    return a


def frame(bloom, ink, halo, glow):
    s = SIZE * SS
    pad = s  # room for the halo/bloom, cropped back to the box
    W = s + 2 * pad
    alpha = np.zeros((W, W), dtype=np.float32)
    alpha[pad:pad + s, pad:pad + s] = dots_alpha(s)
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    if bloom > 0:  # intro-bloom: radial white → soft blue → transparent, blurred
        y, x = np.mgrid[0:W, 0:W].astype(np.float32)
        d = np.sqrt((x - W / 2) ** 2 + (y - W / 2) ** 2) / (s * 0.9)
        b = np.clip(1 - d / 0.7, 0, 1) ** 1.5 * bloom * 0.55
        bl = Image.new("RGBA", (W, W), (*halo, 0))
        bl.putalpha(Image.fromarray((b * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(s * 0.08)))
        img.alpha_composite(bl)
    if glow:
        g = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(s * 0.12))
        gl = Image.new("RGBA", (W, W), (*halo, 0))
        gl.putalpha(g.point(lambda v: int(v * glow)))
        img.alpha_composite(gl)
    layer = Image.new("RGBA", (W, W), (*ink, 0))
    layer.putalpha(Image.fromarray(alpha.astype(np.uint8)))
    img.alpha_composite(layer)
    return img.crop((pad, pad, pad + s, pad + s)).resize((SIZE, SIZE), Image.LANCZOS)


def write(name, ink, halo, glow):
    blooms = [0] + [math.sin(math.pi * i / (FRAMES - 2)) for i in range(FRAMES - 1)] + [0]
    frames = [frame(b, ink, halo, glow) for b in blooms]
    path = OUT / name
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=[900] + [70] * (len(frames) - 2) + [1000],
                   loop=1, disposal=1, blend=0, optimize=True)
    print(f"{path.name}: {path.stat().st_size // 1024} KB, {len(frames)} frames")


OUT.mkdir(parents=True, exist_ok=True)
write("orb.png", (10, 10, 12), (255, 255, 255), 0.9)
write("orb-dark.png", (250, 250, 250), (150, 170, 220), 0.35)
