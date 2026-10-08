# Farmhood Press V2 editorial contract

This directory is an isolated prototype. Nothing here is imported by the production Press generator or public site.

## Newsroom flow

1. **Reporting packet:** freeze current-week facts, relevant player statistics, standings, history, and source metadata.
2. **Assignment desk:** select one continuing manager-led season thesis, one weekly main event, two supporting stories, and the facts relevant to each. `assignment.seasonLead` joins active manager arcs to fresh standings, current-week results, and relevant verified history.
3. **Research desk:** browse broadly, then admit only typed atomic NFL claims whose exact excerpt and publication time are independently verified against the cited public page.
4. **Beat writer:** return the strict long-form structure from `editorial-schema.mjs`. Every narrative block carries its supporting fact IDs; raw webpage prose never enters this prompt.
5. **Copy desk:** run `copy-desk.mjs` before any article can move forward.
6. **Quality desk:** apply the weighted rubric in `rubric.mjs`. A passing number never overrides a non-negotiable factual failure.
7. **Archive:** store used angles, phrases, history callbacks, and unresolved story arcs for later-edition cooldowns.

`story-memory.mjs` keeps that archive deterministic. It exposes recent cooldowns, the latest active arcs, and canonical historical context to the next assignment packet; resolved or retired arcs do not linger as active threads. Snapshot capture time orders same-week chapters so a late-generated Friday forecast cannot replace Tuesday's final recap. Legacy entries without timestamps apply the recap last.

## Contract version 3: season and matchup depth

Both editions contain 1,100–1,700 words. Their required root `seasonStoryline` contains `status` (emerging, active, or resolved), `headline`, a cited `thesis`, two to four canonical manager `subjects`, two or three cited `body` paragraphs, cited `whyNow`, and cited `carryForward`. Its current claims use the fresh fact registry; previous article summaries provide continuity only. The assignment's stable `season:<year>:manager-race` arc is recorded after the article passes all gates.

The main matchup has four or five paragraphs and at least 180 words. Each supporting matchup has exactly three paragraphs and at least 90 words. Each remaining game in `aroundLeague` has exactly three cited objects in `body`, ordered by their `focus`: `what_happened`, `why_it_mattered`, and `next_chapter`. Each notebook also needs at least 90 words. The season storyline needs at least 180 words, and the main matchup must be deeper than either supporting story.

Each matchup uses specific starter evidence and current-season standings or form for both managers when those facts are available. A bare result cannot stand in for a matchup story. The selected evidence preserves raw points and projection values behind each manager's key player variance.

## Reporting-packet contract

The V2 writer receives a compact packet containing:

- `factIds`: every fact the writer may cite;
- `managerNames`: exact canonical handles;
- `playerNames`: verified players relevant to the assignment;
- `matchupIds`: the edition's complete slate;
- `historyFactIds`: relevant history selected by the assignment desk, not the full archive;
- `requiredSeasonStorylineSubjects` and `seasonStorylineFactIds`: the deterministic season lead's managers and allowed supporting evidence;
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
- a missing or unsupported season storyline;
- shallow matchup prose or omitted starter/season evidence for either manager;
- the wrong edition-specific desk sections.

The deterministic score is a decision aid, not an excuse. Any hard failure blocks publication even when the total score is 85 or higher.

## Cost posture

V2 is designed for one writing request per edition. The assignment desk sends only facts selected for the chosen angles rather than the full league archive. A second model-based edit is a separately authorized purchase, not an automatic response to a failed check. Failed structured output is preserved before repair so a retry cannot silently purchase a second full draft.
