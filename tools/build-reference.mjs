// Turn the downloaded league CSVs into src/data/reference.json: the real-football numbers (means, spreads and
// distributions) that the calibrate script and the Engine Lab compare the engine against.
//   npm run build-reference
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyse } from '../src/lib/metrics.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(root, 'data', 'football-data');
const OUT = path.join(root, 'src', 'data', 'reference.json');

// Minimal CSV reader: handles a byte-order mark, quoted fields and CRLF line endings.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(v => v !== '')) rows.push(row); }
  return rows;
}

const NEEDED = ['FTHG', 'FTAG', 'HS', 'AS', 'HST', 'AST', 'HF', 'AF', 'HC', 'AC', 'HY', 'AY', 'HR', 'AR'];
const files = (await readdir(DATA).catch(() => [])).filter(f => f.endsWith('.csv')).sort();
if (!files.length) { console.error('No CSV files in data/football-data/. Run `npm run fetch-data` first.'); process.exit(1); }

const halfTime = (r, i) => (i === undefined || r[i] === undefined || r[i].trim() === '' ? NaN : Number(r[i]));

const lines = [];
// Bookmaker odds (market average, else Bet365), turned into probabilities with the margin removed. They say how
// predictable real matches are, which is what the engine's squad-quality effect is calibrated against.
const oddsRows = [];
const seasons = new Set(), leagues = new Set();
let skipped = 0;
for (const file of files) {
  const [season, league] = file.replace('.csv', '').split('-');
  const [header, ...body] = parseCsv(await readFile(path.join(DATA, file), 'utf8'));
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  if (NEEDED.some(k => col[k] === undefined)) { console.warn(`${file}: missing columns, skipped`); continue; }
  for (const r of body) {
    const v = Object.fromEntries(NEEDED.map(k => [k, Number(r[col[k]])]));
    // Drop unplayed or incomplete rows rather than treating a blank as zero.
    if (NEEDED.some(k => r[col[k]] === undefined || r[col[k]].trim() === '' || !Number.isFinite(v[k]))) { skipped++; continue; }
    lines.push({
      goalsH: v.FTHG, goalsA: v.FTAG, shotsH: v.HS, shotsA: v.AS, onTargetH: v.HST, onTargetA: v.AST,
      cornersH: v.HC, cornersA: v.AC, foulsH: v.HF, foulsA: v.AF, yellowsH: v.HY, yellowsA: v.AY, redsH: v.HR, redsA: v.AR,
      // Half-time goals: kept only when both are present, so a blank is never read as 0.
      htH: halfTime(r, col.HTHG), htA: halfTime(r, col.HTAG),
    });
    seasons.add(season); leagues.add(league);
    const pick = keys => keys.map(k => Number(r[col[k]]));
    let odds = pick(['AvgH', 'AvgD', 'AvgA']);
    if (!odds.every(o => o > 1)) odds = pick(['B365H', 'B365D', 'B365A']);
    if (odds.every(o => o > 1)) {
      const inv = odds.map(o => 1 / o), sum = inv[0] + inv[1] + inv[2];
      oddsRows.push({ p: inv.map(v => v / sum), res: v.FTHG > v.FTAG ? 'H' : v.FTHG < v.FTAG ? 'A' : 'D' });
    }
  }
}

const reference = {
  source: {
    name: 'football-data.co.uk',
    url: 'https://www.football-data.co.uk/data.php',
    leagues: [...leagues].sort(),
    seasons: [...seasons].sort(),
    matches: lines.length,
    skippedRows: skipped,
  },
  ...analyse(lines),
  odds: summariseOdds(oddsRows),
  // Not in the dataset. Rough top-league values kept so the Lab can still show them, clearly marked as estimates.
  estimates: {
    offsides: { mean: 4.0, lo: 3.2, hi: 4.8, note: 'Typical top-league offsides per match (both teams); not in the dataset' },
    passCompletion: { mean: 0.82, lo: 0.78, hi: 0.86, note: 'Typical top-league pass completion; not in the dataset' },
  },
};

function summariseOdds(rows) {
  if (!rows.length) return null;
  const n = rows.length, d = rows.map(r => r.p[0] - r.p[2]);
  const mean = d.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / n);
  const fav = rows.map(r => Math.max(r.p[0], r.p[2])).sort((a, b) => a - b);
  const q = x => Math.round(fav[Math.floor(x * (n - 1))] * 1000) / 1000;
  return {
    matches: n,
    note: 'd = home-win minus away-win probability implied by the odds (margin removed)',
    meanD: mean, sdD: sd,
    favouriteWin: rows.filter(r => (r.p[0] >= r.p[2] ? r.res === 'H' : r.res === 'A')).length / n,
    favouriteP: { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) },
  };
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(reference, null, 2) + '\n');

const c = reference.counts;
console.log(`${lines.length} matches from ${leagues.size} leagues, ${seasons.size} seasons (${skipped} incomplete rows skipped)`);
console.log(`goals ${c.goals.mean.toFixed(2)}  shots ${c.shots.mean.toFixed(1)}  on target ${(100 * reference.ratios.onTargetPct).toFixed(1)}%  corners ${c.corners.mean.toFixed(1)}  fouls ${c.fouls.mean.toFixed(1)}  cards ${c.cards.mean.toFixed(2)}`);
console.log(`home ${(100 * reference.rates.homeWin).toFixed(1)}%  draw ${(100 * reference.rates.draw).toFixed(1)}%  away ${(100 * reference.rates.awayWin).toFixed(1)}%  0-0 ${(100 * reference.rates.zeroZero).toFixed(1)}%`);
const h = reference.half;
console.log(`second-half goals ${(100 * h.secondHalfGoals).toFixed(1)}%  level at half-time ${(100 * h.htLevel).toFixed(1)}%  half-time leader wins ${(100 * h.leadHeld).toFixed(1)}% / draws ${(100 * h.leadDrawn).toFixed(1)}% / loses ${(100 * h.leadLost).toFixed(1)}%  (${lines.filter(l => Number.isFinite(l.htH) && Number.isFinite(l.htA)).length} matches with a half-time score)`);
console.log('scorelines: ' + reference.scorelines.keys.map((k, i) => `${k} ${(100 * reference.scorelines.hist[i]).toFixed(1)}%`).join('  '));
if (reference.odds) console.log(`odds: ${reference.odds.matches} matches, spread of home-minus-away win chance ${reference.odds.sdD.toFixed(3)}, favourite wins ${(100 * reference.odds.favouriteWin).toFixed(1)}%`);
console.log(`Wrote ${path.relative(root, OUT)}`);
