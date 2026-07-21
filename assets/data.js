/* Farmhood Fantasy — embedded, verified, SANITIZED data.
   Source: Sleeper API -> stats.json + fun_2025.json (gates PASS).
   No player nicknames / custom team names / mascot text (NSFW filter). */
window.LEAGUE = {
  meta: {
    name: "Farmhood Fantasy",
    seasonsCompleted: 7,
    firstSeason: 2019,
    latestSeason: 2025,
    upcomingSeason: 2026,
    teams: 12,
    scoring: "Half-PPR",
    reconciliation: "596 W = 596 L",
    reigningChampion: "martinch94"
  },

  // All-time, 2019-2025. games = wins+losses.
  managers: [
    { name:"martinch94",  wins:52, losses:43, pf:10790.94, titles:3, titleYears:[2020,2021,2025] },
    { name:"pgorny",      wins:50, losses:45, pf:10882.40, titles:2, titleYears:[2022,2023] },
    { name:"jwislek_20",  wins:51, losses:44, pf:10551.10, titles:1, titleYears:[2024] },
    { name:"Blumbo",      wins:51, losses:44, pf:10681.86, titles:1, titleYears:[2019] },
    { name:"vpitello34",  wins:53, losses:42, pf:10364.90, titles:0, titleYears:[] },
    { name:"akaaashh",    wins:49, losses:46, pf:10698.72, titles:0, titleYears:[] },
    { name:"maco71",      wins:49, losses:46, pf:10847.32, titles:0, titleYears:[] },
    { name:"Siccboi",     wins:46, losses:49, pf:10378.56, titles:0, titleYears:[] },
    { name:"cuch",        wins:43, losses:52, pf:9988.74,  titles:0, titleYears:[] },
    { name:"Archibaldo",  wins:42, losses:53, pf:10518.03, titles:0, titleYears:[] },
    { name:"sidjunlee",   wins:42, losses:53, pf:10225.20, titles:0, titleYears:[] },
    { name:"turi70",      wins:41, losses:54, pf:9974.44,  titles:0, titleYears:[] }
  ],

  // Sleeper profile avatars (image + display name only; team names/mascot text excluded)
  avatars: {
    "Blumbo":"https://sleepercdn.com/uploads/4ac6275d46501378e7166c537df59462.jpg",
    "turi70":"https://sleepercdn.com/uploads/5bc9fcd0d1bdac88abd955dc2d8b3445.jpg",
    "akaaashh":"https://sleepercdn.com/uploads/3ed7c5da37b66038e8fa233a2f4c62c4.jpg",
    "cuch":"https://sleepercdn.com/uploads/28241616bedbbb29d2a9285bbbc905d7.jpg",
    "martinch94":"https://sleepercdn.com/uploads/7fcabf508fefb22a64683baa5e37a888.jpg",
    "Archibaldo":"https://sleepercdn.com/uploads/1707b722f92dc32f6f368bcf8c8b5c28.jpg",
    "jwislek_20":"https://sleepercdn.com/uploads/8cd97f8e06565c99daada94ecbee5912.jpg",
    "Siccboi":"https://sleepercdn.com/uploads/add0c69cc0a689978695c3f293d22a5d.jpg",
    "maco71":"https://sleepercdn.com/avatars/2b9c6cd4df626407433ed3e399ce5472",
    "pgorny":"https://sleepercdn.com/uploads/02f7aae5c74b544e45926e6d87f2a62b.jpg",
    "sidjunlee":"https://sleepercdn.com/uploads/052ecc2e6107facaa4cdbe60922178d7.jpg",
    "vpitello34":"https://sleepercdn.com/avatars/d8b367a9353d4a1b03b8714233ced278"
  },

  commissioner: "cuch",

  // 2026 draft (from Sleeper draft_id 1377086848312045568). Verified against slot_to_roster_id.
  draft2026: {
    season: 2026, type: "Snake", rounds: 15, teams: 12, scoring: "Half-PPR", status: "pre_draft",
    order: ["vpitello34","maco71","jwislek_20","akaaashh","pgorny","Siccboi",
            "cuch","sidjunlee","martinch94","Archibaldo","Blumbo","turi70"]
  },

  // Playoff appearances, computed from winners_bracket per season (Sleeper era 2019-2025).
  playoffSeasons: 7,
  playoffAppearances: { jwislek_20:5, martinch94:5, pgorny:5, Blumbo:4, akaaashh:4, vpitello34:4, Archibaldo:3, Siccboi:3, turi70:3, maco71:3, cuch:2, sidjunlee:2 },

  // Championship-GAME appearances (finals), ALL-TIME 2014-25.
  // Sleeper era (2019-25) from winners_bracket; Founders era (2014-18) from NFL.com (owner-provided).
  // Joe = former member, 2020 runner-up (Martin's first title). Yogi = 2014 champ (former).
  // TODO: 2014, 2016, 2017, 2018 runner-ups still unknown (need NFL.com records).
  finalsAppearances: [
    { name:"martinch94", app:3, won:3, lost:0 },
    { name:"vpitello34", app:4, won:1, lost:3 },
    { name:"pgorny",     app:3, won:2, lost:1 },
    { name:"Blumbo",     app:2, won:2, lost:0 },
    { name:"akaaashh",   app:2, won:1, lost:1 },
    { name:"jwislek_20", app:2, won:1, lost:1 },
    { name:"Yogi",       app:1, won:1, lost:0 },
    { name:"Siccboi",    app:1, won:1, lost:0 },
    { name:"maco71",     app:1, won:0, lost:1 },
    { name:"Joe",        app:1, won:0, lost:1 },
    { name:"Archibaldo", app:0, won:0, lost:0 },
    { name:"cuch",       app:0, won:0, lost:0 },
    { name:"turi70",     app:0, won:0, lost:0 },
    { name:"sidjunlee",  app:0, won:0, lost:0 }
  ],
  foundersRunnersUp: { "2015":"akaaashh" },  // 2014/2016/2017/2018 TBD

  // All-time league winnings ($), 4-season total (payouts)
  winnings: {
    "akaaashh":260, "cuch":185, "turi70":170, "sidjunlee":165, "jwislek_20":1975,
    "Blumbo":295, "pgorny":3650, "Archibaldo":305, "maco71":295, "martinch94":1885,
    "vpitello34":790, "Siccboi":220
  },

  // Founders Era (NFL.com, 2014-2018) — champions only, no game stats survived.
  // Yogi (2014) is a former member no longer in the league.
  foundersChampions: { 2014:"Yogi", 2015:"Siccboi", 2016:"vpitello34", 2017:"akaaashh", 2018:"Blumbo" },
  formerChampions: ["Yogi"],

  championsByYear: {
    2019:"Blumbo", 2020:"martinch94", 2021:"martinch94",
    2022:"pgorny", 2023:"pgorny", 2024:"jwislek_20", 2025:"martinch94"
  },

  seasonResults: {
    2019:{teams:14, games:13, champion:"Blumbo",     runnerNote:"Inaugural season; Blumbo 11-2 wire-to-wire", topRecord:"Blumbo 11-2", mostPoints:"Blumbo"},
    2020:{teams:14, games:13, champion:"martinch94", runnerNote:"martinch94 won from the 6-seed (7-6)", topRecord:"(14-team field)", mostPoints:"pgorny"},
    2021:{teams:12, games:13, champion:"martinch94", runnerNote:"maco71 had best record + most points, martinch94 took the title", topRecord:"maco71 10-3", mostPoints:"maco71"},
    2022:{teams:12, games:14, champion:"pgorny",     runnerNote:"sidjunlee 11-3 in the regular season; pgorny won it", topRecord:"sidjunlee 11-3", mostPoints:"vpitello34"},
    2023:{teams:12, games:14, champion:"pgorny",     runnerNote:"pgorny repeats, leading the league in points", topRecord:"pgorny 9-5", mostPoints:"pgorny"},
    2024:{teams:12, games:14, champion:"jwislek_20", runnerNote:"jwislek_20's first ring; vpitello34 top record (10-4)", topRecord:"vpitello34 10-4", mostPoints:"Siccboi"},
    2025:{teams:12, games:14, champion:"martinch94", runnerNote:"martinch94's 3rd title; maco71 most points again", topRecord:"jwislek_20 10-4", mostPoints:"maco71"}
  },

  // ---- 2025 season detail (latest) ----
  names2025: {1:"Blumbo",2:"akaaashh",3:"Archibaldo",4:"jwislek_20",5:"cuch",6:"martinch94",7:"turi70",8:"Siccboi",9:"maco71",10:"pgorny",11:"sidjunlee",12:"vpitello34"},
  standings2025: [
    {rank:1, name:"jwislek_20", w:10,l:4, pf:1602.16},
    {rank:2, name:"martinch94", w:9, l:5, pf:1666.40, champ:true},
    {rank:3, name:"Archibaldo", w:9, l:5, pf:1642.48},
    {rank:4, name:"pgorny",     w:9, l:5, pf:1626.20},
    {rank:5, name:"Blumbo",     w:8, l:6, pf:1700.54},
    {rank:6, name:"maco71",     w:8, l:6, pf:1827.18},
    {rank:7, name:"vpitello34", w:8, l:6, pf:1574.58},
    {rank:8, name:"sidjunlee",  w:6, l:8, pf:1631.24},
    {rank:9, name:"akaaashh",   w:6, l:8, pf:1457.86},
    {rank:10,name:"Siccboi",    w:5, l:9, pf:1409.84},
    {rank:11,name:"cuch",       w:4, l:10,pf:1407.32},
    {rank:12,name:"turi70",     w:2, l:12,pf:1438.48}
  ],
  // weekly [roster_id, matchup_id, points]
  weekly2025: {
    1:[[1,1,127.72],[2,6,111.42],[3,2,152.06],[4,4,123.42],[5,5,76.32],[6,5,95.60],[7,1,93.56],[8,3,81.20],[9,4,105.74],[10,3,100.98],[11,2,134.08],[12,6,81.22]],
    2:[[1,1,81.42],[2,5,133.94],[3,2,91.12],[4,4,115.08],[5,5,98.00],[6,6,118.38],[7,2,153.40],[8,3,110.06],[9,3,145.74],[10,4,105.60],[11,1,133.94],[12,6,85.84]],
    3:[[1,1,101.66],[2,6,80.92],[3,1,124.32],[4,3,97.26],[5,5,64.30],[6,6,120.72],[7,2,141.42],[8,3,116.58],[9,4,114.52],[10,4,154.52],[11,2,114.84],[12,5,101.08]],
    4:[[1,1,157.50],[2,5,113.68],[3,4,156.06],[4,6,141.70],[5,3,80.94],[6,4,143.38],[7,2,75.48],[8,1,80.42],[9,5,142.54],[10,2,98.36],[11,3,108.70],[12,6,132.38]],
    5:[[1,1,108.40],[2,6,111.92],[3,4,99.42],[4,6,117.42],[5,4,91.54],[6,3,146.38],[7,2,107.88],[8,2,139.44],[9,5,157.68],[10,1,130.26],[11,3,119.00],[12,5,94.08]],
    6:[[1,1,138.30],[2,3,89.94],[3,4,104.70],[4,2,124.58],[5,5,117.64],[6,6,118.14],[7,2,73.48],[8,5,121.82],[9,1,122.96],[10,6,105.26],[11,3,118.52],[12,4,128.56]],
    7:[[1,1,139.02],[2,4,97.88],[3,4,115.26],[4,1,94.04],[5,6,161.64],[6,5,133.46],[7,2,121.02],[8,5,57.64],[9,2,159.66],[10,6,112.12],[11,3,83.64],[12,3,103.76]],
    8:[[1,1,154.20],[2,5,103.68],[3,4,69.62],[4,4,129.16],[5,1,119.62],[6,2,101.12],[7,2,71.48],[8,5,101.26],[9,3,177.08],[10,6,110.38],[11,3,152.62],[12,6,107.72]],
    9:[[1,1,152.90],[2,6,70.66],[3,4,116.32],[4,3,94.50],[5,2,154.20],[6,1,131.60],[7,2,83.28],[8,5,129.96],[9,4,87.52],[10,6,97.00],[11,3,93.00],[12,5,121.34]],
    10:[[1,1,101.12],[2,1,126.30],[3,4,119.54],[4,6,151.40],[5,5,66.52],[6,6,107.80],[7,2,92.24],[8,3,98.60],[9,5,157.30],[10,4,134.32],[11,3,141.40],[12,2,120.38]],
    11:[[1,1,69.16],[2,2,144.84],[3,4,141.28],[4,6,94.00],[5,6,121.26],[6,5,105.42],[7,2,135.22],[8,4,88.00],[9,5,102.80],[10,3,83.62],[11,3,71.04],[12,1,97.04]],
    12:[[1,1,133.76],[2,6,77.76],[3,2,77.12],[4,4,87.72],[5,5,99.12],[6,5,89.86],[7,1,97.82],[8,3,79.96],[9,4,124.82],[10,3,160.94],[11,2,149.86],[12,6,154.08]],
    13:[[1,1,121.52],[2,5,108.58],[3,2,147.02],[4,4,116.14],[5,5,79.90],[6,6,137.70],[7,2,93.14],[8,3,104.34],[9,3,92.84],[10,4,111.26],[11,1,83.20],[12,6,141.34]],
    14:[[1,1,113.86],[2,6,86.34],[3,1,128.64],[4,3,115.74],[5,5,76.32],[6,6,116.84],[7,2,99.06],[8,3,100.56],[9,4,135.98],[10,4,121.58],[11,2,127.40],[12,5,105.76]]
  },

  fun2025: {
    motwCounts: {"maco71":4,"Archibaldo":2,"pgorny":2,"Blumbo":2,"cuch":2,"turi70":1,"akaaashh":1},
    highestWeeks: [
      {week:8,name:"maco71",pts:177.08},{week:7,name:"cuch",pts:161.64},
      {week:12,name:"pgorny",pts:160.94},{week:7,name:"maco71",pts:159.66},
      {week:5,name:"maco71",pts:157.68}
    ],
    lowestWeeks: [
      {week:7,name:"Siccboi",pts:57.64},{week:3,name:"cuch",pts:64.30},
      {week:10,name:"cuch",pts:66.52},{week:11,name:"Blumbo",pts:69.16},
      {week:8,name:"Archibaldo",pts:69.62}
    ],
    biggestBlowout: {week:10,winner:"maco71",loser:"cuch",margin:90.78,score:"157.3 – 66.5"},
    closestGame: {week:9,winner:"jwislek_20",loser:"sidjunlee",margin:1.5,score:"94.5 – 93.0"},
    luckIndex: [
      {name:"jwislek_20",actual:10,expected:7.45,luck:2.55},
      {name:"Archibaldo",actual:9,expected:7.64,luck:1.36},
      {name:"pgorny",actual:9,expected:7.73,luck:1.27},
      {name:"vpitello34",actual:8,expected:6.73,luck:1.27},
      {name:"akaaashh",actual:6,expected:5.36,luck:0.64},
      {name:"martinch94",actual:9,expected:8.45,luck:0.55},
      {name:"Siccboi",actual:5,expected:5.00,luck:0.0},
      {name:"Blumbo",actual:8,expected:8.36,luck:-0.36},
      {name:"cuch",actual:4,expected:4.73,luck:-0.73},
      {name:"sidjunlee",actual:6,expected:7.55,luck:-1.55},
      {name:"maco71",actual:8,expected:9.82,luck:-1.82},
      {name:"turi70",actual:2,expected:5.09,luck:-3.09}
    ]
  },

  // ---- narrative storylines (grounded in verified records) ----
  stories: [
    { year:2019, teams:14, champion:"Blumbo",
      headline:"A champion from day one",
      tags:["Inaugural season","11-2","Wire-to-wire"],
      body:"The very first Farmhood season had a king before it had a history. Blumbo bulldozed a 14-team field to an 11-2 record and led the entire league in scoring, then finished the job in the playoffs. No growing pains, no learning curve — just a flag planted on the league's opening day that everyone has been chasing ever since." },
    { year:2020, teams:14, champion:"martinch94",
      headline:"The 6-seed that caught fire",
      tags:["Cinderella run","Won at 7-6","First ring"],
      body:"martinch94 limped into the playoffs at 7-6 while pgorny lapped the field in points — and then the bracket happened. martinch94 got hot at the exact right moment and walked out with the trophy, the first proof in league lore that the regular season only decides who gets invited to the party. It was also the first brick in what would become the league's only dynasty." },
    { year:2021, teams:12, champion:"martinch94",
      headline:"maco71 was the best team. martinch94 was the champion.",
      tags:["maco71 10-3","Most points","martinch94 repeats"],
      body:"The league trimmed to twelve and maco71 responded with the best season anyone had: a 10-3 record AND the most points scored. By every regular-season measure, it was his year. It was not his year. martinch94 (9-4) won it again — back-to-back rings — and the maco71 curse was officially born: be the best, lose the last game that matters." },
    { year:2022, teams:12, champion:"pgorny",
      headline:"sidjunlee's 11-3 and pgorny's first ring",
      tags:["sidjunlee 11-3","Best record loses","pgorny ascends"],
      body:"sidjunlee authored a dominant 11-3 regular season and vpitello34 led the league in points — and neither one lifted the trophy. pgorny did, claiming a first championship and reminding the league of its oldest rule: the best record is a great story, not a title. The top seed had now come up empty in back-to-back-to-back years." },
    { year:2023, teams:12, champion:"pgorny",
      headline:"The complete title defense",
      tags:["pgorny repeats","Led the league in points","Back-to-back"],
      body:"If 2022 was a breakthrough, 2023 was a statement. pgorny led the league in scoring AND finished the job, going back-to-back and joining martinch94 in the multi-ring club. For one stretch, the league had two dynasties running at once — and pgorny's was the one peaking." },
    { year:2024, teams:12, champion:"jwislek_20",
      headline:"The breakthrough",
      tags:["First ring","vpitello34 top seed","Years in the making"],
      body:"vpitello34 took the top record (10-4) into the playoffs — and, in the league's signature move, did not win. Instead it was jwislek_20 finally breaking through for a first championship after years of contending and falling short. Every dynasty needs a challenger who refuses to quit; in 2024 the challenger got his ring." },
    { year:2025, teams:12, champion:"martinch94",
      headline:"The curse, the collapse, and a third crown",
      tags:["martinch94 3rd title","maco71 robbed again","Jim's Monday collapse","turi70 2-12"],
      body:"maco71 scored the most points in a single season the league has ever seen (1,827), won Manager of the Week four times, and posted the highest single week ever (177.1) — then went 8-6 with no title, the unluckiest team in the league by expected wins. But the cruelest twist was the final. jwislek_20 rode the league's best record (10-4) into the championship and went to bed Sunday night all but certain of the trophy — martinch94 had even gotten two zeros out of his own lineup. The catch: jwislek_20 still had three Rams starters left to play. When L.A. took the field Monday night they laid a collective egg, the lead evaporated, and martinch94 escaped with the crown on Monday — his third, the most of anyone, cementing the dynasty. At the bottom, turi70 endured a 2-12 freefall. Same league, same lesson: points are nice, rings are everything." }
  ],

  throughlines: [
    { icon:"📉", title:"The maco71 Curse",
      text:"Best record and most points in 2021. Most points again in 2025 — a single-season record 1,827, plus the most Manager-of-the-Week honors and the highest week. Two of the most dominant regular seasons in league history, zero championships. 2nd-most points all-time, still ringless." },
    { icon:"👑", title:"The martinch94 Dynasty",
      text:"Three rings (2020, 2021, 2025) — more than anyone. Rarely the league's best team on paper, always the one standing at the end. The 2020 run from the 6-seed set the template: survive the regular season, peak in the bracket." },
    { icon:"🥈", title:"The Best-Record Curse",
      text:"2021 maco71 (10-3), 2022 sidjunlee (11-3), 2024 vpitello34 (10-4), 2025 jwislek_20 (10-4) — four straight years the top regular-season team did not win the title. In Farmhood, the regular season is an audition, not a coronation." },
    { icon:"💍", title:"pgorny, the Points King with Proof",
      text:"The all-time scoring leader who also closed: back-to-back titles in 2022–2023, leading the league in points in the second one. The rare manager who turned regular-season firepower into actual hardware." }
  ],

  oddities: [
    { icon:"🍀", title:"The Luck Paradox",
      text:"vpitello34 owns the best win % in league history (.558) and the most fortunate schedule ever recorded (+6.5 wins above expected). He has a ring — the 2016 title — but the summit keeps slipping away: he's lost three championship games in the years since. The luckiest man in the league, and still heartbroken in the games that matter most." },
    { icon:"☠️", title:"Archibaldo, the Truly Cursed",
      text:"Forget the maco71 curse — by the math, Archibaldo is the unluckiest manager the league has ever seen, a staggering −7.1 wins below expectation across seven seasons. He has scored like a contender and finished like a tenant. The schedule has personally wronged this man." },
    { icon:"🎢", title:"turi70's Feast & Famine (2021)",
      text:"In one season turi70 authored both extremes in league history: the biggest blowout ever — 178.1 to 58.9 over sidjunlee (+119.2) — and, weeks earlier, the closest game ever, surviving vpitello34 by 0.18. Nobody has ever swung harder between god and goblin." },
    { icon:"🥈", title:"maco71, the Ringless King",
      text:"maco71 has the second-most points in league history and the highest-scoring single season ever (1,827 in 2025) — and not one championship. In 2021 he had the best record AND the most points, and still didn't win. The most productive manager never to lift the trophy." }
  ]
};
