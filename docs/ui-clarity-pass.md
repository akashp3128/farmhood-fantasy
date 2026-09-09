# Farmhood UI clarity pass

This branch is a preview-only usability pass. It preserves every route, calculation, data source, payout rule, and publishing workflow.

## Product rule

Each page follows the same reading order:

1. **Now** — the primary answer or current-season task.
2. **Context** — a compact supporting summary, side rail, or status area.
3. **Archive** — deeper tables, charts, formulas, and history behind clearly labeled disclosure controls.

The Almanac colors, typography, square borders, and editorial personality remain unchanged.

## Shared patterns

- `page-intro`: consistent page title and supporting copy.
- `clarity-layout`: flexible primary column plus a 270–300px context rail.
- `clarity-aside-card`: supporting information that should remain visible without becoming the page's main task.
- `clarity-disclosure`: native, keyboard-accessible progressive disclosure.
- `clarity-tabs`: a small set of mutually exclusive page views.
- `clarity-summary-strip`: three concise supporting metrics.
- `skip-link`: keyboard route directly to the page content.

All controls target at least 44px. Mobile layouts use cards or disclosures instead of forcing desktop-width tables wherever practical.

## Page treatments

- **Home:** live season first; legacy totals, title history, and records in Almanac Highlights.
- **Managers:** directory first; compact top-three Money Board rail with ranks 4–12 on demand.
- **Matchups:** Previous / week selector / Next; full-width lineups; standings collapsed.
- **Power:** podium and rankings first; storylines, movement chart, and method collapsed.
- **Payouts:** Overview / Weekly Ledger / Cash Standings; mobile week and manager cards.
- **Press:** editorial copy first; compact embedded Lineup Watch routes to the complete Live Desk.
- **Records:** record holders first; complete ledger, marks, and charts disclosed separately.
- **History:** Sleeper chronology first; Founders era and duplicate ledger disclosed.
- **Story:** narrative timeline first; recurring themes and oddities disclosed.
- **Fun:** headline moments first; 2025 tables and all-time analysis disclosed separately.
- **Draft:** current draft first; historical steals and busts disclosed.
- **Trades:** recent deals first; activity leaderboard disclosed.

## Preview safety

Do not deploy this branch through the production GitHub Pages environment. Review it locally and through a draft pull request. Merge to `main` only after explicit approval.
