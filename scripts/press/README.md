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
- Press reviews are serialized because every edition updates the shared article index and usage ledger. If any Press pull request or unpublished Press branch still needs review, a new generation run stops at $0 with a visible error and the blocking review URL. Merge, close, or resolve that review, then rerun. Once the guard clears, the workflow fast-forwards to the newest `main` before generation so a just-published edition cannot be dropped from the next index.

Use `--force` only to intentionally replace an existing unlocked draft. It does not override a locked original Preview, an open Press review, or an unpublished Press branch.

For GitHub, add `OPENAI_API_KEY` as a repository Actions secret and use the **Farmhood Press draft** workflow. The workflow opens a draft pull request; it does not publish directly. Review and merge that pull request to publish through the existing GitHub Pages deployment. The repository setting **Allow GitHub Actions to create and approve pull requests** must be enabled; the workflow creates review PRs but never approves them.

Choose **credential-test** for a zero-generation check of the secret and configured model. Choose **connection-test** for a tiny structured response that also confirms credits and generation readiness. Choose **generate** for a reviewed Preview or Recap draft. If a draft cannot be created—for example, another Press review is open, the requested edition already exists, or a Recap is not final—the workflow fails visibly with a zero-cost explanation instead of looking successful without producing anything.
