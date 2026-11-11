import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { assert, parseCli, repoRoot, safeText } from './utils.mjs';

const execute = promisify(execFile);
const editions = new Set(['preview', 'late-preview', 'recap', 'waiver']);
const forecasts = new Set(['preview', 'late-preview']);

function branchName(ref) {
  return String(ref || '').replace(/^refs\/heads\//, '').replace(/^refs\/remotes\/origin\//, '').replace(/^origin\//, '');
}

function editionIdentity({ edition, season, week } = {}) {
  assert(editions.has(edition), 'Review guard edition must be preview, late-preview, recap, or waiver.');
  assert(/^[0-9]{4}$/.test(String(season)), 'Review guard season must be a four-digit year.');
  assert(/^[0-9]{1,2}$/.test(String(week)) && Number(week) >= 1 && Number(week) <= 18, 'Review guard week must be an integer from 1 through 18.');
  return { edition, season: Number(season), week: Number(week) };
}

// Only workflow-created branch formats carry a trustworthy edition identity.
export function parsePressBranch(ref) {
  const branch = branchName(ref);
  const reservation = /^press\/attempt-(preview|late-preview|recap|waiver)-([0-9]{4})-week-([0-9]{1,2})$/.exec(branch);
  const review = /^press\/(preview|late-preview|recap|waiver)-([0-9]{4})-week-([0-9]{1,2})-([1-9][0-9]*)-([1-9][0-9]*)$/.exec(branch);
  const match = reservation || review;
  if (!match || Number(match[3]) < 1 || Number(match[3]) > 18) return null;
  return {
    branch,
    edition: match[1],
    season: Number(match[2]),
    week: Number(match[3]),
    kind: reservation ? 'reservation' : 'review'
  };
}

export function editionsConflict(requested, existing) {
  const target = editionIdentity(requested);
  const candidate = editionIdentity(existing);
  if (target.season !== candidate.season || target.week !== candidate.week) return false;
  return target.edition === candidate.edition || (forecasts.has(target.edition) && forecasts.has(candidate.edition));
}

export function findReviewConflicts({ target, branches = [], pullRequests = [] } = {}) {
  const requested = editionIdentity(target);
  assert(Array.isArray(branches) && Array.isArray(pullRequests), 'Review guard requires branch and pull-request arrays.');
  const byBranch = new Map();
  for (const review of pullRequests) {
    const branch = branchName(review?.headRefName);
    if (!branch.startsWith('press/')) continue;
    if (!byBranch.has(branch)) byBranch.set(branch, []);
    byBranch.get(branch).push(review);
  }
  const candidates = new Set(branches.map((ref) => branchName(ref)).filter((branch) => branch.startsWith('press/')));
  for (const [branch, reviews] of byBranch) {
    // A closed recovery PR is evidence of a paid attempt even when someone has
    // also deleted its head branch. Only recovering that paid response is safe;
    // branch deletion must not turn a consumed reservation into a fresh spend.
    if (parsePressBranch(branch)?.kind === 'reservation' || reviews.some((review) => review.state === 'OPEN' && !review.mergedAt)) candidates.add(branch);
  }
  const conflicts = [];
  for (const branch of [...candidates].sort()) {
    const reviews = byBranch.get(branch) || [];
    const openReview = reviews.find((review) => review.state === 'OPEN' && !review.mergedAt);
    const identity = parsePressBranch(branch);
    // Closing a paid recovery is not evidence that its reservation is unused.
    // Ordinary completed/closed manual drafts are no longer active review locks.
    if (identity?.kind !== 'reservation' && !openReview && reviews.some((review) => review.mergedAt || ['CLOSED', 'MERGED'].includes(review.state))) continue;
    if (!identity && requested.edition === 'waiver') continue;
    if (identity && !editionsConflict(requested, identity)) continue;
    conflicts.push({
      branch,
      identity,
      state: openReview ? 'OPEN' : identity?.kind === 'reservation' && reviews.length ? 'RESERVED' : 'ORPHAN',
      url: openReview?.url || reviews[0]?.url || '',
      reason: identity ? 'matching-edition' : 'unknown-identity'
    });
  }
  return conflicts;
}

export function evaluateReviewGuard(input = {}) {
  const target = editionIdentity(input.target);
  const conflicts = findReviewConflicts({ ...input, target });
  const label = `${target.edition} ${target.season} Week ${target.week}`;
  if (!conflicts.length) return { blocked: false, target, conflicts, reason: `No conflicting Press review or reservation exists for ${label}.` };
  const details = conflicts.map((conflict) => {
    const location = `${conflict.branch}${conflict.url ? ` (${conflict.url})` : ''}`;
    return conflict.reason === 'unknown-identity'
      ? `unrecognized active Press branch ${location}; its edition cannot be determined safely`
      : `${conflict.state === 'OPEN' ? 'open review' : 'unpublished reservation/review branch'} ${location}`;
  });
  return {
    blocked: true,
    target,
    conflicts,
    reason: `Cannot generate ${label}: ${details.join('; ')}. Recover or resolve the existing attempt first; do not delete a paid reservation just to regenerate. No OpenAI request was sent.`
  };
}

export async function readReviewState({ target = null, cwd = repoRoot(import.meta.url), run = execute } = {}) {
  const options = { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 45_000 };
  const [{ stdout: refs }, { stdout: metadata }] = await Promise.all([
    run('git', ['ls-remote', '--heads', 'origin', 'refs/heads/press/*'], options),
    run('gh', ['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'headRefName,url,state,mergedAt'], options)
  ]);
  const branches = refs.split(/\r?\n/).filter(Boolean).map((line) => {
    const match = /^[a-f0-9]{40,64}\s+(refs\/heads\/press\/\S+)$/.exec(line);
    assert(match, 'Git returned an invalid Press branch listing; refusing to spend tokens.');
    return match[1];
  });
  const parseReviews = (text) => {
    const reviews = JSON.parse(text);
    assert(Array.isArray(reviews) && reviews.every((review) => review && typeof review.headRefName === 'string' && ['OPEN', 'CLOSED', 'MERGED'].includes(review.state)), 'GitHub returned invalid review metadata; refusing to spend tokens.');
    return reviews;
  };
  const pullRequests = parseReviews(metadata);
  // Do not silently treat a branch outside a truncated PR listing as an orphan.
  // A branch-specific lookup also handles repositories with more than 1,000 PRs.
  const knownBranches = new Set(pullRequests.map((review) => review.headRefName));
  const lookupBranches = new Set(branches.map(branchName));
  if (target) {
    const requested = editionIdentity(target);
    // The exact recovery PR may be older than the global listing and its branch
    // may have been deleted. Query canonical paid identities explicitly so PR
    // pagination cannot erase proof that this edition already consumed tokens.
    const relatedEditions = forecasts.has(requested.edition) ? [...forecasts] : requested.edition === 'waiver' ? [] : [requested.edition];
    for (const edition of relatedEditions) lookupBranches.add(`press/attempt-${edition}-${requested.season}-week-${requested.week}`);
  }
  for (const ref of lookupBranches) {
    const branch = branchName(ref);
    if (knownBranches.has(branch)) continue;
    const { stdout } = await run('gh', ['pr', 'list', '--state', 'all', '--head', branch, '--limit', '1000', '--json', 'headRefName,url,state,mergedAt'], options);
    pullRequests.push(...parseReviews(stdout));
  }
  return { branches, pullRequests };
}

export async function reportReviewGuard(result, env = process.env) {
  const reason = safeText(result.reason, 8000);
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `blocked=${result.blocked}\nreason=${reason}\n`, 'utf8');
  if (env.GITHUB_STEP_SUMMARY) {
    const title = result.blocked ? 'Farmhood Press needs recovery or review' : 'Farmhood Press duplicate-spend check';
    await appendFile(env.GITHUB_STEP_SUMMARY, `### ${title}\n- ${reason}\n- OpenAI requests from this check: 0\n`, 'utf8');
  }
  if (result.blocked) console.error(`::error title=Farmhood Press blocked::${reason.replace(/%/g, '%25')}`);
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const target = editionIdentity(options);
  let result;
  try {
    result = evaluateReviewGuard({ target, ...await readReviewState({ target }) });
  } catch (error) {
    result = { blocked: true, target, conflicts: [], reason: `Cannot verify existing Press attempts: ${safeText(error.message, 2000)}. No OpenAI request was sent; inspect the review check before retrying.` };
  }
  await reportReviewGuard(result);
  console.log(JSON.stringify(result, null, 2));
  if (result.blocked) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Farmhood Press review check failed: ${safeText(error.message, 2000)}`);
    process.exitCode = 1;
  });
}
