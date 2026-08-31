# Print cards

Physical SHIP IT cards — poker **2.5″ × 3.5″**, quiet monument design (**v8a**).

## Locked assets

| Path | Role |
|---|---|
| `backs/card-back.png` | Final Tokyo mono back (B&W Duvo mark) |
| `fronts/_reference-v8a.png` | Locked front layout reference |
| `refs/duvo-symbol-bw.png` | B&W Duvo symbol used on the back |
| `generated/` | Composited print outputs (regenerate via script) |

## Generate

```bash
python3 -m venv .venv-print && .venv-print/bin/pip install Pillow
.venv-print/bin/python scripts/generate-print-cards.py
```

Agent skill with the full design decision record: [`.cursor/skills/generate-print-cards/SKILL.md`](../../.cursor/skills/generate-print-cards/SKILL.md).

Outputs land in `generated/fronts/<deck>/` plus `generated/card-back.png` at **1125×1575** (450 DPI).
