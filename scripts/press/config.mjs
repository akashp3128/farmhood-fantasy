export const PRESS_SCHEMA_VERSION = 1;
export const PROMPT_VERSION = 'farmhood-press-v2-cost-guarded';
export const PREDICTION_MODEL = 'farmhood-deterministic-v1';

export const PRESS_CONFIG = Object.freeze({
  season: 2026,
  leagueId: '1377086848295260160',
  teamCount: 12,
  regularSeasonWeeks: 14,
  sleeperApiRoot: 'https://api.sleeper.app',
  sleeperV1Root: 'https://api.sleeper.app/v1',
  openaiApiRoot: 'https://api.openai.com/v1',
  openaiModel: 'gpt-5.6-terra',
  maxOutputTokens: 3500,
  maxRequestCharacters: 28000,
  maxEstimatedCostUsd: 0.1,
  pricingAsOf: '2026-09-08',
  modelPricingPerMillionTokens: Object.freeze({
    'gpt-6-astra': Object.freeze({ input: 10, cachedInput: 1, cacheWriteInput: 12.5, output: 50 }),
    'gpt-5.6-terra': Object.freeze({ input: 2, cachedInput: 0.2, cacheWriteInput: 2.5, output: 12 }),
    'gpt-5.6-luna': Object.freeze({ input: 0.2, cachedInput: 0.02, cacheWriteInput: 0.25, output: 1.2 })
  }),
  projectionLogisticScale: 18,
  minimumProjectionCoverage: 0.8,
  byline: 'Farmhood Intelligence Desk',
  tone: 'Sportswriter credibility with spicy group-chat energy',
  ownerNames: Object.freeze({
    '79220990290575360': 'Blumbo',
    '87253894098731008': 'turi70',
    '89787120084205568': 'akaaashh',
    '92288423205158912': 'cuch',
    '92391164216754176': 'martinch94',
    '450705025862201344': 'Archibaldo',
    '450707444838952960': 'jwislek_20',
    '450755017129848832': 'Siccboi',
    '450905805542125568': 'maco71',
    '450908261617496064': 'pgorny',
    '463423832728793088': 'sidjunlee',
    '464552386170449920': 'vpitello34'
  }),
  rosterNames: Object.freeze({
    1: 'Blumbo',
    2: 'akaaashh',
    3: 'Archibaldo',
    4: 'jwislek_20',
    5: 'cuch',
    6: 'martinch94',
    7: 'turi70',
    8: 'Siccboi',
    9: 'maco71',
    10: 'pgorny',
    11: 'sidjunlee',
    12: 'vpitello34'
  })
});

export const ELIGIBLE_POSITIONS = Object.freeze({
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  K: ['K'],
  DEF: ['DEF'],
  DL: ['DL'],
  LB: ['LB'],
  DB: ['DB'],
  IDP: ['DL', 'LB', 'DB']
});

export const ZERO_PROJECTION_INJURY_STATUSES = new Set([
  'out',
  'inactive',
  'ir',
  'pup',
  'suspended'
]);
