# Farmhood Press V2 editorial contract

This directory is an isolated prototype. Nothing here is imported by the production Press generator or public site.

## Newsroom flow

1. **Reporting packet:** freeze current-week facts, relevant player statistics, standings, history, and source metadata.
2. **Assignment desk:** select one central thesis, one main event, two supporting stories, and the facts relevant to each.
3. **Research desk:** browse broadly, then admit only typed atomic NFL claims whose exact excerpt and publication time are independently verified against the cited public page.
4. **Beat writer:** return the strict long-form structure from `editorial-schema.mjs`. Every narrative block carries its supporting fact IDs; raw webpage prose never enters this prompt.
5. **Copy desk:** run `copy-desk.mjs` before any article can move forward.
6. **Quality desk:** apply the weighted rubric in `rubric.mjs`. A passing number never overrides a non-negotiable factual failure.
7. **Archive:** store used angles, phrases, history callbacks, and unresolved story arcs for later-edition cooldowns.

`story-memory.mjs` keeps that archive deterministic. It exposes only recent cooldowns and the latest state of each active arc to the next assignment packet; resolved or retired arcs do not linger in prompts.

## Reporting-packet contract

The V2 writer receives a compact packet containing:

- `factIds`: every fact the writer may cite;
- `managerNames`: exact canonical handles;
- `playerNames`: verified players relevant to the assignment;
- `matchupIds`: the edition's complete slate;
- `historyFactIds`: relevant history selected by the assignment desk, not the full archive;
- `verifiedQuoteFactIds`: normally empty; only populated for a literal, sourced quote;
- `verifiedIntentFactIds`: normally empty; only populated for a sourced statement of intent;
- `verifiedCausalFactIds`: facts that genuinely support causal language;
- `cooldownPhrases`: recent jokes, metaphors, and formulations that cannot be reused.

The model is not allowed to fill missing reporting with prior knowledge. Missing data must remain missing.

## Publication gates

An article cannot pass when it contains:

- an unknown or missing citation;
- a manager-name variant instead of the canonical handle;
- an invented quote, motive, source, or first-hand observation;
- unsupported causal language;
- a prohibited cliché or cooldown phrase;
- repeated copy that makes sections feel templated;
- incomplete matchup coverage;
- the wrong edition-specific desk sections.

The deterministic score is a decision aid, not an excuse. Any hard failure blocks publication even when the total score is 85 or higher.

## Cost posture

V2 is designed for one writing request per edition. The assignment desk should send only facts selected for the chosen angles rather than the full league archive. A second model-based edit is an exception used only after deterministic checks identify a repairable problem. Failed structured output must be preserved before repair so a retry does not automatically purchase a second full draft.
