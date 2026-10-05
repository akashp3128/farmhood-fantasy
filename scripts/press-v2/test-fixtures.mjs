import { PRESS_V2_BYLINE, PRESS_V2_CONTRACT_VERSION, PRESS_V2_DESK_SECTIONS } from './editorial-schema.mjs';

export const TEST_MANAGERS = Object.freeze([
  'Blumbo', 'turi70', 'akaaashh', 'cuch', 'martinch94', 'Archibaldo',
  'jwislek_20', 'Siccboi', 'maco71', 'pgorny', 'sidjunlee', 'vpitello34'
]);

export const TEST_FACT_IDS = Object.freeze([
  'week:4:league-summary',
  'week:4:standings',
  'week:4:receipts',
  'week:4:availability',
  'week:4:sunday-watch',
  'week:4:m1', 'week:4:m2', 'week:4:m3', 'week:4:m4', 'week:4:m5', 'week:4:m6',
  'history:Siccboi:2025'
]);

export function testContext(edition = 'recap') {
  return {
    edition,
    factIds: [...TEST_FACT_IDS],
    managerNames: [...TEST_MANAGERS],
    playerNames: ['Bijan Robinson', 'Jaxon Smith-Njigba', 'Lamar Jackson'],
    matchupIds: [1, 2, 3, 4, 5, 6],
    matchupManagers: {
      1: ['Siccboi', 'sidjunlee'],
      2: ['Archibaldo', 'Blumbo'],
      3: ['maco71', 'pgorny'],
      4: ['akaaashh', 'turi70'],
      5: ['cuch', 'vpitello34'],
      6: ['jwislek_20', 'martinch94']
    },
    factMatchupIds: {
      'week:4:m1': 1,
      'week:4:m2': 2,
      'week:4:m3': 3,
      'week:4:m4': 4,
      'week:4:m5': 5,
      'week:4:m6': 6
    },
    factKinds: {
      'week:4:m1': 'matchup_result', 'week:4:m2': 'matchup_result', 'week:4:m3': 'matchup_result',
      'week:4:m4': 'matchup_result', 'week:4:m5': 'matchup_result', 'week:4:m6': 'matchup_result'
    },
    factTags: { 'history:Siccboi:2025': ['history'] },
    factManagerNames: {},
    historyFactIds: ['history:Siccboi:2025'],
    verifiedQuoteFactIds: [],
    verifiedIntentFactIds: [],
    verifiedCausalFactIds: [],
    cooldownPhrases: ['commissioner schedules the headlines']
  };
}

const cited = (text, ...factIds) => ({ text, factIds });

function deskSections(edition) {
  const text = {
    turning_points: cited('Siccboi gained 31.4 points above projection from two starters, while Blumbo left 18.2 usable points on the bench.', 'week:4:m1', 'week:4:m2'),
    standings_fallout: cited('Siccboi moved to 4-0 and Blumbo dropped to 2-2, creating a two-game gap at the top of the Week 4 table.', 'week:4:standings'),
    receipt_desk: cited('The Week 4 preview selected four of six winners, with misses in the Blumbo and vpitello34 matchups.', 'week:4:receipts'),
    carries_forward: cited('Siccboi takes a 4-0 record into Week 5 after leading the 2025 regular season in average points, while pgorny enters the next slate at 1-3 with 389.6 season points.', 'week:4:standings', 'history:Siccboi:2025'),
    thursday_headline: cited('Siccboi banked 27.8 Thursday points, and the remaining starters carry a 116.4 estimated final into the weekend.', 'week:4:m1'),
    availability_desk: cited('Blumbo has one Questionable starter, while akaaashh has 13.4 projected bench points available before Sunday kickoff.', 'week:4:availability'),
    standings_stakes: cited('A Siccboi win would create a 4-0 start, while Blumbo can preserve a share of first place at 3-1.', 'week:4:standings'),
    sunday_watch: cited('Lamar Jackson carries 24.1 projected points into Sunday and represents 19% of sidjunlee’s estimated final.', 'week:4:sunday-watch')
  };
  return PRESS_V2_DESK_SECTIONS[edition].map((kind, index) => ({
    kind,
    headline: kind.split('_').map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(' '),
    subjects: index === 0 ? ['Siccboi', 'Blumbo'] : index === 1 ? ['pgorny'] : index % 2 === 0 ? ['Siccboi', 'Blumbo'] : ['pgorny'],
    matchupIds: index === 0 ? [1, 2] : index === 1 ? [3] : [],
    body: [text[kind]]
  }));
}

export function validArticle(edition = 'recap') {
  const recap = edition === 'recap';
  return {
    contractVersion: PRESS_V2_CONTRACT_VERSION,
    edition,
    title: recap
      ? 'Week 4 Recap: Siccboi Separates From a Crowded Field'
      : 'Week 4 Weekend Outlook: Siccboi Banks the First Advantage',
    dek: recap
      ? 'A 4-0 leader emerged, the preview finished 4-for-6, and two lineup decisions reshaped the Week 4 table.'
      : 'Thursday points moved one matchup, three Questionable starters remain, and the first-place race reaches Sunday with a narrow spread.',
    byline: PRESS_V2_BYLINE,
    thesis: cited(
      recap
        ? 'Week 4 belonged to Siccboi, whose 146.8 points created the league’s only 4-0 record and the clearest early separation in the standings.'
        : 'Thursday gave Siccboi a 27.8-point start, but five unresolved matchups keep the Week 4 standings race open through Monday.',
      'week:4:league-summary', 'week:4:standings'
    ),
    lead: [
      cited('Siccboi finished at 146.8 points, 18.6 above the next-highest team, and converted that total into a fourth consecutive win.', 'week:4:league-summary', 'week:4:m1'),
      cited('Blumbo fell to 2-2 after a 6.4-point loss, while pgorny’s 1-3 record left a two-game division between the top and bottom groups.', 'week:4:m2', 'week:4:standings')
    ],
    mainEvent: {
      headline: 'Siccboi Turns a Tight Projection Into Week 4 Control',
      subjects: ['Siccboi', 'sidjunlee'],
      matchupIds: [1],
      body: [
        cited('Siccboi defeated sidjunlee 146.8-119.4 after entering the week with a 2.7-point projection edge. The final 27.4-point margin made the matchup far less balanced than its opening line.', 'week:4:m1'),
        cited('Bijan Robinson supplied 31.2 points for Siccboi, and three additional starters crossed 18.0. sidjunlee received 25.6 from Lamar Jackson but only 12.4 from the two FLEX positions.', 'week:4:m1')
      ]
    },
    supportingStories: [
      {
        headline: 'Blumbo’s Bench Leaves a Six-Point Result Exposed',
        subjects: ['Blumbo', 'Archibaldo'],
        matchupIds: [2],
        body: [
          cited('Archibaldo beat Blumbo 111.6-105.2 in the closest Week 4 final. Blumbo had 18.2 points from an eligible bench receiver while the final FLEX starter scored 7.1.', 'week:4:m2'),
          cited('The available swap was worth 11.1 points, larger than the 6.4-point final margin. The verified lineup record makes the decision relevant without assigning Blumbo an unreported motive.', 'week:4:m2')
        ]
      },
      {
        headline: 'A Familiar High-Score Standard Returns',
        subjects: ['maco71', 'pgorny'],
        matchupIds: [3],
        body: [
          cited('maco71 reached 128.2 in a win over pgorny, the second-highest Week 4 score behind Siccboi. Jaxon Smith-Njigba contributed 24.7 to the winning total.', 'week:4:m3'),
          cited('maco71’s 128.2 points made this the week’s second-highest winning total and kept the matchup relevant beyond its final margin.', 'week:4:m3')
        ]
      }
    ],
    deskSections: deskSections(edition),
    aroundLeague: [
      {
        matchupId: 4,
        headline: 'akaaashh Clears 120 in a Controlled Win',
        subjects: ['akaaashh', 'turi70'],
        body: 'akaaashh beat turi70 124.6-108.0 and held an advantage in six of nine starting slots. The 16.6-point margin moved akaaashh to 3-1.',
        factIds: ['week:4:m4', 'week:4:standings']
      },
      {
        matchupId: 5,
        headline: 'cuch Survives the Monday Finish',
        subjects: ['cuch', 'vpitello34'],
        body: 'cuch closed a 118.9-116.3 win after Monday’s final starter added 14.8 points. vpitello34 finished 2.6 short in the third-closest result of Week 4.',
        factIds: ['week:4:m5']
      },
      {
        matchupId: 6,
        headline: 'jwislek_20 Adds a Second Straight Win',
        subjects: ['jwislek_20', 'martinch94'],
        body: 'jwislek_20 defeated martinch94 121.7-99.8 behind four starters above 15 points. The 21.9-point result lifted jwislek_20 to 2-2.',
        factIds: ['week:4:m6', 'week:4:standings']
      }
    ],
    pullQuote: cited('Siccboi’s 146.8 points did more than win a matchup; they created the first real space in the Week 4 standings.', 'week:4:m1', 'week:4:standings'),
    tags: recap ? ['Week 4', 'Recap', 'Standings'] : ['Week 4', 'Weekend Outlook', 'Lineup Watch']
  };
}
