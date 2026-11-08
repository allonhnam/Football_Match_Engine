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

const lines = [];
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
    });
    seasons.add(season); leagues.add(league);
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
  // Not in the dataset. Rough top-league values kept so the Lab can still show them, clearly marked as estimates.
  estimates: {
    offsides: { mean: 4.0, lo: 3.2, hi: 4.8, note: 'Typical top-league offsides per match (both teams); not in the dataset' },
    passCompletion: { mean: 0.82, lo: 0.78, hi: 0.86, note: 'Typical top-league pass completion; not in the dataset' },
  },
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(reference, null, 2) + '\n');

const c = reference.counts;
console.log(`${lines.length} matches from ${leagues.size} leagues, ${seasons.size} seasons (${skipped} incomplete rows skipped)`);
console.log(`goals ${c.goals.mean.toFixed(2)}  shots ${c.shots.mean.toFixed(1)}  on target ${(100 * reference.ratios.onTargetPct).toFixed(1)}%  corners ${c.corners.mean.toFixed(1)}  fouls ${c.fouls.mean.toFixed(1)}  cards ${c.cards.mean.toFixed(2)}`);
console.log(`home ${(100 * reference.rates.homeWin).toFixed(1)}%  draw ${(100 * reference.rates.draw).toFixed(1)}%  away ${(100 * reference.rates.awayWin).toFixed(1)}%  0-0 ${(100 * reference.rates.zeroZero).toFixed(1)}%`);
console.log(`Wrote ${path.relative(root, OUT)}`);
