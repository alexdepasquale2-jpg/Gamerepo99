# M2 First Art Pass Implementation Plan

> Inline execution by Prism (executor).

**Goal:** Lock cozy-grit palette ramps, CC0 vendor packs, and Ashford half/half mockup by Fri Nov 6 08:00 America/New_York.

**Architecture:** Docs in `docs/art/`; CC0 zips under `assets/vendor/`; mockup composited in Python from real tiles with despair/alive palette remap; Phaser render later consumes warmth 0..1.

**Tech Stack:** Markdown, Python/PIL, curl downloads, openpyxl schedule.

## Global Constraints

- 32px tile cells (Forge). Source may be 16px CC0 scaled ×2.
- Presentation only in `src/render`. Sim = warmth floats only.
- CC0 only (Kenney / OGA CC0). CREDITS every pack.
- Only Prism edits Prism schedule tab.

### Task 1: Palette + swatches

- Create/overwrite `docs/art/PALETTE.md`, `docs/art/MOODBOARD.md`, regenerate `docs/art/swatches/*`

### Task 2: Shortlist + download vendor + CREDITS

- Create `docs/art/ASSET_SHORTLIST.md`, download CC0 zips to `assets/vendor/`, write `CREDITS.md`

### Task 3: Ashford mockup

- Build `docs/art/mockups/ashford-half-and-half.png` from real vendor tiles

### Task 4: Schedule log + verify

- Append Prism Done row; file existence checks
