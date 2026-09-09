# Farmhood 2026 payout ledger

The payout rules live in `content/payouts/2026-config.json`. Calculated results live in `content/payouts/2026.json` and are displayed on `payouts.html`.

## Payout structure

- Total pot: $3,000 (`$250 × 12`)
- Season purse: $2,140 (`$1,690 + $250 + $100 + $100`)
- Weekly high score: $30 × 14 = $420
- Starting-player position prize: $10 × 14 = $140
- Rivalry prize: $50 × 6 = $300

The position prize is awarded to the owner of the highest-scoring individual player at that week's configured position, using the final starting lineup only. Bench scores never qualify. FLEX weeks use players occupying either starting FLEX slot. Exact ties split the prize among the tied owners.

## Automatic reconciliation

The **Farmhood payouts** GitHub Actions workflow runs Tuesday at 9:00 AM Central, with a 10:17 AM recovery run. It:

1. Waits for all 12 Sleeper records to prove a week is final.
2. Rebuilds every finalized Week 1–14 award from official Sleeper scores.
3. Verifies rivalry identities and scheduled opponents.
4. Validates that every category and recipient reconciles to the $3,000 pot.
5. Commits only when calculated results changed.
6. Requests and verifies the legacy GitHub Pages build so workflow-authored updates go live.

The job has no OpenAI credentials and consumes zero AI tokens. Reprocessing all completed weeks makes missed runs and official stat corrections self-healing. The site reports calculated awards, not whether cash was physically transferred.

## Local verification

```sh
node scripts/payouts/test.mjs
node scripts/payouts/update.mjs --dry-run
node scripts/payouts/validate.mjs
```
