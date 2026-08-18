# Art

- `cards/<deckKey>/<Card_Name>.png` — one illustration per unique card (62 total)
- `factions/<deckKey>.png` — faction key art for the deck picker (4 total)

Deck keys: `latency`, `hallucination`, `injection`, `techdebt`.

Filenames are derived from card names by `scripts/sync-cards.py` (`art_slug`).
Do not rename art without updating that convention or the card `name` in `data/cards.json`.
