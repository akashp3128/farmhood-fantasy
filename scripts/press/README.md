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
- Each request is capped at 3,500 output tokens. Before generation, OpenAI's token-count endpoint measures the exact input and the generator blocks any request whose standard-tier worst case exceeds $0.10. Set the repository variable `PRESS_MAX_ESTIMATED_COST_USD` only when intentionally raising that per-article ceiling.
- A normal edition sends two featured starters per team plus every injured or swap-affected starter instead of every roster row. The late-outlook payload is even tighter: one leading locked player, one leading remaining player, and the injury/swap exceptions needed for context.
- A Preview and Recap each use one model request. Live scores, projections, injuries and Lineup Watch updates use Sleeper data and make no OpenAI request.
- A Weekend Outlook also uses one model request, but only as a recovery path when kickoff has already happened and no original Preview exists.
- Every article response that reports usage is written to `content/usage/ledger.json` immediately. Successful drafts are summarized in the workflow; a paid response that fails validation is called out and preserved as a workflow artifact.
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
- It cannot be regenerated or replaced, including with `--force`. Review the draft pull request carefully before merging.
- A later Recap may use the frozen late-outlook lineage when no original Preview exists, but its receipts remain `null` and it does not publish `predictionCorrect` fields.

Do not create a synthetic `pre.json` after kickoff. The separate `live.json` snapshot is the audit trail proving when the outlook was captured and which scores were already known.

For GitHub, add `OPENAI_API_KEY` as a repository Actions secret and use the **Farmhood Press draft** workflow. The workflow opens a draft pull request; it does not publish directly. Review and merge that pull request to publish through the existing GitHub Pages deployment. The repository setting **Allow GitHub Actions to create and approve pull requests** must be enabled; the workflow creates review PRs but never approves them.

Choose **credential-test** for a zero-generation check of the secret and configured model. Choose **connection-test** for a tiny structured response that also confirms credits and generation readiness. Choose **generate** for a reviewed Preview, late-preview Weekend Outlook, or Recap draft. If a draft cannot be created—for example, another Press review is open, the requested edition already exists, the late-preview timing/lineage rules are not satisfied, or a Recap is not final—the workflow fails visibly with a zero-cost explanation instead of looking successful without producing anything.
