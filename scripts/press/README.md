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
- The model receives two featured starters per team plus every injured or swap-affected starter, instead of every roster row.
- A Preview and Recap each use one model request. Live scores, projections, injuries and Lineup Watch updates use Sleeper data and make no OpenAI request.
- Every article response that reports usage is written to `content/usage/ledger.json` immediately. Successful drafts are summarized in the workflow; a paid response that fails validation is called out and preserved as a workflow artifact.
- Re-running an existing edition exits successfully without contacting OpenAI. A locked original Preview can never be overwritten; its live follow-up belongs in Lineup Watch.
- The workflow also detects an already-open review branch before generation, preventing repeated clicks from buying duplicate drafts while the first one awaits review.

Use `--force` only to intentionally replace an existing unlocked draft. It does not override a locked original Preview.

For GitHub, add `OPENAI_API_KEY` as a repository Actions secret and use the **Farmhood Press draft** workflow. The workflow opens a draft pull request; merging that reviewed pull request publishes through the existing GitHub Pages deployment.

Choose **credential-test** for a zero-generation check of the secret and configured model. Choose **connection-test** for a tiny structured response that also confirms credits and generation readiness. Choose **generate** for a reviewed Preview or Recap draft. If the requested edition already exists or a Recap is not ready yet, the workflow finishes green with a zero-cost explanation rather than opening a duplicate pull request.
