# Ranking Studio

Visual changes belong in `src/theme/tokens.css` and `src/theme/tokenMeta.ts`.
Do not hardcode spacing, type sizes, or colors on the poster. If a look cannot
be expressed as a token, add a token and an inspector control.

Demi-facing files:
- `src/theme/tokens.css`
- `src/theme/tokenMeta.ts`
- `src/templates/RankingPoster.css`

Engine files (`src/engine/`) parse tables, match names, and export PNG. Leave
those alone unless matching or export is broken.
