// Turn the downloaded data into src/data/teams.json: the real clubs from the latest season of each league, each
// with its real squad.
//   npm run fetch-data      (once: league results and the transfermarkt squads)
//   npm run build-teams
//
// Club strength comes from how each club actually did (goal difference and points per game, football-data.co.uk).
// Squads come from transfermarkt-datasets (CC0, github.com/dcaribou/transfermarkt-datasets): name, position,
// nationality, foot, height, date of birth and market value. Nobody publishes 1-20 attributes, so they are derived:
// the club's strength sets the level, a player's market value within the squad sets how far above or below it he is,
// and his exact position, height and age shape the profile. Every attribute can be edited in the app.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(root, 'data', 'football-data');
const TM = path.join(root, 'data', 'transfermarkt');
const OUT = path.join(root, 'src', 'data', 'teams.json');
const SEASON_DAY = Date.UTC(2026, 0, 1); // ages are taken mid-season

const LEAGUE_NAMES = { E0: 'Premier League', SP1: 'La Liga', D1: 'Bundesliga', I1: 'Serie A', F1: 'Ligue 1' };

// football-data.co.uk name → [transfermarkt club id, kit colour, second colour]
const CLUBS = {
  // Premier League
  'Arsenal': [11, '#EF0107', '#FFFFFF'], 'Man City': [281, '#6CABDD', '#1C2C5B'], 'Man United': [985, '#DA291C', '#FFFFFF'],
  'Aston Villa': [405, '#670E36', '#95BFE5'], 'Liverpool': [31, '#C8102E', '#FFFFFF'], 'Bournemouth': [989, '#DA291C', '#000000'],
  'Sunderland': [289, '#EB172B', '#FFFFFF'], 'Brighton': [1237, '#0057B8', '#FFFFFF'], 'Brentford': [1148, '#E30613', '#FFFFFF'],
  'Chelsea': [631, '#034694', '#FFFFFF'], 'Fulham': [931, '#FFFFFF', '#000000'], 'Newcastle': [762, '#241F20', '#FFFFFF'],
  'Everton': [29, '#003399', '#FFFFFF'], 'Leeds': [399, '#FFFFFF', '#1D428A'], 'Crystal Palace': [873, '#1B458F', '#C4122E'],
  "Nott'm Forest": [703, '#DD0000', '#FFFFFF'], 'Tottenham': [148, '#FFFFFF', '#132257'], 'West Ham': [379, '#7A263A', '#1BB1E7'],
  'Burnley': [1132, '#6C1D45', '#99D6EA'], 'Wolves': [543, '#FDB913', '#231F20'],
  // La Liga
  'Barcelona': [131, '#A50044', '#004D98'], 'Real Madrid': [418, '#FFFFFF', '#FEBE10'], 'Villarreal': [1050, '#FFE667', '#005187'],
  'Ath Madrid': [13, '#CB3524', '#FFFFFF'], 'Betis': [150, '#00954C', '#FFFFFF'], 'Celta': [940, '#8AC3EE', '#FFFFFF'],
  'Getafe': [3709, '#005999', '#FFFFFF'], 'Vallecano': [367, '#FFFFFF', '#E53027'], 'Valencia': [1049, '#FFFFFF', '#EE3524'],
  'Sociedad': [681, '#0067B1', '#FFFFFF'], 'Espanol': [714, '#007FC8', '#FFFFFF'], 'Ath Bilbao': [621, '#EE2523', '#FFFFFF'],
  'Elche': [1531, '#FFFFFF', '#05642C'], 'Alaves': [1108, '#0761AF', '#FFFFFF'], 'Sevilla': [368, '#FFFFFF', '#D71920'],
  'Osasuna': [331, '#D91A21', '#0A346F'], 'Mallorca': [237, '#E20613', '#000000'], 'Levante': [3368, '#B4053F', '#004F9F'],
  'Girona': [12321, '#CD2534', '#FFFFFF'], 'Oviedo': [2497, '#0057A5', '#FFFFFF'],
  // Bundesliga
  'Bayern Munich': [27, '#DC052D', '#FFFFFF'], 'Dortmund': [16, '#FDE100', '#000000'], 'RB Leipzig': [23826, '#FFFFFF', '#DD0741'],
  'Stuttgart': [79, '#FFFFFF', '#E32219'], 'Hoffenheim': [533, '#1961B5', '#FFFFFF'], 'Leverkusen': [15, '#E32221', '#000000'],
  'Freiburg': [60, '#E2001A', '#000000'], 'Ein Frankfurt': [24, '#E1000F', '#000000'], 'Augsburg': [167, '#BA3733', '#FFFFFF'],
  'Mainz': [39, '#C3141E', '#FFFFFF'], 'Union Berlin': [89, '#EB1923', '#FFFFFF'], "M'gladbach": [18, '#FFFFFF', '#00B140'],
  'Hamburg': [41, '#FFFFFF', '#0A3F86'], 'FC Koln': [3, '#FFFFFF', '#ED1C24'], 'Werder Bremen': [86, '#1D9053', '#FFFFFF'],
  'Wolfsburg': [82, '#65B32E', '#FFFFFF'], 'Heidenheim': [2036, '#E30613', '#003B79'], 'St Pauli': [35, '#624839', '#FFFFFF'],
  // Serie A
  'Inter': [46, '#0068A8', '#000000'], 'Napoli': [6195, '#12A0D7', '#FFFFFF'], 'Roma': [12, '#8E1F2F', '#F0BC42'],
  'Como': [1047, '#1A3F8F', '#FFFFFF'], 'Milan': [5, '#FB090B', '#000000'], 'Juventus': [506, '#FFFFFF', '#000000'],
  'Atalanta': [800, '#1E71B8', '#000000'], 'Bologna': [1025, '#A21C26', '#1A2F48'], 'Lazio': [398, '#87D8F7', '#FFFFFF'],
  'Udinese': [410, '#FFFFFF', '#000000'], 'Sassuolo': [6574, '#00A752', '#000000'], 'Parma': [130, '#FFFFFF', '#1B1B1B'],
  'Torino': [416, '#8A1E03', '#FFFFFF'], 'Cagliari': [1390, '#A6192E', '#002350'], 'Fiorentina': [430, '#482E92', '#FFFFFF'],
  'Genoa': [252, '#A71930', '#002B5C'], 'Lecce': [1005, '#FFED00', '#E30613'], 'Cremonese': [2239, '#C8102E', '#808080'],
  'Verona': [276, '#FFD100', '#003D7C'], 'Pisa': [4172, '#000000', '#0055A4'],
  // Ligue 1
  'Paris SG': [583, '#004170', '#DA291C'], 'Lens': [826, '#FFD700', '#E30613'], 'Lille': [1082, '#E01E13', '#20325F'],
  'Lyon': [1041, '#FFFFFF', '#14387F'], 'Marseille': [244, '#FFFFFF', '#2FAEE0'], 'Rennes': [273, '#E13327', '#000000'],
  'Monaco': [162, '#E7192F', '#FFFFFF'], 'Strasbourg': [667, '#009FE3', '#FFFFFF'], 'Toulouse': [415, '#5B2D8E', '#FFFFFF'],
  'Lorient': [1158, '#F58113', '#000000'], 'Paris FC': [10004, '#1D2F5B', '#FFFFFF'], 'Brest': [3911, '#E30613', '#FFFFFF'],
  'Angers': [1420, '#000000', '#FFFFFF'], 'Le Havre': [738, '#1D9AD6', '#002D5F'], 'Auxerre': [290, '#FFFFFF', '#0057A3'],
  'Nice': [417, '#C8102E', '#000000'], 'Nantes': [995, '#FCD405', '#00843D'], 'Metz': [347, '#7B0F27', '#FFFFFF'],
};

// Citizenship as transfermarkt writes it → flag code (ISO 3166, with gb-eng/gb-sct/gb-wls/gb-nir for the home nations).
const FLAGS = {
  'Albania': 'al', 'Algeria': 'dz', 'Andorra': 'ad', 'Angola': 'ao', 'Argentina': 'ar', 'Armenia': 'am', 'Australia': 'au',
  'Austria': 'at', 'Bangladesh': 'bd', 'Belgium': 'be', 'Benin': 'bj', 'Bosnia-Herzegovina': 'ba', 'Brazil': 'br',
  'Bulgaria': 'bg', 'Burkina Faso': 'bf', 'Burundi': 'bi', 'Cameroon': 'cm', 'Canada': 'ca', 'Cape Verde': 'cv',
  'Central African Republic': 'cf', 'Chile': 'cl', 'China': 'cn', 'Colombia': 'co', 'Comoros': 'km', 'Congo': 'cg',
  "Cote d'Ivoire": 'ci', 'Costa Rica': 'cr', 'Croatia': 'hr', 'Cuba': 'cu', 'Curacao': 'cw', 'Cyprus': 'cy',
  'Czech Republic': 'cz', 'DR Congo': 'cd', 'Denmark': 'dk', 'Dominican Republic': 'do', 'Ecuador': 'ec', 'Egypt': 'eg',
  'England': 'gb-eng', 'Equatorial Guinea': 'gq', 'Estonia': 'ee', 'Finland': 'fi', 'France': 'fr', 'French Guiana': 'gf',
  'Gabon': 'ga', 'Georgia': 'ge', 'Germany': 'de', 'Ghana': 'gh', 'Greece': 'gr', 'Guadeloupe': 'gp', 'Guinea': 'gn',
  'Guinea-Bissau': 'gw', 'Haiti': 'ht', 'Honduras': 'hn', 'Hungary': 'hu', 'Iceland': 'is', 'Indonesia': 'id', 'Iran': 'ir',
  'Iraq': 'iq', 'Ireland': 'ie', 'Israel': 'il', 'Italy': 'it', 'Jamaica': 'jm', 'Japan': 'jp', 'Jordan': 'jo', 'Kenya': 'ke',
  'Korea, South': 'kr', 'Kosovo': 'xk', 'Latvia': 'lv', 'Lebanon': 'lb', 'Libya': 'ly', 'Lithuania': 'lt', 'Luxembourg': 'lu',
  'Madagascar': 'mg', 'Malaysia': 'my', 'Mali': 'ml', 'Malta': 'mt', 'Martinique': 'mq', 'Mauritania': 'mr', 'Mexico': 'mx',
  'Moldova': 'md', 'Montenegro': 'me', 'Morocco': 'ma', 'Mozambique': 'mz', 'Netherlands': 'nl', 'New Zealand': 'nz',
  'Niger': 'ne', 'Nigeria': 'ng', 'North Macedonia': 'mk', 'Northern Ireland': 'gb-nir', 'Norway': 'no', 'Panama': 'pa',
  'Paraguay': 'py', 'Peru': 'pe', 'Philippines': 'ph', 'Poland': 'pl', 'Portugal': 'pt', 'Romania': 'ro', 'Russia': 'ru',
  'Saudi Arabia': 'sa', 'Scotland': 'gb-sct', 'Senegal': 'sn', 'Serbia': 'rs', 'Sierra Leone': 'sl', 'Slovakia': 'sk',
  'Slovenia': 'si', 'South Africa': 'za', 'Spain': 'es', 'Suriname': 'sr', 'Sweden': 'se', 'Switzerland': 'ch', 'Syria': 'sy',
  'Tanzania': 'tz', 'Thailand': 'th', 'The Gambia': 'gm', 'Togo': 'tg', 'Trinidad and Tobago': 'tt', 'Tunisia': 'tn',
  'Türkiye': 'tr', 'Ukraine': 'ua', 'United States': 'us', 'Uruguay': 'uy', 'Uzbekistan': 'uz', 'Venezuela': 've',
  'Wales': 'gb-wls', 'Zambia': 'zm', 'Zimbabwe': 'zw',
};

const ATTRS = ['pace', 'stamina', 'passing', 'vision', 'dribbling', 'shooting', 'heading', 'tackling', 'positioning', 'keeping'];
const ROLE = { Goalkeeper: 'GK', Defender: 'DF', Midfield: 'MF', Attack: 'FW' };
// The same broad shape the engine gives generated players, then the exact position on top.
const ROLE_BIAS = {
  GK: { keeping: 6.5, positioning: 2, shooting: -8, dribbling: -6, tackling: -6, heading: -2, pace: -3 },
  DF: { tackling: 4, positioning: 3, heading: 3, shooting: -4, dribbling: -2 },
  MF: { passing: 4, vision: 3, stamina: 2 },
  FW: { shooting: 4, dribbling: 3, pace: 2, tackling: -4, positioning: -1 },
};
const SUB_BIAS = {
  'Centre-Back': { heading: 1, tackling: 1, dribbling: -1 },
  'Left-Back': { pace: 2, stamina: 2, passing: 1, heading: -2 }, 'Right-Back': { pace: 2, stamina: 2, passing: 1, heading: -2 },
  'Defensive Midfield': { tackling: 3, positioning: 2, shooting: -2, dribbling: -1 },
  'Central Midfield': { stamina: 1, passing: 1 },
  'Attacking Midfield': { vision: 2, dribbling: 2, shooting: 1, tackling: -3 },
  'Left Midfield': { pace: 2, stamina: 1, tackling: -1 }, 'Right Midfield': { pace: 2, stamina: 1, tackling: -1 },
  'Left Winger': { pace: 2, dribbling: 1, heading: -2, tackling: -1 }, 'Right Winger': { pace: 2, dribbling: 1, heading: -2, tackling: -1 },
  'Centre-Forward': { shooting: 1, heading: 1, dribbling: -1, passing: -1 },
  'Second Striker': { vision: 1, dribbling: 1, shooting: 1 },
};
const SIDE = { 'Left-Back': 'L', 'Left Midfield': 'L', 'Left Winger': 'L', 'Right-Back': 'R', 'Right Midfield': 'R', 'Right Winger': 'R' };
const QUOTA = { GK: 2, DF: 7, MF: 6, FW: 5 }; // 20 players: an XI and a bench of nine

function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const table = rows => { const [h, ...b] = rows; return b.map(r => Object.fromEntries(h.map((k, i) => [k.trim(), r[i]]))); };

// Three-letter code: "Man City" → MCI, "Nott'm Forest" → NFO, "Arsenal" → ARS.
function shortCode(name, taken) {
  const words = name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
  const tries = words.length > 1
    ? [words[0][0] + words[1].slice(0, 2), words[0][0] + words[1][0] + (words[2] || words[1])[words[2] ? 0 : 1], words[0].slice(0, 2) + words[1][0], words[0].slice(0, 3)]
    : [words[0].slice(0, 3), words[0][0] + words[0].slice(2, 4), words[0][0] + words[0][1] + words[0].at(-1)];
  for (const t of tries) { const c = t.toUpperCase(); if (c.length === 3 && !taken.has(c)) { taken.add(c); return c; } }
  for (let i = 2; ; i++) { const c = words[0].slice(0, 2).toUpperCase() + i; if (!taken.has(c)) { taken.add(c); return c; } }
}

// Small stable variation per player, so two players with the same profile still differ a little.
function jitter(id, k) { let h = (id * 2654435761 + k * 40503) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; return (h % 1000) / 1000 - 0.5; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 20 players: the most valuable at each position up to the quota, topped up from the rest if a position is short.
function pickSquad(list) {
  const byRole = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of list) byRole[p.role].push(p);
  for (const r in byRole) byRole[r].sort((a, b) => b.value - a.value);
  const squad = [];
  for (const r in QUOTA) squad.push(...byRole[r].splice(0, QUOTA[r]));
  const rest = Object.values(byRole).flat().filter(p => p.role !== 'GK').sort((a, b) => b.value - a.value);
  while (squad.length < 20 && rest.length) squad.push(rest.shift());
  return squad;
}

function attributes(p, level) {
  const a = {};
  const age = p.born ? (SEASON_DAY - Date.parse(p.born)) / (365.25 * 864e5) : 26;
  const h = p.height || 182;
  for (const k of ATTRS) {
    let v = level + (ROLE_BIAS[p.role][k] || 0) + ((SUB_BIAS[p.sub] || {})[k] || 0) + 1.6 * jitter(p.id, ATTRS.indexOf(k));
    if (k === 'heading') v += clamp((h - 182) / 3, -3, 3);
    if (k === 'pace') v -= Math.max(0, (h - 189) / 6) + Math.max(0, age - 30) * 0.3;
    if (k === 'stamina') v -= Math.max(0, age - 30) * 0.5;
    if (k === 'positioning' || k === 'vision') v += clamp((age - 24) * 0.3, -1.5, 1.5);
    if (k === 'keeping' && p.role !== 'GK') v = 2 + 3 * (jitter(p.id, 99) + 0.5);
    a[k] = Math.round(clamp(v, 1, 20));
  }
  return ATTRS.map(k => a[k]);
}

// ---------- Clubs and their strength, from the latest season of results ----------
const files = (await readdir(DATA).catch(() => [])).filter(f => f.endsWith('.csv')).sort();
if (!files.length) { console.error('No CSV files in data/football-data/. Run `npm run fetch-data` first.'); process.exit(1); }
const latest = {};
for (const f of files) { const [season, league] = f.replace('.csv', '').split('-'); if (!latest[league] || season > latest[league]) latest[league] = season; }

// ---------- Players ----------
const readGz = f => readFile(path.join(TM, f)).then(b => table(parseCsv(gunzipSync(b).toString('utf8')))).catch(() => null);
const players = await readGz('players.csv.gz');
if (!players) { console.error('No squads in data/transfermarkt/. Run `npm run fetch-data` first.'); process.exit(1); }
const lastSeason = Math.max(...players.map(p => +p.last_season || 0));
const byClub = new Map();
for (const r of players) {
  const role = ROLE[r.position];
  if (+r.last_season !== lastSeason || !role) continue;
  const id = +r.current_club_id;
  if (!byClub.has(id)) byClub.set(id, []);
  byClub.get(id).push({
    id: +r.player_id, name: r.name.trim(), role, sub: r.sub_position, side: SIDE[r.sub_position] || 'C',
    nation: r.country_of_citizenship || '', born: r.date_of_birth ? r.date_of_birth.slice(0, 10) : null,
    height: +r.height_in_cm || null, foot: r.foot || null, value: +r.market_value_in_eur || 0,
  });
}

const missingFlags = new Set();
const leagues = [];
for (const code of Object.keys(LEAGUE_NAMES).filter(c => latest[c])) {
  const season = latest[code];
  const [header, ...body] = parseCsv(await readFile(path.join(DATA, `${season}-${code}.csv`), 'utf8'));
  const col = Object.fromEntries(header.map((h, i) => [h.replace(/^﻿/, '').trim(), i]));
  const tab = new Map();
  const row = n => { if (!tab.has(n)) tab.set(n, { name: n, p: 0, gf: 0, ga: 0, pts: 0 }); return tab.get(n); };
  for (const r of body) {
    const h = r[col.HomeTeam]?.trim(), a = r[col.AwayTeam]?.trim(), hg = Number(r[col.FTHG]), ag = Number(r[col.FTAG]);
    if (!h || !a || r[col.FTHG]?.trim() === '' || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const H = row(h), A = row(a);
    H.p++; A.p++; H.gf += hg; H.ga += ag; A.gf += ag; A.ga += hg;
    H.pts += hg > ag ? 3 : hg === ag ? 1 : 0; A.pts += ag > hg ? 3 : hg === ag ? 1 : 0;
  }
  const taken = new Set();
  // Strength: how each club did (goal difference and points per game), standardised within the league and put on the
  // scale the engine is calibrated on: centred on 12 with a standard deviation of about 0.6 points, the spread of
  // squad quality that makes engine results as predictable as real ones (src/lib/league.js, `npm run calibrate`).
  // A wider spread makes every match a mismatch: far too many goals and too few upsets.
  const rated = [...tab.values()].filter(t => t.p).map(t => ({ ...t, form: (t.gf - t.ga) / t.p + 1.5 * (t.pts / t.p) }));
  const mu = rated.reduce((s, t) => s + t.form, 0) / rated.length;
  const sd = Math.sqrt(rated.reduce((s, t) => s + (t.form - mu) ** 2, 0) / rated.length) || 1;
  const teams = rated.map(t => {
    const strength = Math.round(10 * (12 + 0.58 * (t.form - mu) / sd)) / 10;
    return { name: t.name, played: t.p, points: t.pts, gd: t.gf - t.ga, strength };
  }).sort((x, y) => y.points - x.points || y.gd - x.gd || x.name.localeCompare(y.name)).map(t => {
    const meta = CLUBS[t.name];
    if (!meta) throw new Error(`No transfermarkt id for ${t.name} (${code}): add it to CLUBS in tools/build-teams.mjs`);
    const [tmId, color, color2] = meta;
    const squad = pickSquad(byClub.get(tmId) || []);
    if (squad.filter(p => p.role === 'GK').length < 1 || squad.length < 18) throw new Error(`Too few players for ${t.name} (club ${tmId}): ${squad.length}`);
    // Market value sets the level within the squad: ten times the value is about three points. Value falls with age
    // and rises with youth faster than ability does, so it is corrected for age first. Forwards cost more than
    // defenders and keepers of the same standing, so each player is compared with his own position group: the
    // group's likely starters (the keeper, four defenders, three midfielders, three forwards) average the club's
    // strength, as a generated squad's XI does.
    const ageOf = p => p.born ? (SEASON_DAY - Date.parse(p.born)) / (365.25 * 864e5) : 26;
    const worth = p => Math.log10(Math.max(p.value, 1e5)) + 0.07 * Math.max(0, ageOf(p) - 27) - 0.08 * Math.max(0, 23 - ageOf(p));
    const STARTERS = { GK: 1, DF: 4, MF: 3, FW: 3 }, centre = {};
    for (const r in STARTERS) {
      const top = squad.filter(p => p.role === r).map(worth).sort((a, b) => b - a).slice(0, STARTERS[r]);
      centre[r] = top.length ? top.reduce((s, v) => s + v, 0) / top.length : 0;
    }
    const mean = 0, logv = p => worth(p) - centre[p.role];
    const out = squad.map(p => {
      const flag = FLAGS[p.nation] || null;
      if (p.nation && !flag) missingFlags.add(p.nation);
      const level = t.strength + 0.5 + clamp(3 * (logv(p) - mean), -5, 2.5);
      // compact row: [id, name, role, side, flag, nation, born, height, foot, attrs]
      return [p.id, p.name, p.role, p.side, flag, p.nation, p.born, p.height, p.foot, attributes(p, level)];
    });
    return { ...t, short: shortCode(t.name, taken), color, color2, players: out };
  });
  leagues.push({ code, name: LEAGUE_NAMES[code], season: `20${season.slice(0, 2)}/${season.slice(2)}`, teams });
}

await mkdir(path.dirname(OUT), { recursive: true });
// One club per line keeps the file readable in a diff without spreading every attribute over its own line.
const json = '{\n  "source": "football-data.co.uk (results), transfermarkt-datasets CC0 (squads)",\n  "attrs": ' + JSON.stringify(ATTRS) + ',\n  "leagues": [\n' +
  leagues.map(l => '    { "code": ' + JSON.stringify(l.code) + ', "name": ' + JSON.stringify(l.name) + ', "season": ' + JSON.stringify(l.season) + ', "teams": [\n' +
    l.teams.map(t => '      ' + JSON.stringify(t)).join(',\n') + '\n    ] }').join(',\n') + '\n  ]\n}\n';
await writeFile(OUT, json);
for (const l of leagues) console.log(`${l.name} ${l.season}: ${l.teams.length} clubs, ${l.teams[0].name} (${l.teams[0].strength}) … ${l.teams.at(-1).name} (${l.teams.at(-1).strength})`);
if (missingFlags.size) console.warn('No flag code for: ' + [...missingFlags].join(', '));
console.log(`Wrote ${path.relative(root, OUT)} (${(json.length / 1024).toFixed(0)} KB)`);
