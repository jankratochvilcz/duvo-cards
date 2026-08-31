---
name: generate-print-cards
description: >-
  Generate print-ready SHIP IT physical card fronts/backs from data/cards.json
  and art/cards assets using the locked v8a quiet-monument design. Use when
  regenerating print cards, changing print layout, updating card text for print,
  or when the user asks for print-ready / physical / poker card artwork.
---

# Generate print cards

## Command

```bash
python3 -m venv .venv-print && .venv-print/bin/pip install Pillow
.venv-print/bin/python scripts/generate-print-cards.py
# optional: --deck latency | --name "The Jailbreak" | --back-only
```

Outputs:
- `art/print/generated/card-back.png`
- `art/print/generated/fronts/<deckKey>/<Art_Slug>.png`

Source of truth for names/stats/rules/flavor/art paths: `data/cards.json`.
Visual reference: `art/print/fronts/_reference-v8a.png`.
Locked back source: `art/print/backs/card-back.png`.

## Locked design (v8a)

Quiet monument layout inspired by the Tokyo mono card back — negative space, hairline frame, high legibility.

### Card geometry
- Poker **2.5″ × 3.5″** at **450 DPI** → **1125 × 1575**
- **Rounded corners** (~0.12″ radius) are part of the design
- **Safe margin ~5.5%** inset — no UI in corner fillets (CYCLE, AGENT, text must clear physical cuts)
- Outer **single hairline** follows the rounded silhouette

### Back
- Monochrome black / white / gray only
- Small **B&W Duvo symbol** (no ring, no wordmark) in the upper field
- Tokyo-density night skyline in the lower portion
- No “SHIP IT”, no bezels, no gold/green accents
- Ref logo: `art/print/refs/duvo-symbol-bw.png`

### Front — Agents (`type: process`)
1. Upper ~56%: card art, soft fade into black plate
2. Top-left **CYCLE** badge: **solid faction-color fill**, clipped/chamfered stamp, white `CYCLE` label, **small** white digit (must not dominate)
3. Top-right tracked-out type: `AGENT`
4. Title: uppercase condensed industrial (DIN Condensed Bold) — white
5. Faction **whisper**: lowercase, tracked, muted — de-emphasized (not a bright banner)
6. Airy gap → **POWER** / **STABILITY** plates (full words, single bold stroke, chamfered)
7. Airy gap → rules (white sans)
8. Flavor (muted italic)

### Front — Overclocks (`type: patch`)
- No CYCLE badge, no POWER/STABILITY
- Type label `OVERCLOCK`
- Same title / whisper / rules / flavor rhythm with extra negative space

### Faction accents
| deckKey | whisper label | color |
|---|---|---|
| `latency` | latency | `#39FF88` |
| `hallucination` | hallucination | `#FF3355` |
| `injection` | prompt injection | `#2F80FF` |
| `techdebt` | technical debt | `#B8C0C8` |

### Language choices (locked)
- Deploy gate number label = **CYCLE** (not Cost / Deploy)
- Stats = full words **POWER** / **STABILITY** (never PWR/STB)
- No Duvo logo on fronts

## When regenerating
1. Edit `data/cards.json` (and art under `art/cards/`) as needed
2. Run `scripts/generate-print-cards.py`
3. Spot-check one Agent + one Overclock per faction against `_reference-v8a.png`
4. Do not reintroduce ornate bezels, yellow Duvo marks on fronts, or large CYCLE digits

## Do not
- Commit `.venv-print/`
- Invent card text — always read JSON
- Image-gen individual production fronts (compositor keeps type/stats accurate)
