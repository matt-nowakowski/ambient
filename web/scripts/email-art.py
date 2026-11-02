"""Renders the email artwork into web/public/email/ (needs Pillow + numpy).

    python3 web/scripts/email-art.py

Colours are the website's own (app/globals.css .ambient-backdrop): two big
blurred radial lights, --ambient-a (cool blue) top-left and --ambient-b (warm
peach) bottom-right, on the page background. Nothing else, no violet.

- hero-<name>.jpg / hero-<name>-dark.jpg   1200x480 (2x of 600x240): the
  middle band of a 1440x900 app window's backdrop (exact geometry, see app_backdrop),
  in light and dark, with the B1 orb as the app's intro draws it and a faint
  line motif per email. The email swaps them by
  prefers-color-scheme where the client supports it.
- card.jpg / card-dark.jpg   the license card face: the app's frosted
  glass-strong surface with its faint iridescent foil and glare
  (src/components/account/LicenseCard.tsx, src/styles/glass.css).
- icon-<name>.png / icon-<name>-dark.png   96x96 (2x of 48): line glyphs on a
  rounded tile. Light: ink on near-white lit by the light-mode lights, hairline
  rim. Dark: white on ink lit by the dark-mode lights. Swapped like the heroes.
- mark.png / mark-dark.png   64x64 (2x of 32): the intro's dots on the same tiles.
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public" / "email"
OUT.mkdir(parents=True, exist_ok=True)

# app/globals.css
LIGHT = {"bg": (245, 245, 247), "a": ((186, 204, 236), 0.55), "b": ((236, 214, 204), 0.45)}
DARK = {"bg": (11, 11, 13), "a": ((64, 84, 140), 0.32), "b": ((120, 72, 64), 0.22)}
INK = np.array([11, 11, 14], dtype=np.float32)


def blob(w, h, cx, cy, rx, ry):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
    return np.exp(-d * 1.6)


def gauss(arr, sigma):
    """Separable Gaussian blur (float), like CSS blur(sigma)."""
    r = int(sigma * 3)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    pad = np.pad(arr, r, mode="edge")
    tmp = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 1, pad)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 0, tmp)


def app_backdrop(theme, win=(1440, 900), slice_h=576, out=(1200, 480), seed=0, y0=None):
    """A slice of the app window's backdrop, exactly as .app-backdrop / .ambient-backdrop
    paint it: two 70vmax circles blurred 80px, each radial-gradient(circle, colour,
    transparent 65%) (a circle sized to the farthest corner of its 70vmax box);
    --ambient-a at top -30vmax / left -10vmax, --ambient-b at bottom -35vmax /
    right -20vmax. Rendered for a 1440x900 window; the hero is its middle band."""
    W, H = win
    vmax = max(W, H)
    y0 = (H - slice_h) / 2 if y0 is None else y0  # the window's middle band: both lights show
    box = 0.7 * vmax
    fade = 0.65 * (box / 2) * math.sqrt(2)  # 65% of the farthest-corner radius
    centres = {
        "a": (-0.10 * vmax + box / 2, -0.30 * vmax + box / 2 - y0),
        "b": (W + 0.20 * vmax - box / 2, H + 0.35 * vmax - box / 2 - y0),
    }
    y, x = np.mgrid[0:slice_h, 0:W].astype(np.float32)
    img = np.tile(np.array(theme["bg"], dtype=np.float32), (slice_h, W, 1))
    for key in ("a", "b"):
        color, alpha = theme[key]
        cx, cy = centres[key]
        a = np.clip(1 - np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / fade, 0, 1) * alpha
        # blur(80px) on the element, computed at quarter resolution (the field is
        # smooth), padded so the blur sees the light beyond the slice edge.
        q, pad = 4, 320
        yy, xx = np.mgrid[-pad:slice_h + pad:q, -pad:W + pad:q].astype(np.float32)
        big = np.clip(1 - np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / fade, 0, 1) * alpha
        big = gauss(big, 80 / q)
        up = np.asarray(Image.fromarray(big.astype(np.float32), "F").resize(((W + 2 * pad), (slice_h + 2 * pad)), Image.BILINEAR))
        a = up[pad:pad + slice_h, pad:pad + W]
        a = a[..., None]
        img = img * (1 - a) + np.array(color, dtype=np.float32) * a
    rng = np.random.default_rng(seed)
    img += rng.normal(0, 1.2, img.shape).astype(np.float32)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    return im.resize(out, Image.LANCZOS)


def site_lights(w, h, theme, a_pos, b_pos, seed=0):
    """Two lights placed freely (for the small icon tiles)."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    img = np.tile(np.array(theme["bg"], dtype=np.float32), (h, w, 1))
    for (color, alpha), (cx, cy, d) in ((theme["a"], a_pos), (theme["b"], b_pos)):
        r = d * w / 2
        dist = np.sqrt((x - cx * w) ** 2 + (y - cy * h) ** 2) / r
        a = np.clip(1 - dist / 0.65, 0, 1) * alpha
        a_img = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(w * 0.08))
        a = np.asarray(a_img, dtype=np.float32)[..., None] / 255
        img = img * (1 - a) + np.array(color, dtype=np.float32) * a
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


def aurora(w, h, lights, seed=0):
    img = np.tile(INK, (h, w, 1))
    for color, cx, cy, rx, ry, strength in lights:
        a = blob(w, h, cx * w, cy * h, rx * w, ry * h)[..., None] * strength
        img = img * (1 - a) + color * a
    # fine film grain keeps big gradients from banding (and compresses fine as JPEG)
    rng = np.random.default_rng(seed)
    img += rng.normal(0, 2.2, img.shape).astype(np.float32)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


FOCUS = [1, 0.5, 0.26, 0.38]  # static pose of the mark


def draw_orb(base, cx, cy, size, alphas=FOCUS, glow=True, color=(246, 246, 250), halo=(205, 214, 255)):
    """The Lens orb: four soft circles, top-left in focus; light on dark."""
    w, h = base.size
    k = size / 28
    alpha = np.zeros((h, w), dtype=np.float32)
    corners = [(-4.5, -4.5), (4.5, -4.5), (4.5, 4.5), (-4.5, 4.5)]
    for (ox, oy), a in zip(corners, alphas):
        r = 3 * k * (1 + (1 - a) * 0.12)
        c = Image.new("L", (w, h), 0)
        ImageDraw.Draw(c).ellipse([cx + ox * k - r, cy + oy * k - r, cx + ox * k + r, cy + oy * k + r], fill=255)
        blur = (1 - a) * 2 * k * 0.55
        if blur > 0.3:
            c = c.filter(ImageFilter.GaussianBlur(blur))
        alpha = np.maximum(alpha, np.asarray(c, dtype=np.float32) * a)
    if glow:
        g = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(size * 0.3))
        halo = Image.new("RGBA", (w, h), (*halo, 0))
        halo.putalpha(g.point(lambda v: int(v * 0.6)))
        base.alpha_composite(halo)
    layer = Image.new("RGBA", (w, h), (*color, 0))
    layer.putalpha(Image.fromarray(np.clip(alpha, 0, 255).astype(np.uint8)))
    base.alpha_composite(layer)


def draw_dots(base, cx, cy, scale, ink, glow):
    """The B1 lockup orb as the app's intro draws it: four sharp dots (17px on a
    14px half-pitch), opacities 1, .5, .26, .38 clockwise from top-left."""
    w, h = base.size
    dot, gap = 17 * scale, 14 * scale
    alpha = np.zeros((h, w), dtype=np.float32)
    for (dx, dy), a in zip([(-1, -1), (1, -1), (1, 1), (-1, 1)], [1, 0.5, 0.26, 0.38]):
        c = Image.new("L", (w, h), 0)
        x0, y0 = cx + dx * gap - dot / 2, cy + dy * gap - dot / 2
        ImageDraw.Draw(c).ellipse([x0, y0, x0 + dot, y0 + dot], fill=255)
        alpha = np.maximum(alpha, np.asarray(c, dtype=np.float32) * a)
    if glow:  # box-shadow: 0 0 16px rgba(255,255,255,.22)
        g = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(16 * scale * 0.6))
        halo = Image.new("RGBA", (w, h), (255, 255, 255, 0))
        halo.putalpha(g.point(lambda v: int(v * 0.5)))
        base.alpha_composite(halo)
    layer = Image.new("RGBA", (w, h), (*ink, 0))
    layer.putalpha(Image.fromarray(np.clip(alpha, 0, 255).astype(np.uint8)))
    base.alpha_composite(layer)


def glyph_layer(w, h, fn, alpha):
    g = Image.new("L", (w, h), 0)
    fn(ImageDraw.Draw(g))
    return g.point(lambda v: int(v * alpha))


def motif(name, w, h):
    """A faint, large line motif per email, behind the orb."""
    lw = 3

    def waves(d):  # meetings: a voice waveform across the banner
        for i in range(0, w, 14):
            amp = (math.sin(i / 37) * 0.5 + math.sin(i / 13) * 0.3 + 0.9) * h * 0.11
            d.line([(i, h * 0.5 - amp), (i, h * 0.5 + amp)], fill=255, width=lw + 2)

    def rings(d):  # ask / confirm: ripples from the orb
        for r in range(110, 760, 70):
            d.ellipse([w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r], outline=255, width=lw)

    def arc(d):  # cancel / ended: a horizon
        d.arc([-w * 0.2, h * 0.62, w * 1.2, h * 2.2], 180, 360, fill=255, width=lw)
        d.arc([-w * 0.1, h * 0.72, w * 1.1, h * 2.4], 180, 360, fill=255, width=lw)

    def grid(d):  # plan change: a stepped grid
        for x in range(0, w, 60):
            d.line([(x, 0), (x, h)], fill=255, width=1)
        for y in range(0, h, 60):
            d.line([(0, y), (w, y)], fill=255, width=1)

    return {"meetings": (waves, 0.10), "ask": (rings, 0.07), "confirm": (rings, 0.06), "cancel": (arc, 0.10),
            "ended": (arc, 0.08), "plan": (grid, 0.06), "winback": (rings, 0.05)}.get(name)


# name: light a (cx, cy, diameter in widths), light b, orb pose
P_FOCUS = FOCUS
HEROES = {
    "welcome": ((0.22, -0.25, 1.15), (0.9, 1.35, 1.15), FOCUS),
    "plan": ((0.6, -0.3, 1.2), (0.15, 1.3, 1.0), [0.5, 1, 0.38, 0.26]),
    "cancel": ((0.85, -0.2, 1.0), (0.3, 1.25, 1.2), [0.38, 0.26, 0.5, 1]),
    "ended": ((0.1, -0.3, 0.95), (0.55, 1.3, 1.3), [0.26, 0.38, 1, 0.5]),
    "confirm": ((0.5, -0.35, 1.3), (0.95, 1.3, 0.9), FOCUS),
    "winback": ((0.85, -0.25, 1.1), (0.12, 1.3, 1.1), [0.5, 1, 0.38, 0.26]),
    "ask": ((0.3, -0.2, 1.25), (0.95, 1.4, 0.95), FOCUS),
    "meetings": ((0.15, -0.25, 1.05), (0.8, 1.25, 1.15), [0.38, 1, 0.5, 0.26]),
    "note": ((0.2, -0.3, 1.1), (0.85, 1.35, 1.1), FOCUS),
}


def hero(name, a_pos, b_pos, alphas):
    W, H = 1200, 480
    out = []
    for theme, suffix, ink, motif_rgb, motif_scale in (
        (LIGHT, "", (10, 10, 12), (10, 10, 12), 0.5),
        (DARK, "-dark", (250, 250, 250), (235, 238, 255), 0.9),
    ):
        img = app_backdrop(theme, seed=hash(name) % 1000).convert("RGBA")
        m = motif(name, W, H)
        if m:
            fn, a = m
            g = glyph_layer(W, H, fn, a * motif_scale)
            img.alpha_composite(Image.merge("RGBA", (*Image.new("RGB", (W, H), motif_rgb).split(), g)))
        draw_dots(img, W * 0.5, H * 0.5, 2.6, ink, glow=suffix == "-dark")
        path = OUT / f"hero-{name}{suffix}.jpg"
        img.convert("RGB").save(path, "JPEG", quality=88, optimize=True, progressive=True)
        out.append(path)
    return out


def card():
    """The license card face: glass-strong, faint conic foil fading toward the
    bottom (mask 160deg, 20% → 85%), and a soft glare top-left."""
    W, H = 1040, 440
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    ang = (np.degrees(np.arctan2(y - H * 0.2, x - W * 0.3)) + 360) % 360 / 360
    stops = np.array([(255, 143, 177), (255, 213, 122), (143, 240, 200), (143, 199, 255), (199, 155, 255), (255, 143, 177)], dtype=np.float32)
    idx = ang * 5
    i0 = np.floor(idx).astype(int)
    t = (idx - i0)[..., None]
    foil = stops[i0] * (1 - t) + stops[np.minimum(i0 + 1, 5)] * t
    # mask: linear-gradient(160deg, #000 20%, transparent 85%)
    th = math.radians(160)
    dx, dy = math.sin(th), -math.cos(th)
    proj = ((x / W - 0.5) * dx + (y / H - 0.5) * dy)
    span = abs(dx) * 0.5 + abs(dy) * 0.5
    p = (proj + span) / (2 * span)
    mask = np.clip((0.85 - p) / 0.65, 0, 1)[..., None]
    out = []
    for suffix, base, opacity, glare_a in (("", (255, 255, 255), 0.14, 0.55), ("-dark", (36, 36, 40), 0.09, 0.12)):
        img = np.tile(np.array(base, dtype=np.float32), (H, W, 1))
        a = mask * opacity
        img = img * (1 - a) + foil * a
        # glare: radial-gradient(420px circle at ~30% 20%, glare, transparent 45%)
        d = np.sqrt((x - W * 0.3) ** 2 + (y - H * 0.2) ** 2) / (420 * 2)
        g = (np.clip(1 - d / 0.45, 0, 1) * glare_a)[..., None]
        img = img * (1 - g) + 255 * g
        path = OUT / f"card{suffix}.jpg"
        Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").save(path, "JPEG", quality=88, optimize=True, progressive=True)
        out.append(path)
    return out


# ── Icons: 96px, white strokes on an ink tile ─────────────────────────────
S = 4  # supersample
T = 96 * S


def tile(dark=True):
    """A rounded icon tile. Dark: ink lit by the dark-mode lights, white rim.
    Light: near-white lit by the light-mode lights, ink hairline rim."""
    if dark:
        theme, rim_rgb, rim_a = {"bg": (18, 18, 22), "a": ((64, 84, 140), 0.55), "b": ((120, 72, 64), 0.4)}, (255, 255, 255), 70
    else:
        theme, rim_rgb, rim_a = {"bg": (252, 252, 253), "a": ((186, 204, 236), 0.55), "b": ((236, 214, 204), 0.45)}, (0, 0, 0), 26
    t = site_lights(T, T, theme, (0.1, 0.0, 1.4), (1.0, 1.05, 1.2), seed=7).convert("RGBA")
    mask = Image.new("L", (T, T), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, T - 1, T - 1], radius=int(T * 0.26), fill=255)
    out = Image.new("RGBA", (T, T), (0, 0, 0, 0))
    out.paste(t, (0, 0), mask)
    rim = Image.new("L", (T, T), 0)
    ImageDraw.Draw(rim).rounded_rectangle([1, 1, T - 2, T - 2], radius=int(T * 0.26), outline=rim_a, width=S * 2)
    out.alpha_composite(Image.merge("RGBA", (*Image.new("RGB", (T, T), rim_rgb).split(), rim)))
    return out


W_ = 3.2 * S  # stroke width at 96px scale ~3.2px → 1.6px at 1x


def P(v):  # 0..24 icon grid → pixels in tile (centred 48% of tile)
    return T * 0.26 + v / 24 * T * 0.48


def icon_key(d):
    d.ellipse([P(3), P(8), P(11), P(16)], outline=255, width=int(W_))
    d.line([(P(11), P(12)), (P(21), P(12))], fill=255, width=int(W_))
    d.line([(P(17), P(12)), (P(17), P(15.5))], fill=255, width=int(W_))
    d.line([(P(20), P(12)), (P(20), P(15))], fill=255, width=int(W_))


def icon_sparkle(d):
    c = (P(12), P(12))
    pts = []
    for i in range(8):
        r = P(11) - P(0) if i % 2 == 0 else (P(3.2) - P(0))
        a = math.pi / 4 * i - math.pi / 2
        pts.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a)))
    d.polygon(pts, outline=255, width=int(W_))


def icon_mic(d):
    d.rounded_rectangle([P(9), P(3), P(15), P(14)], radius=int(P(3) - P(0)), outline=255, width=int(W_))
    d.arc([P(5), P(6), P(19), P(18)], 0, 180, fill=255, width=int(W_))
    d.line([(P(12), P(18)), (P(12), P(21))], fill=255, width=int(W_))


def icon_chat(d):
    d.rounded_rectangle([P(3), P(4), P(21), P(16)], radius=int(P(4) - P(0)), outline=255, width=int(W_))
    d.line([(P(8), P(16)), (P(6), P(20.5)), (P(12), P(16))], fill=255, width=int(W_), joint="curve")
    for x in (8, 12, 16):
        d.ellipse([P(x - 1.1), P(10 - 1.1), P(x + 1.1), P(10 + 1.1)], fill=255)


def icon_wave(d):
    for x, hh in zip((4, 8, 12, 16, 20), (3, 7, 10, 6, 3)):
        d.line([(P(x), P(12 - hh)), (P(x), P(12 + hh))], fill=255, width=int(W_))


def icon_calendar(d):
    d.rounded_rectangle([P(3), P(5), P(21), P(21)], radius=int(P(3) - P(0)), outline=255, width=int(W_))
    d.line([(P(3), P(10)), (P(21), P(10))], fill=255, width=int(W_))
    for x in (8, 16):
        d.line([(P(x), P(3)), (P(x), P(7))], fill=255, width=int(W_))
    d.ellipse([P(14), P(14), P(17), P(17)], fill=255)


def icon_shield(d):
    pts = [(P(12), P(2.5)), (P(20), P(5.5)), (P(19.5), P(13)), (P(12), P(21.5)), (P(4.5), P(13)), (P(4), P(5.5))]
    d.line(pts + [pts[0]], fill=255, width=int(W_), joint="curve")
    d.line([(P(8.5), P(12)), (P(11), P(14.5)), (P(15.5), P(9.5))], fill=255, width=int(W_), joint="curve")


def icon_refresh(d):
    d.arc([P(4), P(4), P(20), P(20)], 210, 500, fill=255, width=int(W_))
    d.line([(P(19.5), P(3.5)), (P(19.8), P(8.6)), (P(14.8), P(8.4))], fill=255, width=int(W_), joint="curve")


def icon_heart(d):
    pts = []
    for t in np.linspace(0, 2 * math.pi, 120):
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((P(12 + x * 0.56), P(12.5 + y * 0.56)))
    d.line(pts, fill=255, width=int(W_), joint="curve")


def icon_download(d):
    d.line([(P(12), P(3)), (P(12), P(15))], fill=255, width=int(W_))
    d.line([(P(7), P(10.5)), (P(12), P(15.5)), (P(17), P(10.5))], fill=255, width=int(W_), joint="curve")
    d.line([(P(4), P(20)), (P(20), P(20))], fill=255, width=int(W_))


def icon_mail(d):
    d.rounded_rectangle([P(3), P(5), P(21), P(19)], radius=int(P(2.5) - P(0)), outline=255, width=int(W_))
    d.line([(P(4), P(7)), (P(12), P(13)), (P(20), P(7))], fill=255, width=int(W_), joint="curve")


def icon_book(d):
    d.line([(P(12), P(6)), (P(12), P(20))], fill=255, width=int(W_))
    d.line([(P(12), P(6)), (P(8), P(4.5)), (P(3), P(4.5)), (P(3), P(18.5)), (P(8), P(18.5)), (P(12), P(20)), (P(16), P(18.5)), (P(21), P(18.5)), (P(21), P(4.5)), (P(16), P(4.5)), (P(12), P(6))], fill=255, width=int(W_), joint="curve")


ICONS = {"key": icon_key, "sparkle": icon_sparkle, "mic": icon_mic, "ask": icon_chat, "wave": icon_wave, "calendar": icon_calendar,
         "shield": icon_shield, "refresh": icon_refresh, "heart": icon_heart, "download": icon_download, "mail": icon_mail, "book": icon_book}


def icon(name, fn):
    """icon-<name>.png (light tile, ink glyph) and icon-<name>-dark.png (dark tile, white glyph)."""
    for dark, suffix, ink in ((False, "", (24, 24, 28)), (True, "-dark", (255, 255, 255))):
        base = tile(dark)
        g = Image.new("L", (T, T), 0)
        fn(ImageDraw.Draw(g))
        base.alpha_composite(Image.merge("RGBA", (*Image.new("RGB", (T, T), ink).split(), g)))
        base.resize((96, 96), Image.LANCZOS).save(OUT / f"icon-{name}{suffix}.png", optimize=True)


def mark():
    """mark.png (light tile, ink dots) and mark-dark.png (dark tile, white dots)."""
    for dark, suffix, ink in ((False, "", (10, 10, 12)), (True, "-dark", (250, 250, 250))):
        base = tile(dark)
        draw_dots(base, T / 2, T / 2, T * 0.55 / 45, ink, glow=False)
        base.resize((64, 64), Image.LANCZOS).save(OUT / f"mark{suffix}.png", optimize=True)


if __name__ == "__main__":
    for old in OUT.glob("hero-*.jpg"):
        old.unlink()
    for n, (ap, bp, alphas) in HEROES.items():
        for p in hero(n, ap, bp, alphas):
            print(f"{p.name}: {p.stat().st_size // 1024} KB")
    for p in card():
        print(f"{p.name}: {p.stat().st_size // 1024} KB")
    for n, fn in ICONS.items():
        icon(n, fn)
    mark()
    total = sum(f.stat().st_size for f in OUT.glob("icon-*.png"))  # both variants
    print(f"{len(ICONS)} icons, {total // 1024} KB total; mark.png")
