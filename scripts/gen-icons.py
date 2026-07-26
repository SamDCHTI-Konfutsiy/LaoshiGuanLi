"""
Generates the EMS monogram app icons from brand tokens defined in
src/index.css (--color-steel-500, --color-paper). Run again only if the
brand mark changes: `python3 scripts/gen-icons.py`.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

STEEL = (52, 84, 140, 255)   # --color-steel-500
PAPER = (246, 247, 249, 255)  # --color-paper
FONT_PATH = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)


def draw_mark(size: int, *, safe_zone: float, corner_ratio: float | None) -> Image.Image:
    """safe_zone: fraction of canvas the glyph may occupy (1.0 = full bleed).
    corner_ratio: rounded-corner radius as a fraction of size, or None for a
    hard square (used for maskable/apple-touch where the OS applies its own mask)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if corner_ratio is None:
        draw.rectangle([0, 0, size, size], fill=STEEL)
    else:
        draw.rounded_rectangle([0, 0, size, size], radius=int(size * corner_ratio), fill=STEEL)

    glyph = "E"
    font_size = int(size * safe_zone * 0.62)
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = draw.textbbox((0, 0), glyph, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        (size / 2 - w / 2 - bbox[0], size / 2 - h / 2 - bbox[1]),
        glyph,
        font=font,
        fill=PAPER,
    )
    return img


# Standard "any" purpose icons: rounded, slight inset so OS shape masks don't clip the glyph.
draw_mark(192, safe_zone=0.72, corner_ratio=0.22).save(OUT / "icon-192.png")
draw_mark(512, safe_zone=0.72, corner_ratio=0.22).save(OUT / "icon-512.png")

# Maskable: full-bleed background, glyph kept inside the ~80% safe-zone circle.
draw_mark(512, safe_zone=0.55, corner_ratio=None).save(OUT / "icon-maskable-512.png")

# Apple touch icon: iOS applies its own rounding, so ship a hard square.
draw_mark(180, safe_zone=0.62, corner_ratio=None).save(OUT / "apple-touch-icon.png")

# Favicon.
draw_mark(48, safe_zone=0.68, corner_ratio=0.22).save(OUT / "favicon.png")

print("Icons written to", OUT)
