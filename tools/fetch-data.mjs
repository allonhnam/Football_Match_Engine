// Download match results for the top five European leagues from football-data.co.uk.
//   npm run fetch-data
//
// Files go into data/football-data/ (not committed). Run `npm run build-reference` afterwards to turn
// them into src/data/reference.json, the numbers the calibration tools compare the engine against.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'football-data');
const LEAGUES = { E0: 'England Premier League', D1: 'Germany Bundesliga', SP1: 'Spain La Liga', I1: 'Italy Serie A', F1: 'France Ligue 1' };
const SEASONS = ['2122', '2223', '2324', '2425', '2526'];
const force = process.argv.includes('--force');

const exists = p => access(p).then(() => true, () => false);
const sleep = ms => new Promise(r => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });
let ok = 0, skipped = 0, failed = 0;

for (const season of SEASONS) {
  for (const code of Object.keys(LEAGUES)) {
    const file = path.join(OUT, `${season}-${code}.csv`);
    if (!force && await exists(file)) { skipped++; continue; }
    const url = `https://www.football-data.co.uk/mmz4281/${season}/${code}.csv`;
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const text = await res.text();
      // Reject error pages: a real file starts with a header row naming the full-time goals column.
      if (!res.ok || !text.includes('FTHG')) throw new Error(`HTTP ${res.status}, not a results file`);
      await writeFile(file, text);
      const rows = text.split('\n').filter(l => l.trim()).length - 1;
      console.log(`${season} ${code.padEnd(3)} ${LEAGUES[code].padEnd(24)} ${String(rows).padStart(4)} matches`);
      ok++;
    } catch (err) {
      console.warn(`${season} ${code} failed: ${err.message}`);
      failed++;
    }
    await sleep(400); // be polite to the free service
  }
}
console.log(`\n${ok} downloaded, ${skipped} already present, ${failed} failed. Files are in data/football-data/`);
if (failed && !ok && !skipped) process.exit(1);
