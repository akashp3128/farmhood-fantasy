export function sampleWeekInput() {
  return {
    league: {
      leagueId: 'farmhood-test',
      name: 'Farmhood Test League',
      season: 2026,
      week: 3,
      phase: 'final',
      capturedAt: '2026-09-29T14:00:00.000Z'
    },
    sources: [
      {
        sourceId: 'sleeper-w1',
        provider: 'Sleeper',
        dataset: 'league matchups week 1',
        retrievedAt: '2026-09-16T14:00:00.000Z',
        observedAt: '2026-09-16T14:00:00.000Z',
        finality: 'final',
        uri: 'https://api.sleeper.app/v1/league/farmhood-test/matchups/1'
      },
      {
        sourceId: 'sleeper-w2',
        provider: 'Sleeper',
        dataset: 'league matchups week 2',
        retrievedAt: '2026-09-23T14:00:00.000Z',
        observedAt: '2026-09-23T14:00:00.000Z',
        finality: 'final',
        uri: 'https://api.sleeper.app/v1/league/farmhood-test/matchups/2'
      },
      {
        sourceId: 'sleeper-w3-pre',
        provider: 'Sleeper',
        dataset: 'pregame projections week 3',
        retrievedAt: '2026-09-24T14:00:00.000Z',
        observedAt: '2026-09-24T14:00:00.000Z',
        finality: 'provisional'
      },
      {
        sourceId: 'sleeper-w3',
        provider: 'Sleeper',
        dataset: 'league matchups week 3',
        retrievedAt: '2026-09-29T13:58:00.000Z',
        observedAt: '2026-09-29T13:58:00.000Z',
        finality: 'final',
        uri: 'https://api.sleeper.app/v1/league/farmhood-test/matchups/3'
      },
      {
        sourceId: 'farmhood-history',
        provider: 'Farmhood verified archive',
        dataset: 'historical results and champions',
        retrievedAt: '2026-09-29T13:00:00.000Z',
        observedAt: '2026-09-29T13:00:00.000Z',
        finality: 'historical',
        licenseClass: 'first-party'
      }
    ],
    managers: [
      { managerId: 'alpha', displayName: 'Alpha_One', ownerId: 'owner-1', rosterId: '1' },
      { managerId: 'beta', displayName: 'BetaTwo', ownerId: 'owner-2', rosterId: '2' },
      { managerId: 'gamma', displayName: 'Gamma', ownerId: 'owner-3', rosterId: '3' },
      { managerId: 'delta', displayName: 'Delta', ownerId: 'owner-4', rosterId: '4' }
    ],
    players: [
      { playerId: 'a-qb', fullName: 'Aaron Accurate', position: 'QB', nflTeam: 'CHI', externalIds: { gsis: '00-0001' } },
      { playerId: 'a-rb', fullName: 'Runner Alpha', position: 'RB', nflTeam: 'CHI' },
      { playerId: 'a-bench', fullName: 'Bench Bolt', position: 'RB', nflTeam: 'GB' },
      { playerId: 'b-qb', fullName: 'Beta Passer', position: 'QB', nflTeam: 'DET' },
      { playerId: 'b-wr', fullName: 'Beta Receiver', position: 'WR', nflTeam: 'DET' },
      { playerId: 'g-qb', fullName: 'Gamma Gunner', position: 'QB', nflTeam: 'MIN' },
      { playerId: 'g-wr', fullName: 'Gamma Star', position: 'WR', nflTeam: 'MIN' },
      { playerId: 'd-qb', fullName: 'Delta Passer', position: 'QB', nflTeam: 'GB' },
      { playerId: 'd-rb', fullName: 'Delta Runner', position: 'RB', nflTeam: 'GB' }
    ],
    currentWeek: {
      sourceIds: ['sleeper-w3'],
      matchups: [
        {
          matchupId: 1,
          startedAtCapture: true,
          teams: [
            {
              managerId: 'alpha',
              score: 120,
              projection: { value: 110, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] },
              starters: [
                { playerId: 'a-qb', slot: 'QB', points: 30, projection: { value: 20, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] } },
                { playerId: 'a-rb', slot: 'RB', points: 15, projection: { value: 15, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] } }
              ],
              bench: [
                { playerId: 'a-bench', points: 28, projection: { value: 14, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] }, eligibleSlots: ['RB', 'FLEX'], availableAtLock: true }
              ]
            },
            {
              managerId: 'beta',
              score: 118,
              projection: { value: 125, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] },
              starters: [
                { playerId: 'b-qb', slot: 'QB', points: 25, projection: { value: 27, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] } },
                { playerId: 'b-wr', slot: 'WR', points: 10, projection: { value: 18, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] }, injuryStatus: 'Questionable', injuryAsOf: '2026-09-27T16:00:00.000Z', injurySourceIds: ['sleeper-w3'] }
              ],
              bench: []
            }
          ]
        },
        {
          matchupId: 2,
          startedAtCapture: true,
          teams: [
            {
              managerId: 'gamma',
              score: 160,
              projection: { value: 140, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] },
              starters: [
                { playerId: 'g-qb', slot: 'QB', points: 35, projection: { value: 30, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] } },
                { playerId: 'g-wr', slot: 'WR', points: 45, projection: { value: 25, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] } }
              ],
              bench: []
            },
            {
              managerId: 'delta',
              score: 80,
              projection: { value: 100, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] },
              starters: [
                { playerId: 'd-qb', slot: 'QB', points: 12, projection: { value: 20, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] } },
                { playerId: 'd-rb', slot: 'RB', points: 3, projection: { value: 15, kind: 'pregame', asOf: '2026-09-24T14:00:00.000Z', sourceIds: ['sleeper-w3-pre'] }, injuryStatus: 'Out', injuryAsOf: '2026-09-27T17:00:00.000Z', injurySourceIds: ['sleeper-w3'] }
              ],
              bench: []
            }
          ]
        }
      ]
    },
    seasonWeeks: [
      {
        week: 1,
        final: true,
        sourceIds: ['sleeper-w1'],
        matchups: [
          { matchupId: 1, teams: [{ managerId: 'alpha', score: 100 }, { managerId: 'beta', score: 90 }] },
          { matchupId: 2, teams: [{ managerId: 'gamma', score: 105 }, { managerId: 'delta', score: 95 }] }
        ]
      },
      {
        week: 2,
        final: true,
        sourceIds: ['sleeper-w2'],
        matchups: [
          { matchupId: 1, teams: [{ managerId: 'alpha', score: 95 }, { managerId: 'gamma', score: 110 }] },
          { matchupId: 2, teams: [{ managerId: 'beta', score: 130 }, { managerId: 'delta', score: 120 }] }
        ]
      },
      {
        week: 3,
        final: true,
        sourceIds: ['sleeper-w3'],
        matchups: [
          { matchupId: 1, teams: [{ managerId: 'alpha', score: 120 }, { managerId: 'beta', score: 118 }] },
          { matchupId: 2, teams: [{ managerId: 'gamma', score: 160 }, { managerId: 'delta', score: 80 }] }
        ]
      }
    ],
    history: {
      sourceIds: ['farmhood-history'],
      teamWeekScores: [
        { season: 2025, week: 1, score: 60 },
        { season: 2025, week: 2, score: 80 },
        { season: 2025, week: 3, score: 100 },
        { season: 2025, week: 4, score: 120 },
        { season: 2025, week: 5, score: 140 }
      ],
      championships: [
        { season: 2024, managerId: 'gamma' },
        { season: 2025, managerId: 'gamma' },
        { season: 2023, managerId: 'alpha' }
      ],
      headToHeadBeforeSeason: [
        { managerAId: 'alpha', managerBId: 'beta', winsA: 4, winsB: 4, ties: 0 },
        { managerAId: 'gamma', managerBId: 'delta', winsA: 5, winsB: 2, ties: 0 }
      ]
    }
  };
}
