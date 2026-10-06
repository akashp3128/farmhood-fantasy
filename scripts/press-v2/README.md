# Farmhood Press V2 — shadow newsroom

Press V2 is an isolated, review-only newsroom prototype. It does not import into the current Press generator, change `press.html`, modify `content/articles`, or participate in the automatic Tuesday/Wednesday/Friday publication schedule.

## What it changes

The newsroom now works as a reporting pipeline rather than one large prompt:

1. The production Sleeper snapshots are normalized into canonical managers, players, matchups, sources, and typed facts.
2. A deterministic assignment desk ranks the real story angles and selects a bounded evidence packet.
3. A low-cost research desk can search the unrestricted public web for current NFL context. Web pages are treated as untrusted input.
4. Claims survive only when their cited URLs were actually returned by web search and meet the source rules below.
5. The long-form writer receives the frozen league facts and accepted web claims. It receives no browser or other tools.
6. Structured output, the claim checker, copy desk, long-form rubric, and cost ledger must all pass before a shadow edition is saved.

## Web research policy

The research desk has broad public-web access (`external_web_access: true`) and no domain allowlist. Breadth does not mean automatic trust:

- Official NFL and team sites count as primary sources.
- Established sports/news outlets can support a reported claim.
- Other sites, social platforms, and forums may provide research leads but cannot cross into the writer packet. Published external atoms require an official or established source.
- Source URLs must be present in the web tool's returned source ledger.
- Free-form web prose never crosses into the writer. Research can emit only typed availability or quantitative usage/milestone atoms.
- Each atom needs a complete canonical positive source sentence of at most 25 words and a publication timestamp. V2 independently resolves and pins a public address, follows only same-site validated redirects, verifies the entire source sentence and timestamp, and discards the page body before writing.
- Availability is inferred from typed status fields and requires an official NFL or team source; it cannot be mislabeled as general context.
- Page instructions are ignored as untrusted content.
- The research request may cover public NFL players and teams, never the private people behind fantasy-manager handles.
- The writer may cite only independently source-verified `web:*` claim IDs, and the UI preserves clickable provenance.
- A blocked, encoded, paywalled, stale, or otherwise unverifiable optional source is quarantined claim-by-claim; the edition continues safely with zero or fewer web atoms instead of spending on a second research call.

## Cost controls

The owner-authorized maximum is **$0.10**, while the code stops its estimate at **$0.09** to keep a safety margin:

- Research ceiling: **$0.04**
- Web-search calls: at most **3**
- Web-search tool fee: budgeted at **$0.01 per call**
- Writer ceiling: at most **$0.055**, reduced dynamically by actual research spend
- Internal estimated stop: **$0.09**, checked before and after each paid stage
- Owner-approved maximum: **$0.10**

The writer's exact input token count is requested before generation. Research and writing reserve the highest input-category rate, including cache writes. The writer's output-token allowance is then calculated from the cents still available, up to 6,000 output tokens. If at least 4,500 output tokens cannot be afforded, the writer call is blocked rather than buying a draft too short for the reporting contract. Paid structured copy is checkpointed before editorial validation so a rejected draft can be recovered without automatically buying another full generation.

The writer uses **Flex processing**, with half the standard token price for the configured writing model. This funds longer stories without increasing the spending ceiling. Flex can be slower or temporarily unavailable; V2 does not automatically retry a paid call or fall back to a more expensive service tier. The response's actual service tier is checked and recorded in its usage receipt.

The paid request uses three additional conservation measures: at most 160 assignment-relevant facts survive the 500+ fact registry, repeated JSON Schema structures use `$defs`/`$ref`, and long immutable fact IDs become short temporary citation aliases. Full fact IDs are restored before validation and storage, so the audit trail stays intact without paying to repeat long identifiers throughout the prompt and schema.

Pricing lives in `config.mjs` with an explicit `pricingAsOf` date. Paid calls fail closed when that pricing is more than 31 days old. Update those values when model or web-search prices change, and configure an OpenAI project budget as the account-level backstop; repository calculations are estimates rather than a provider-enforced billing limit.

## Editorial gates

An edition cannot pass when it contains an unsupported number, unknown fact ID, misspelled manager, player/roster mismatch, incorrect opponent relationship, invented quote or motive, fake reporting access, unsupported causal claim, recycled phrase, incomplete matchup slate, or score below the 85/100 quality threshold.

Both editions target 1,100–1,700 words. Friday Weekend Outlooks must distinguish Thursday facts from remaining projections. Each edition includes a manager-led season feature, a deeper main matchup, and substantive coverage of every other matchup. Each matchup needs specific starter evidence and current-season context for both managers. The copy desk rejects shallow individual stories even when the overall edition is long enough.

## Local review

The dry run is free and creates only a compact dossier:

```sh
node scripts/press-v2/generate-shadow.mjs --mode dry-run --edition recap --season 2026 --week 3
```

It proves that real snapshot data can build the assignment, research subjects, writing packet, and safety policy without calling OpenAI.

Paid generation requires `OPENAI_API_KEY` and should normally run through the manual **Farmhood Press V2 shadow lab** GitHub Action. Paid code is checked out from the immutable dispatch SHA on `main` only, third-party actions are pinned to immutable release commits, and the job uses the `farmhood-press-v2-paid` environment. Create that environment, require owner approval, and store the key there as `PRESS_V2_OPENAI_API_KEY`; the workflow deliberately does not use the general repository secret. It has read-only repository permission and cannot publish or commit the result.

Workflow artifacts are readable by people who can read the repository; they are not described as private storage. Immediately before the first paid request, the workflow uploads a 90-day spend reservation for that week and edition. This survives later cancellation or runner loss and blocks an accidental second purchase; delete the reservation manually only when a deliberate retry is approved. Failed raw model payloads are sanitized before a separate recovery upload, leaving only the structured draft/output, accepted research packet, usage receipt, and validation error needed for recovery.

`press-v2.html` includes a zero-cost, manually written Week 3 editorial review made from frozen league evidence. It exercises the Front Page, Season Desk, long-form matchup reader, story memory, and gamebook without pretending to be a paid AI generation. The authored sample uses a broader evidence set than the paid writer's compact packet and separate review-only continuity; it demonstrates an editorial direction, not proven model performance. Actual model performance still needs a separately approved shadow run.

## Promotion path

V2 stays shadow-only until the league approves both the stories and the user experience. Promotion should be a separate change that intentionally connects V2 to the live site and automatic schedule. Removing `shadowOnly` or allowing production mutation is not part of this branch.
