import path from 'node:path';
import { assert, digest, readJsonIfExists, repoRoot } from '../press/utils.mjs';
import { validateConfig } from './model.mjs';

function assertCents(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} must be nonnegative integer cents.`);
}

function validateAllocations(prize, knownOwners, label) {
  assertCents(prize.awardCents, `${label} award`);
  assert(Array.isArray(prize.allocations), `${label} allocations are missing.`);
  const total = prize.allocations.reduce((sum, allocation) => {
    assert(knownOwners.has(allocation.ownerId), `${label} contains an unknown owner.`);
    assertCents(allocation.shareCents, `${label} share`);
    return sum + allocation.shareCents;
  }, 0);
  if (prize.status === 'final') assert(total === prize.awardCents, `${label} does not allocate its full award.`);
  else assert(total === 0, `${label} allocates money before it is final.`);
  return total;
}

async function main() {
  const root = repoRoot(import.meta.url);
  const config = await readJsonIfExists(path.join(root, 'content', 'payouts', '2026-config.json'));
  const ledger = await readJsonIfExists(path.join(root, 'content', 'payouts', '2026.json'));
  const configured = validateConfig(config);
  assert(ledger?.schemaVersion === 1 && ledger.season === config.season && ledger.leagueId === config.leagueId, 'Payout ledger identity is invalid.');
  assert(typeof ledger.updatedAt === 'string' && Number.isFinite(new Date(ledger.updatedAt).getTime()), 'Payout ledger updatedAt is invalid.');
  const { revision, updatedAt: _updatedAt, ...base } = ledger;
  assert(/^[a-f0-9]{64}$/.test(String(revision || '')) && digest(base) === revision, 'Payout ledger revision does not match its contents.');
  assert(Array.isArray(ledger.weekly) && ledger.weekly.length === config.regularSeasonWeeks, 'Payout ledger must contain all 14 weeks.');
  const knownOwners = new Set(config.managers.map((manager) => manager.ownerId));
  let awarded = 0;
  ledger.weekly.forEach((week, index) => {
    assert(week.week === index + 1 && week.position === config.positionSchedule[String(week.week)], `Week ${index + 1} payout row is invalid.`);
    assert(['pending', 'final'].includes(week.status), `Week ${week.week} has an invalid status.`);
    awarded += validateAllocations(week.highScore, knownOwners, `Week ${week.week} high score`);
    awarded += validateAllocations(week.positionPrize, knownOwners, `Week ${week.week} ${week.position}`);
    if (week.status === 'final') {
      assert(Array.isArray(week.teamScores) && week.teamScores.length === config.managers.length, `Week ${week.week} audit scores are incomplete.`);
      assert(/^[a-f0-9]{64}$/.test(String(week.sourceDigest || '')), `Week ${week.week} source digest is invalid.`);
    }
    const configuredRivalry = config.rivalries.find((rivalry) => rivalry.week === week.week);
    assert(Boolean(week.rivalry) === Boolean(configuredRivalry), `Week ${week.week} rivalry configuration mismatch.`);
    if (week.rivalry) {
      assert(week.rivalry.id === configuredRivalry.id && week.rivalry.participants.length === 2, `Week ${week.week} rivalry identity is invalid.`);
      awarded += validateAllocations(week.rivalry, knownOwners, `Week ${week.week} rivalry`);
    }
  });
  assert(ledger.seasonPrizes?.prizes?.length === 4, 'Season payout ledger must contain four prizes.');
  ledger.seasonPrizes.prizes.forEach((prize) => { awarded += validateAllocations(prize, knownOwners, prize.label); });
  assert(Array.isArray(ledger.managerTotals) && ledger.managerTotals.length === config.managers.length, 'Manager payout totals are incomplete.');
  const managerAwarded = ledger.managerTotals.reduce((sum, row) => {
    assert(knownOwners.has(row.ownerId), `Unknown manager total owner: ${row.ownerId}`);
    ['weeklyHighCents', 'positionCents', 'rivalryCents', 'seasonCents', 'totalCents'].forEach((field) => assertCents(row[field], `${row.manager} ${field}`));
    assert(row.weeklyHighCents + row.positionCents + row.rivalryCents + row.seasonCents === row.totalCents, `${row.manager} payout total does not reconcile.`);
    return sum + row.totalCents;
  }, 0);
  assert(managerAwarded === awarded && ledger.accounting.awardedCents === awarded, 'Awarded payout totals do not reconcile.');
  assert(ledger.accounting.totalCents === configured.totalCents, 'Ledger pot does not match configuration.');
  assert(ledger.accounting.seasonPoolCents === configured.seasonPoolCents, 'Season pool does not match configuration.');
  assert(ledger.accounting.weeklyHighPoolCents === configured.weeklyHighPoolCents, 'Weekly-high pool does not match configuration.');
  assert(ledger.accounting.positionPoolCents === configured.positionPoolCents, 'Position pool does not match configuration.');
  assert(ledger.accounting.rivalryPoolCents === configured.rivalryPoolCents, 'Rivalry pool does not match configuration.');
  assert(ledger.accounting.reservedCents === configured.totalCents - awarded, 'Reserved payout total does not reconcile.');
  console.log(JSON.stringify({ status: 'passed', revision, finalizedThroughWeek: ledger.status.completedThroughWeek, awardedCents: awarded, reservedCents: ledger.accounting.reservedCents }, null, 2));
}

main().catch((error) => {
  console.error(`Farmhood payout validation failed: ${error.message}`);
  process.exitCode = 1;
});
