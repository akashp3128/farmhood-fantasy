import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { planAutomaticEdition } from './plan.mjs';
import { evaluateReviewGuard } from './review-guard.mjs';

const automatic = await readFile(new URL('../../.github/workflows/farmhood-press-auto.yml', import.meta.url), 'utf8');
const manual = await readFile(new URL('../../.github/workflows/farmhood-press.yml', import.meta.url), 'utf8');

// These workflows deliberately use plain, dependency-free YAML. Split only at
// the known step indentation so safety assertions cover the actual run blocks.
function steps(source) {
  return [...source.matchAll(/^      - name: (.+)\n([\s\S]*?)(?=^      - name: |$(?![\s\S]))/gm)].map((match) => ({
    name: match[1],
    text: match[0],
    id: /^        id: (.+)$/m.exec(match[0])?.[1] || '',
    condition: /^        if: (.+)$/m.exec(match[0])?.[1] || ''
  }));
}

test('automatic schedule retains Chicago-local primary times plus exactly two retries', () => {
  const schedules = [...automatic.matchAll(/^    - cron: "([^"]+)"\n      timezone: "([^"]+)"$/gm)].map((match) => ({ cron: match[1], timezone: match[2] }));
  assert.deepEqual(schedules, [
    { cron: '7,37 9 * 1,9-12 2', timezone: 'America/Chicago' },
    { cron: '7 10 * 1,9-12 2', timezone: 'America/Chicago' },
    { cron: '7,37 14 * 1,9-12 3', timezone: 'America/Chicago' },
    { cron: '7 15 * 1,9-12 3', timezone: 'America/Chicago' },
    { cron: '7,37 9 * 1,9-12 5', timezone: 'America/Chicago' },
    { cron: '7 10 * 1,9-12 5', timezone: 'America/Chicago' }
  ]);
  for (const { cron } of schedules) assert.ok(automatic.includes(`"${cron}"`), `schedule intent must recognize ${cron}`);
  assert.match(automatic, /"7,37 9 \* 1,9-12 2"\|"7 10 \* 1,9-12 2"\) edition="recap"/);
  assert.match(automatic, /"7,37 14 \* 1,9-12 3"\|"7 15 \* 1,9-12 3"\) edition="waiver"/);
  assert.match(automatic, /"7,37 9 \* 1,9-12 5"\|"7 10 \* 1,9-12 5"\) edition="late-preview"/);
});

test('manual and automatic publication share the non-cancelling main content writer lock', () => {
  for (const source of [automatic, manual]) {
    assert.match(source, /concurrency:\n  group: farmhood-main-content-writer\n  cancel-in-progress: false/);
    assert.match(source, /ref: refs\/heads\/main/);
    assert.match(source, /node --test scripts\/press\/\*\.test\.mjs/);
  }
});

test('both publication paths invoke the scoped review guard before any generator', () => {
  for (const source of [automatic, manual]) {
    const sequence = steps(source);
    const guardIndex = sequence.findIndex((step) => step.text.includes('node scripts/press/review-guard.mjs'));
    assert.ok(guardIndex >= 0, 'workflow must invoke the shared review guard CLI');
    const guard = sequence[guardIndex];
    assert.match(guard.text, /--edition "\$EDITION" --season 2026 --week "\$WEEK"/);
    assert.doesNotMatch(guard.text, /continue-on-error:|\|\| true|force_regeneration|FORCE_REGENERATION/);
    assert.doesNotMatch(source, /outputs\.found|blocking_review=|An existing Farmhood Press review must finish/);
    for (const [index, step] of sequence.entries()) {
      if (!/node scripts\/press\/generate(?:-waivers)?\.mjs/.test(step.text)) continue;
      assert.ok(index > guardIndex, `${step.name} must follow review verification`);
      assert.ok(step.condition.includes(`steps.${guard.id}.outputs.blocked != 'true'`), `${step.name} must check the scoped blocked output without a force bypass`);
      assert.doesNotMatch(step.condition, /force_regeneration|always\(\)|failure\(\)/);
    }
  }
});

test('every AI path reserves and pushes its edition identity before the paid request', () => {
  for (const source of [automatic, manual]) {
    const sequence = steps(source);
    const generateIndex = sequence.findIndex((step) => /node scripts\/press\/generate\.mjs/.test(step.text));
    const reserveIndex = sequence.findIndex((step) => /press\/attempt-\$\{EDITION\}-2026-week-\$\{WEEK\}/.test(step.text));
    assert.ok(reserveIndex >= 0 && reserveIndex < generateIndex, 'a durable reservation must precede AI generation');
    const reservation = sequence[reserveIndex];
    assert.match(reservation.text, /git push (?:--set-upstream )?origin/);
    assert.match(reservation.condition, /edition != 'waiver'/, 'deterministic waivers must not reserve a paid AI attempt');
    assert.ok(sequence.slice(generateIndex + 1).some((step) => /failure\(\)/.test(step.condition) && /paid_request == 'true'/.test(step.condition) && /git push origin/.test(step.text)), 'paid recovery files must survive on a remote branch after failure');
  }
});

test('unused reservation cleanup requires proof that neither a request nor paid response occurred', () => {
  for (const source of [automatic, manual]) {
    const releaseSteps = steps(source).filter((step) => /git push origin --delete/.test(step.text));
    assert.ok(releaseSteps.length > 0);
    for (const release of releaseSteps) {
      if (release.condition.includes("steps.publish.outputs.sha != ''")) continue;
      assert.match(release.condition, /always\(\)/);
      assert.match(release.condition, /outputs\.request_started != 'true'/);
      assert.match(release.condition, /outputs\.paid_request != 'true'/);
    }
  }
});

test('automatic retries keep targeting only the latest final and ignore unrelated Week 5 recovery', () => {
  const publishedIds = new Set(['2026-week-01-recap']);
  const league = { league_id: '1377086848295260160', season: '2026', settings: { leg: 10 } };
  const rosters = Array.from({ length: 12 }, (_, index) => ({ roster_id: index + 1, settings: { wins: 9, losses: 0, ties: 0 } }));
  const branch = 'press/attempt-late-preview-2026-week-5';
  const pullRequests = [{ headRefName: branch, state: 'OPEN', mergedAt: null, url: 'https://github.com/akashp3128/farmhood-fantasy/pull/14' }];
  const generatedWeeks = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const plan = planAutomaticEdition({ edition: 'recap', league, rosters, publishedIds });
    assert.equal(plan.week, 9);
    if (!plan.shouldRun) continue;
    const guard = evaluateReviewGuard({ target: { edition: plan.edition, season: plan.season, week: plan.week }, branches: [branch], pullRequests });
    assert.equal(guard.blocked, false);
    generatedWeeks.push(plan.week);
    publishedIds.add(plan.articleId);
  }
  assert.deepEqual(generatedWeeks, [9], 'retry windows must not buy the historical backlog after the current recap is published');
});

test('an empty planned publication fails visibly rather than looking successful', () => {
  const requirement = steps(automatic).find(step => step.name === 'Require the planned edition to produce a publication');
  assert.ok(requirement);
  assert.match(requirement.condition, /should_run == 'true'/);
  assert.match(requirement.condition, /generate_ai\.outputs\.changed != 'true'/);
  assert.match(requirement.condition, /generate_waiver\.outputs\.changed != 'true'/);
  assert.match(requirement.text, /::error title=Farmhood Press not published/);
  assert.match(requirement.text, /exit 1/);
});

test('already-published retries can repair Pages without spending again', () => {
  const sequence = steps(automatic);
  const verifyIndex = sequence.findIndex(step => step.name === 'Ensure the automatic edition is live on GitHub Pages');
  const verify = sequence[verifyIndex];
  assert.match(verify.condition, /steps\.plan\.outputs\.published == 'true'/);
  assert.match(verify.text, /REQUIRED_SHA=\$\(git rev-parse HEAD\)/);
  assert.ok(sequence.findIndex(step => step.name === 'Release the published AI reservation') > verifyIndex);
  const preserve = sequence.find(step => step.name === 'Preserve a paid attempt that did not publish');
  assert.match(preserve.condition, /steps\.publish\.outputs\.sha == ''/);
});
