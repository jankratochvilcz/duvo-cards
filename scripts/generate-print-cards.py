#!/usr/bin/env python3
"""Generate print-ready SHIP IT card fronts (and optionally regenerate the back).

Design locked to art/print/fronts/_reference-v8a.png — quiet monument layout.
See .cursor/skills/generate-print-cards/SKILL.md for the decision record.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CARDS_JSON = ROOT / "data" / "cards.json"
OUT_FRONTS = ROOT / "art" / "print" / "generated" / "fronts"
OUT_BACK = ROOT / "art" / "print" / "generated" / "card-back.png"
REF_BACK = ROOT / "art" / "print" / "backs" / "card-back.png"
LOGO_BW = ROOT / "art" / "print" / "refs" / "duvo-symbol-bw.png"

# Poker 2.5" × 3.5" at 450 DPI (print-ready without enormous files)
DPI = 450
W = int(2.5 * DPI)  # 1125
H = int(3.5 * DPI)  # 1575
CORNER_R = int(0.12 * DPI)  # physical rounded-corner radius
SAFE = int(0.055 * W)  # ~5.5% outer margin — content stays inside corner cuts

FACTIONS = {
    "latency": {
        "label": "latency",
        "color": (57, 255, 136),  # #39FF88
        "name": "Latency",
    },
    "hallucination": {
        "label": "hallucination",
        "color": (255, 51, 85),  # #FF3355
        "name": "Hallucination",
    },
    "injection": {
        "label": "prompt injection",
        "color": (47, 128, 255),  # #2F80FF
        "name": "Prompt Injection",
    },
    "techdebt": {
        "label": "technical debt",
        "color": (184, 192, 200),  # #B8C0C8
        "name": "Technical Debt",
    },
}

TYPE_LABEL = {"process": "AGENT", "patch": "OVERCLOCK"}

# Fonts (macOS system — industrial condensed title matching v8a)
FONT_TITLE = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
FONT_BODY = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BODY_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_ITALIC = "/System/Library/Fonts/Supplemental/Arial Italic.ttf"
FONT_NARROW = "/System/Library/Fonts/Supplemental/Arial Narrow.ttf"
FONT_NARROW_BOLD = "/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def hex_rgb(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    return rgb


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def chamfer_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    fill=None,
    outline=None,
    width: int = 2,
    chamfer: int = 10,
) -> None:
    x0, y0, x1, y1 = box
    c = chamfer
    pts = [
        (x0 + c, y0),
        (x1 - c, y0),
        (x1, y0 + c),
        (x1, y1 - c),
        (x1 - c, y1),
        (x0 + c, y1),
        (x0, y1 - c),
        (x0, y0 + c),
    ]
    if fill is not None:
        draw.polygon(pts, fill=fill)
    if outline is not None:
        draw.line(pts + [pts[0]], fill=outline, width=width)


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=fnt)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def draw_centered(
    draw: ImageDraw.ImageDraw,
    text: str,
    cx: int,
    y: int,
    fnt: ImageFont.ImageFont,
    fill,
) -> int:
    tw, th = text_size(draw, text, fnt)
    draw.text((cx - tw // 2, y), text, font=fnt, fill=fill)
    return th


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont, max_w: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    cur = words[0]
    for w in words[1:]:
        trial = f"{cur} {w}"
        if text_size(draw, trial, fnt)[0] <= max_w:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def fit_cover(img: Image.Image, tw: int, th: int) -> Image.Image:
    src = img.convert("RGB")
    sw, sh = src.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def art_slug(name: str) -> str:
    """Match scripts/sync-cards.py convention."""
    s = name.replace(" ", "_").replace("'", "")
    s = re.sub(r"[^\w.\-]+", "", s, flags=re.UNICODE)
    return s


def render_front(card: dict, deck_key: str) -> Image.Image:
    faction = FACTIONS[deck_key]
    accent = faction["color"]
    is_agent = card["type"] == "process"

    canvas = Image.new("RGBA", (W, H), (8, 8, 10, 255))
    draw = ImageDraw.Draw(canvas)

    # --- Art window (upper ~56%) ---
    art_top = SAFE
    art_bottom = int(H * 0.56)
    art_box = (SAFE, art_top, W - SAFE, art_bottom)
    art_w = art_box[2] - art_box[0]
    art_h = art_box[3] - art_box[1]

    art_path = ROOT / card["art"]
    if not art_path.exists():
        raise FileNotFoundError(art_path)
    art = fit_cover(Image.open(art_path), art_w, art_h)
    canvas.paste(art, (art_box[0], art_box[1]))

    # Soft fade into black plate at bottom of art
    fade_h = int(art_h * 0.18)
    fade = Image.new("RGBA", (art_w, fade_h), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fade)
    for i in range(fade_h):
        a = int(255 * (i / max(1, fade_h - 1)) ** 1.4)
        fd.line([(0, i), (art_w, i)], fill=(8, 8, 10, a))
    canvas.alpha_composite(fade, (art_box[0], art_box[3] - fade_h))

    # --- CYCLE badge (agents only) ---
    if is_agent:
        badge_w, badge_h = int(W * 0.105), int(H * 0.085)
        bx0, by0 = SAFE + int(W * 0.01), SAFE + int(H * 0.012)
        bx1, by1 = bx0 + badge_w, by0 + badge_h
        chamfer_rect(draw, (bx0, by0, bx1, by1), fill=accent, chamfer=max(6, badge_w // 10))
        cycle_f = font(FONT_NARROW_BOLD, max(11, int(H * 0.014)))
        num_f = font(FONT_BODY_BOLD, max(18, int(H * 0.032)))  # deliberately modest digit
        cw, ch = text_size(draw, "CYCLE", cycle_f)
        draw.text(
            (bx0 + (badge_w - cw) // 2, by0 + int(badge_h * 0.12)),
            "CYCLE",
            font=cycle_f,
            fill=(255, 255, 255),
        )
        num = str(card["cost"])
        nw, nh = text_size(draw, num, num_f)
        draw.text(
            (bx0 + (badge_w - nw) // 2, by0 + int(badge_h * 0.42)),
            num,
            font=num_f,
            fill=(255, 255, 255),
        )

    # --- Type label top-right ---
    type_f = font(FONT_NARROW, max(12, int(H * 0.016)))
    type_text = TYPE_LABEL.get(card["type"], card["type"].upper())
    tw, th = text_size(draw, type_text, type_f)
    # tracked-out feel via letter spacing
    spaced = "  ".join(type_text)
    tw, th = text_size(draw, spaced, type_f)
    tx = W - SAFE - tw - int(W * 0.01)
    ty = SAFE + int(H * 0.02)
    draw.text((tx, ty), spaced, font=type_f, fill=(160, 165, 175))

    # --- Text plate ---
    cx = W // 2
    y = art_bottom + int(H * 0.028)

    # Title
    title = card["name"].upper()
    title_size = max(28, int(H * 0.042))
    title_f = font(FONT_TITLE, title_size)
    # Shrink title if too wide
    max_title_w = W - 2 * SAFE - int(W * 0.04)
    while text_size(draw, title, title_f)[0] > max_title_w and title_size > 18:
        title_size -= 1
        title_f = font(FONT_TITLE, title_size)
    th = draw_centered(draw, title, cx, y, title_f, (255, 255, 255))
    y += th + int(H * 0.012)

    # Whisper faction
    whisper_f = font(FONT_NARROW, max(11, int(H * 0.015)))
    whisper = "  ".join(faction["label"].lower())
    # muted accent — faction color at lower luminance for agents; keep readable
    muted = tuple(int(c * 0.55 + 90 * 0.45) for c in accent)
    if deck_key == "techdebt":
        muted = (140, 146, 154)
    wh = draw_centered(draw, whisper, cx, y, whisper_f, muted)
    y += wh + int(H * 0.032)  # airy gap before stats / rules

    text_max_w = W - 2 * SAFE - int(W * 0.08)

    if is_agent:
        # POWER / STABILITY plates — single bold border, full words
        gap = int(W * 0.03)
        plate_w = (text_max_w - gap) // 2
        plate_h = int(H * 0.078)
        px0 = (W - (2 * plate_w + gap)) // 2
        for i, (label, value) in enumerate(
            (("POWER", card["power"]), ("STABILITY", card["stability"]))
        ):
            x0 = px0 + i * (plate_w + gap)
            chamfer_rect(
                draw,
                (x0, y, x0 + plate_w, y + plate_h),
                outline=accent,
                width=max(2, int(H * 0.0025)),
                chamfer=max(8, plate_w // 14),
            )
            lab_f = font(FONT_NARROW, max(10, int(H * 0.013)))
            val_f = font(FONT_BODY_BOLD, max(22, int(H * 0.036)))
            lw, lh = text_size(draw, label, lab_f)
            draw.text(
                (x0 + (plate_w - lw) // 2, y + int(plate_h * 0.12)),
                label,
                font=lab_f,
                fill=(170, 175, 185),
            )
            vs = str(value)
            vw, vh = text_size(draw, vs, val_f)
            draw.text(
                (x0 + (plate_w - vw) // 2, y + int(plate_h * 0.42)),
                vs,
                font=val_f,
                fill=accent,
            )
        y += plate_h + int(H * 0.032)  # airy gap after stats

    # Rules
    rules = card.get("text") or ""
    if rules and rules != "—":
        rules_f = font(FONT_BODY, max(14, int(H * 0.019)))
        lines = wrap_text(draw, rules, rules_f, text_max_w)
        for line in lines:
            lh = draw_centered(draw, line, cx, y, rules_f, (235, 238, 242))
            y += lh + int(H * 0.006)
        y += int(H * 0.022)
    elif not is_agent:
        y += int(H * 0.01)

    # Flavor
    flavor = (card.get("flavor") or "").strip()
    if flavor:
        flavor_f = font(FONT_ITALIC, max(12, int(H * 0.016)))
        lines = wrap_text(draw, flavor, flavor_f, text_max_w)
        # Keep flavor above bottom safe margin
        bottom_limit = H - SAFE - int(H * 0.02)
        block_h = sum(text_size(draw, ln, flavor_f)[1] + int(H * 0.005) for ln in lines)
        if y + block_h > bottom_limit:
            y = max(y - int(H * 0.01), bottom_limit - block_h)
        for line in lines:
            lh = draw_centered(draw, line, cx, y, flavor_f, (120, 125, 135))
            y += lh + int(H * 0.005)

    # Outer hairline following rounded corners (inset slightly inside edge)
    inset = max(2, int(SAFE * 0.35))
    frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rounded_rectangle(
        (inset, inset, W - 1 - inset, H - 1 - inset),
        radius=max(1, CORNER_R - inset // 2),
        outline=(220, 225, 230, 220),
        width=max(2, int(H * 0.0018)),
    )
    canvas = Image.alpha_composite(canvas, frame)

    # Apply rounded card silhouette
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.paste(canvas, (0, 0))
    out.putalpha(rounded_mask((W, H), CORNER_R))
    return out.convert("RGB")


def render_back_from_locked() -> Image.Image:
    """Copy locked back to generated output (already final Tokyo mono design)."""
    src = REF_BACK
    if not src.exists():
        raise FileNotFoundError(src)
    img = Image.open(src).convert("RGBA")
    # Ensure size / rounded corners match fronts
    img = img.resize((W, H), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.paste(img, (0, 0))
    out.putalpha(rounded_mask((W, H), CORNER_R))
    return out.convert("RGB")


def load_cards() -> list[tuple[str, dict]]:
    data = json.loads(CARDS_JSON.read_text())
    items: list[tuple[str, dict]] = []
    for deck_key, cards in data.items():
        for card in cards:
            items.append((deck_key, card))
    return items


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deck", choices=list(FACTIONS), help="Only generate one deck")
    parser.add_argument("--name", help="Only generate one card name")
    parser.add_argument("--back-only", action="store_true")
    args = parser.parse_args()

    OUT_FRONTS.mkdir(parents=True, exist_ok=True)
    OUT_BACK.parent.mkdir(parents=True, exist_ok=True)

    if args.back_only:
        render_back_from_locked().save(OUT_BACK, "PNG", optimize=True, dpi=(DPI, DPI))
        print(f"wrote {OUT_BACK}")
        return

    items = load_cards()
    if args.deck:
        items = [(d, c) for d, c in items if d == args.deck]
    if args.name:
        items = [(d, c) for d, c in items if c["name"] == args.name]

    render_back_from_locked().save(OUT_BACK, "PNG", optimize=True, dpi=(DPI, DPI))
    print(f"wrote {OUT_BACK}")

    for deck_key, card in items:
        deck_dir = OUT_FRONTS / deck_key
        deck_dir.mkdir(parents=True, exist_ok=True)
        out = deck_dir / f"{art_slug(card['name'])}.png"
        render_front(card, deck_key).save(out, "PNG", optimize=True, dpi=(DPI, DPI))
        print(f"wrote {out.relative_to(ROOT)}")

    print(f"done — {len(items)} fronts")


if __name__ == "__main__":
    main()
