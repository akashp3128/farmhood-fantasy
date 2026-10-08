import { deepFreeze } from './utils.mjs';

export const PRESS_V2_CONFIG = deepFreeze({
  schemaVersion: 1,
  shadowOnly: true,
  productionMutationAllowed: false,
  season: 2026,
  timezone: 'America/Chicago',
  openaiApiRoot: 'https://api.openai.com/v1',
  researchModel: 'gpt-6-luna',
  writerModel: 'gpt-5.6-terra',
  writerServiceTier: 'flex',
  userApprovedMaximumUsd: 0.10,
  totalCostLimitUsd: 0.09,
  researchCostLimitUsd: 0.04,
  writerCostLimitUsd: 0.055,
  maxWebSearchCalls: 3,
  searchContextSize: 'low',
  reservedSearchContentTokens: 50_000,
  maxResearchOutputTokens: 1_200,
  maxWriterOutputTokens: 6_000,
  minimumWriterOutputTokens: 4_500,
  flexTokenPriceMultiplier: 0.5,
  maximumResearchSubjects: 18,
  maximumExternalClaims: 8,
  maximumExternalClaimAgeHours: 168,
  maximumFutureClockSkewMinutes: 10,
  maximumSources: 20,
  pricingAsOf: '2026-10-04',
  maximumPricingAgeDays: 31,
  webSearchCallCostUsd: 0.01,
  modelPricingPerMillionTokens: {
    'gpt-6-luna': { input: 0.10, cachedInput: 0.01, cacheWriteInput: 0.125, output: 0.50 },
    'gpt-5.6-terra': { input: 2.00, cachedInput: 0.20, cacheWriteInput: 2.50, output: 12.00 }
  },
  userLocation: {
    type: 'approximate',
    country: 'US',
    city: 'Chicago',
    region: 'Illinois',
    timezone: 'America/Chicago'
  },
  sourceTrust: {
    primaryDomains: [
      'nfl.com', 'buffalobills.com', 'miamidolphins.com', 'patriots.com', 'newyorkjets.com',
      'baltimoreravens.com', 'bengals.com', 'clevelandbrowns.com', 'steelers.com',
      'houstontexans.com', 'colts.com', 'jaguars.com', 'tennesseetitans.com',
      'denverbroncos.com', 'chiefs.com', 'raiders.com', 'chargers.com',
      'dallascowboys.com', 'giants.com', 'philadelphiaeagles.com', 'commanders.com',
      'chicagobears.com', 'detroitlions.com', 'packers.com', 'vikings.com',
      'atlantafalcons.com', 'panthers.com', 'neworleanssaints.com', 'buccaneers.com',
      'azcardinals.com', 'therams.com', '49ers.com', 'seahawks.com'
    ],
    establishedDomains: [
      'espn.com', 'cbssports.com', 'sports.yahoo.com', 'apnews.com', 'reuters.com',
      'nbcsports.com', 'foxsports.com', 'si.com', 'theathletic.com',
      'pro-football-reference.com', 'rotowire.com', 'fantasypros.com'
    ],
    leadOnlyDomains: [
      'reddit.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com',
      'tiktok.com', 'youtube.com', 'threads.net'
    ]
  }
});

export function assertPricingCurrent(at = new Date(), config = PRESS_V2_CONFIG) {
  const checkedAt = at instanceof Date ? at : new Date(at);
  const pricedAt = new Date(`${config.pricingAsOf}T00:00:00.000Z`);
  const ageDays = (checkedAt.getTime() - pricedAt.getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < -1 || ageDays > config.maximumPricingAgeDays) {
    throw new Error(`Press V2 pricing is ${Number.isFinite(ageDays) ? Math.floor(ageDays) : 'an unknown number of'} days old. Refresh config.mjs pricing before any paid request.`);
  }
  return { pricingAsOf: config.pricingAsOf, checkedAt: checkedAt.toISOString(), ageDays: Math.max(0, ageDays) };
}
