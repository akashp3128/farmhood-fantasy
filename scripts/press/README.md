# Farmhood Press generator

The public site reads approved JSON from `content/articles/`. Generation happens only in a trusted server-side environment; no AI credential is shipped to the browser.

## Local fact refresh

```sh
node scripts/press/generate.mjs --type preview --season 2026 --week 1 --snapshot-only
node scripts/press/validate.mjs
```

## AI draft generation

Set `OPENAI_API_KEY` in the server environment, then run:

```sh
node scripts/press/generate.mjs --type preview --season 2026 --week 1 --tone spicy
```

The generator uses the Responses API with strict Structured Outputs. Generated prose is merged with deterministic projections, probabilities, injury data and lineup snapshots before validation.

## Cost controls

- The default model is `gpt-5.6-terra`. `OPENAI_MODEL` can override it, but the selected model must have pricing configured in `config.mjs`.
- Each request has an immutable edition ceiling: Preview and Recap are capped at 2,600 output tokens and $0.07; Weekend Outlook is capped at 2,300 output tokens and $0.065. Before generation, OpenAI's token-count endpoint measures the exact input and blocks any request whose standard-tier worst case exceeds its ceiling. `PRESS_MAX_ESTIMATED_COST_USD` may lower a ceiling but can never raise it.
- A normal edition sends two featured starters per team plus every injured or swap-affected starter instead of every roster row. The late-outlook payload is even tighter: one leading locked player, one leading remaining player, and the injury/swap exceptions needed for context.
- A Preview and Recap each use one model request. Live scores, projections, injuries and Lineup Watch updates use Sleeper data and make no OpenAI request.
- A Weekend Outlook also uses one model request, but only as a recovery path when kickoff has already happened and no original Preview exists.
- Every article response that reports usage is written to `content/usage/ledger.json` immediately. Successful drafts are summarized in the workflow; an automatic paid response that fails before publication is pushed to a recovery branch and preserved as an artifact so scheduled retries cannot buy the same draft again.
- Re-running an existing edition exits successfully without contacting OpenAI. A locked original Preview can never be overwritten; its live follow-up belongs in Lineup Watch.
- Press reviews are serialized because every edition updates the shared article index and usage ledger. If any Press pull request or unpublished Press branch still needs review, a new generation run stops at $0 with a visible error and the blocking review URL. Merge, close, or resolve that review, then rerun. Once the guard clears, the workflow fast-forwards to the newest `main` before generation so a just-published edition cannot be dropped from the next index.

Use `--force` only to intentionally replace an existing unlocked draft. It does not override a locked original Preview, an immutable Weekend Outlook, an open Press review, or an unpublished Press branch.

## Late Weekend Outlook

If the Thursday game has already started and the week has no pregame Preview, choose **late-preview** in the workflow or run:

```sh
node scripts/press/generate.mjs --type late-preview --season 2026 --week 3 --tone spicy
```

The recovery edition is deliberately different from a normal Preview:

- It is available only while Sleeper reports the week as live.
- It is rejected if `pre.json`, an original Preview, or a locked original prediction exists.
- It freezes one immutable `content/snapshots/2026/week-NN/live.json` and writes `week-NN-late-preview.json` as a **Weekend Outlook**.
- Each matchup forecast is official points already scored plus projections only for starters whose games had not begun at capture time. Missing remaining projections make that matchup incomplete, so no winner or probability is claimed.
- Before OpenAI is contacted, every occupied starter must have a known NFL game status. This prevents a missing schedule row from being mistaken for an unstarted player and double-counted.
- Thursday's known results are disclosed as known state. The prompt and validator prohibit original-pick or hindsight-as-foresight language.
- Every late forecast has `receiptEligible: false`. It is never included in original-prediction accuracy, even after the week becomes final.
- It cannot be regenerated or replaced, including with `--force`. Manual runs still require review; the approved scheduled pipeline may publish its first validated copy automatically.
- A later Recap may use the frozen late-outlook lineage when no original Preview exists, but its receipts remain `null` and it does not publish `predictionCorrect` fields.

Do not create a synthetic `pre.json` after kickoff. The separate `live.json` snapshot is the audit trail proving when the outlook was captured and which scores were already known.

## Weekly Waiver Wire

The waiver recap is a deterministic, zero-token Press edition generated from Sleeper's weekly transaction endpoint:

```sh
node scripts/press/generate-waivers.mjs --season 2026 --week 3
node scripts/press/validate.mjs
```

- It includes only `complete` transactions whose type is `waiver` or `free_agent` and whose Sleeper `leg` matches the requested week. Trades, pending claims and failed claims are excluded.
- Player IDs are resolved through Sleeper's full NFL player map once per weekly generation so an inactive or IR player being dropped is not lost. A verified NFL team code may fall back to a `<TEAM> D/ST` label; an unresolved non-defense player blocks publication.
- Roster IDs must resolve through the canonical `PRESS_CONFIG.rosterNames` mapping. An unknown manager blocks publication.
- Waiver bid, priority and claim-sequence values are published only when Sleeper supplies them. A recorded `$0` bid or priority `0` is preserved rather than treated as missing.
- The raw normalized record is frozen in `content/transactions/<season>/week-NN.json`; the public article is `content/articles/<season>/week-NN-waiver-recap.json` with type `week_waiver_recap` and edition `Waiver Wire`.
- All displayed transaction times use the league timezone, `America/Chicago` (Central time).
- The article copy contains only deterministic counts and verified add/drop facts. It makes no claim that a move was smart, bad, successful on the field or caused by information outside the transaction record.
- A zero-transaction week intentionally publishes a useful “No Completed Moves” report.
- Once either the weekly transaction snapshot or article exists, regeneration is blocked before any Sleeper or OpenAI request. The frozen Wednesday report is never silently rewritten by a later retry.
- Generation makes zero OpenAI requests and does not add an entry to the AI usage ledger.

## Automatic Central-time schedule

`.github/workflows/farmhood-press-auto.yml` publishes approved recurring editions directly to `main` after deterministic tests and publication validation:

- **Tuesday morning:** Recap at 9:07, 9:37 and a 10:07 recovery attempt.
- **Wednesday afternoon:** Waiver Wire at 2:07, 2:37 and a 3:07 recovery attempt.
- **Friday morning:** post-Thursday Weekend Outlook at 9:07, 9:37 and a 10:07 recovery attempt.

Every schedule uses the IANA timezone `America/Chicago`, so GitHub handles CST/CDT automatically. The off-minute attempts avoid the busiest top-of-hour scheduling window. Deterministic article IDs, immutable snapshots and pre-request planning make repeated attempts cost $0 after the first success.

The planner derives week numbers from Sleeper rather than calendar arithmetic. Tuesday selects the earliest finalized week that still needs a Recap and has legitimate prediction lineage; Wednesday and Friday use the current Sleeper leg. Friday never replaces an original Preview. An open manual Press review safely defers automatic publication before any AI request.

Scheduled Recaps and Weekend Outlooks use at most one AI request each. The Waiver Wire is deterministic and uses zero AI tokens. Manual or forced generation remains review-only. A paid automatic failure creates a recovery branch before later retries, protecting the token spend from accidental duplication.

For GitHub, add `OPENAI_API_KEY` as a repository Actions secret and use the **Farmhood Press draft** workflow. The workflow opens a draft pull request; it does not publish directly. Review and merge that pull request to publish through the existing GitHub Pages deployment. The repository setting **Allow GitHub Actions to create and approve pull requests** must be enabled; the workflow creates review PRs but never approves them.

Choose **credential-test** for a zero-generation check of the secret and configured model. Choose **connection-test** for a tiny structured response that also confirms credits and generation readiness. Choose **generate** for a reviewed Preview, late-preview Weekend Outlook, deterministic Waiver Wire, or Recap draft. If a draft cannot be created—for example, another Press review is open, the requested edition already exists, the late-preview timing/lineage rules are not satisfied, or a Recap is not final—the workflow fails visibly with a zero-cost explanation instead of looking successful without producing anything.
