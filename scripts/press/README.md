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

The generator uses the Responses API with strict Structured Outputs. `OPENAI_MODEL` can override the default model. Generated prose is merged with deterministic projections, probabilities, injury data and lineup snapshots before validation.

For GitHub, add `OPENAI_API_KEY` as a repository Actions secret and use the **Farmhood Press draft** workflow. The workflow opens a draft pull request; merging that reviewed pull request publishes through the existing GitHub Pages deployment.
