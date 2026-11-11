import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { editionsConflict, evaluateReviewGuard, findReviewConflicts, parsePressBranch, readReviewState, reportReviewGuard } from './review-guard.mjs';

const target = (edition = 'late-preview', week = 5, season = 2026) => ({ edition, season, week });
const recoveryBranch = 'press/attempt-late-preview-2026-week-5';
const review = (headRefName = recoveryBranch, state = 'OPEN', extra = {}) => ({ headRefName, state, mergedAt: null, url: 'https://github.com/example/farmhood/pull/14', ...extra });
const guard = (requested, branches = [recoveryBranch], pullRequests = [review()]) => evaluateReviewGuard({ target: requested, branches, pullRequests });

test('parses only trusted reservation and manual-review branch identities', () => {
  assert.deepEqual(parsePressBranch(recoveryBranch), { branch: recoveryBranch, edition: 'late-preview', season: 2026, week: 5, kind: 'reservation' });
  const manual = 'press/recap-2026-week-1-34993444207-1';
  assert.deepEqual(parsePressBranch(`refs/heads/${manual}`), { branch: manual, edition: 'recap', season: 2026, week: 1, kind: 'review' });
  assert.equal(parsePressBranch(`refs/remotes/origin/${recoveryBranch}`).week, 5);
  assert.equal(parsePressBranch(`origin/${recoveryBranch}`).edition, 'late-preview');
  assert.equal(parsePressBranch('press/waiver-2026-week-06-123-2').week, 6);
  for (const ref of ['codex/farmhood-press-v2', 'press/recap-2026-week-5', 'press/attempt-recap-2026-week-19', 'press/attempt-recap-2026-week-0', 'press/attempt-recap-2026-week-5-extra', 'press/recap-2026-week-5-123-0']) assert.equal(parsePressBranch(ref), null);
});

test('Week 5 paid Outlook recovery does not block independent weeks, recaps, or waivers', () => {
  for (const requested of [target('waiver', 6), target('waiver', 5), target('preview', 6), target('late-preview', 6), target('recap', 5), target('late-preview', 5, 2027), target('waiver', 10), target('preview', 10), target('late-preview', 10), target('recap', 9)]) {
    const result = guard(requested);
    assert.equal(result.blocked, false, JSON.stringify(requested));
    assert.deepEqual(result.conflicts, []);
  }
});

test('exact paid reservation blocks with or without an open PR', () => {
  const open = guard(target());
  assert.equal(open.blocked, true);
  assert.equal(open.conflicts[0].state, 'OPEN');
  assert.match(open.reason, /press\/attempt-late-preview-2026-week-5/);
  assert.match(open.reason, /pull\/14/);
  assert.match(open.reason, /No OpenAI request was sent/);
  const orphan = guard(target(), [recoveryBranch], []);
  assert.equal(orphan.blocked, true);
  assert.equal(orphan.conflicts[0].state, 'ORPHAN');
  assert.match(orphan.reason, /Recover or resolve/);
});

test('preview and late outlook protect the same week forecast identity in both directions', () => {
  assert.equal(guard(target('preview', 5)).blocked, true);
  assert.equal(guard(target('late-preview', 5), ['press/preview-2026-week-5-123-1'], []).blocked, true);
  assert.equal(editionsConflict(target('preview'), target('late-preview')), true);
  assert.equal(editionsConflict(target('late-preview'), target('preview')), true);
  assert.equal(editionsConflict(target('recap'), target('preview')), false);
});

test('only matching recap reviews prevent another recap', () => {
  const branch = 'press/recap-2026-week-5-123-1';
  assert.equal(guard(target('recap'), [branch], [review(branch)]).blocked, true);
  assert.equal(guard(target('recap', 6), [branch], [review(branch)]).blocked, false);
  assert.equal(guard(target('preview', 5), [branch], [review(branch)]).blocked, false);
});

test('waivers ignore AI reviews but still prevent a duplicate matching waiver draft', () => {
  const branch = 'press/waiver-2026-week-6-123-1';
  assert.equal(guard(target('waiver', 6), [branch, recoveryBranch], [review(branch), review()]).blocked, true);
  assert.equal(guard(target('waiver', 7), [branch, recoveryBranch], [review(branch), review()]).blocked, false);
  assert.equal(guard(target('recap', 6), [branch], [review(branch)]).blocked, false);
});

test('closed and merged manual review branches are benign even when remote branches remain', () => {
  const branch = 'press/late-preview-2026-week-5-123-1';
  assert.equal(guard(target(), [branch], [review(branch, 'CLOSED')]).blocked, false);
  assert.equal(guard(target(), [branch], [review(branch, 'MERGED', { mergedAt: '2026-10-10T12:00:00Z' })]).blocked, false);
  const unknown = 'press/old-unidentified-review';
  assert.equal(guard(target(), [unknown], [review(unknown, 'CLOSED')]).blocked, false);
  assert.equal(guard(target(), [unknown], [review(unknown, 'MERGED', { mergedAt: '2026-10-10T12:00:00Z' })]).blocked, false);
});

test('closing or merging a recovery PR does not release an existing paid-attempt reservation', () => {
  for (const closed of [review(recoveryBranch, 'CLOSED'), review(recoveryBranch, 'MERGED', { mergedAt: '2026-10-10T12:00:00Z' })]) {
    for (const branches of [[recoveryBranch], []]) {
      const result = guard(target(), branches, [closed]);
      assert.equal(result.blocked, true);
      assert.equal(result.conflicts[0].state, 'RESERVED');
      assert.equal(guard(target('late-preview', 6), branches, [closed]).blocked, false);
    }
  }
});

test('an open review remains a lock even if an older PR for the branch was closed', () => {
  assert.equal(guard(target(), [recoveryBranch], [review(recoveryBranch, 'CLOSED'), review()]).blocked, true);
});

test('unknown active Press identities fail closed for AI but never starve deterministic waivers', () => {
  const branch = 'press/unclassified-recovery';
  for (const edition of ['preview', 'late-preview', 'recap']) {
    const result = guard(target(edition, 6), [branch], []);
    assert.equal(result.blocked, true);
    assert.equal(result.conflicts[0].reason, 'unknown-identity');
    assert.match(result.reason, /edition cannot be determined safely/);
  }
  assert.equal(guard(target('waiver', 6), [branch], []).blocked, false);
  assert.equal(guard(target('preview', 6), ['codex/farmhood-press-v2'], []).blocked, false);
});

test('an open PR is checked even when its head branch is absent from remote refs', () => {
  assert.equal(guard(target(), [], [review()]).blocked, true);
});

test('rejects invalid target identities instead of silently allowing generation', () => {
  for (const requested of [target('unknown'), target('recap', 19), target('recap', 0), target('recap', true), target('recap', 5, '2026-extra')]) {
    assert.throws(() => findReviewConflicts({ target: requested }));
  }
});

test('reads live refs and PR metadata without fetching, switching branches, or external writes', async () => {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git') return { stdout: `${'a'.repeat(40)}\trefs/heads/${recoveryBranch}\n` };
    return { stdout: JSON.stringify([review()]) };
  };
  const state = await readReviewState({ run });
  assert.deepEqual(state.branches, [`refs/heads/${recoveryBranch}`]);
  assert.equal(evaluateReviewGuard({ target: target(), ...state }).blocked, true);
  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [['git', 'ls-remote', '--heads'], ['gh', 'pr', 'list']]);
});

test('looks up omitted branch PR metadata so an old closed review does not become an orphan lock', async () => {
  const branch = 'press/late-preview-2026-week-5-123-1';
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git') return { stdout: `${'a'.repeat(40)}\trefs/heads/${branch}\n` };
    return { stdout: JSON.stringify(args.includes('--head') ? [review(branch, 'CLOSED')] : []) };
  };
  const state = await readReviewState({ run });
  assert.equal(evaluateReviewGuard({ target: target(), ...state }).blocked, false);
  assert.equal(calls.filter((call) => call.includes('--head')).length, 1);
});

test('looks up exact paid identities even when old PR metadata and deleted branches are absent globally', async () => {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git') return { stdout: '' };
    const head = args[args.indexOf('--head') + 1];
    return { stdout: JSON.stringify(args.includes('--head') && head === recoveryBranch ? [review(recoveryBranch, 'CLOSED')] : []) };
  };
  const state = await readReviewState({ target: target('preview'), run });
  assert.equal(evaluateReviewGuard({ target: target('preview'), ...state }).blocked, true);
  assert.deepEqual(calls.filter((call) => call.includes('--head')).map((call) => call[call.indexOf('--head') + 1]).sort(), [
    'press/attempt-late-preview-2026-week-5', 'press/attempt-preview-2026-week-5'
  ]);
});

test('fails closed when GitHub or git returns malformed metadata', async () => {
  await assert.rejects(readReviewState({ run: async (command) => ({ stdout: command === 'git' ? 'invalid ref\n' : '[]' }) }), /invalid Press branch listing/);
  await assert.rejects(readReviewState({ run: async (command) => ({ stdout: command === 'git' ? '' : '{}' }) }), /invalid review metadata/);
  await assert.rejects(readReviewState({ run: async (command) => ({ stdout: command === 'git' ? '' : '[{"headRefName":"press/unknown","state":null}]' }) }), /invalid review metadata/);
});

test('blocked guard reports an actionable workflow error and explicit zero-spend summary', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'press-review-guard-'));
  const output = path.join(directory, 'output');
  const summary = path.join(directory, 'summary');
  const originalError = console.error;
  const errors = [];
  try {
    console.error = (message) => errors.push(message);
    await reportReviewGuard(guard(target()), { GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary });
    assert.match(await readFile(output, 'utf8'), /^blocked=true\nreason=Cannot generate late-preview 2026 Week 5:/);
    assert.match(await readFile(summary, 'utf8'), /needs recovery or review/);
    assert.match(await readFile(summary, 'utf8'), /OpenAI requests from this check: 0/);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^::error title=Farmhood Press blocked::/);
    assert.match(errors[0], /Recover or resolve the existing attempt first/);
  } finally {
    console.error = originalError;
    await rm(directory, { recursive: true, force: true });
  }
});

test('review guard CLI fails visibly for conflicts or unavailable state, and allows unrelated weeks', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'press-review-cli-'));
  const execute = promisify(execFile);
  const output = path.join(directory, 'output');
  const summary = path.join(directory, 'summary');
  try {
    // The only child commands available are read-only test doubles. No GitHub
    // credentials, real git commands, network calls, or paid requests are used.
    for (const [command, fixture] of [['git', 'PRESS_GIT_FIXTURE'], ['gh', 'PRESS_GH_FIXTURE']]) {
      const executable = path.join(directory, command);
      await writeFile(executable, `#!/bin/sh\nprintf '%s' "$${fixture}"\n`, 'utf8');
      await chmod(executable, 0o755);
    }
    const cli = fileURLToPath(new URL('./review-guard.mjs', import.meta.url));
    const env = {
      PATH: directory,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      PRESS_GIT_FIXTURE: `${'a'.repeat(40)}\trefs/heads/${recoveryBranch}\n`,
      PRESS_GH_FIXTURE: JSON.stringify([review()])
    };
    const blocked = await execute(process.execPath, [cli, '--edition', 'late-preview', '--season', '2026', '--week', '5'], { env }).catch((error) => error);
    assert.equal(blocked.code, 1, 'a conflict must fail the workflow, not leave a successful skipped run');
    assert.match(blocked.stderr, /::error title=Farmhood Press blocked::/);
    assert.equal(JSON.parse(blocked.stdout).blocked, true);
    const unrelated = await execute(process.execPath, [cli, '--edition', 'recap', '--season', '2026', '--week', '9'], { env });
    assert.equal(JSON.parse(unrelated.stdout).blocked, false);
    const unavailable = await execute(process.execPath, [cli, '--edition', 'recap', '--season', '2026', '--week', '9'], { env: { ...env, PRESS_GH_FIXTURE: '{}' } }).catch((error) => error);
    assert.equal(unavailable.code, 1);
    assert.match(unavailable.stderr, /Cannot verify existing Press attempts/);
    assert.match(await readFile(summary, 'utf8'), /No OpenAI request was sent/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
