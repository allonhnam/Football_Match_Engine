import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'football-data');
const LEAGUES = { E0: 'England Premier League', D1: 'Germany Bundesliga', SP1: 'Spain La Liga', I1: 'Italy Serie A', F1: 'France Ligue 1' };
const SEASONS = ['2122', '2223', '2324', '2425', '2526'];
const force = process.argv.includes('--force');

// Whether a file exists.
const exists = p => access(p).then(() => true, () => false);
// Wait for a number of milliseconds.
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
      if (!res.ok || !text.includes('FTHG')) throw new Error(`HTTP ${res.status}, not a results file`);
      await writeFile(file, text);
      const rows = text.split('\n').filter(l => l.trim()).length - 1;
      console.log(`${season} ${code.padEnd(3)} ${LEAGUES[code].padEnd(24)} ${String(rows).padStart(4)} matches`);
      ok++;
    } catch (err) {
      console.warn(`${season} ${code} failed: ${err.message}`);
      failed++;
    }
    await sleep(400);
  }
}

// Real squads: players and clubs from transfermarkt-datasets (CC0), used by `npm run build-teams`.
const TM = path.join(OUT, '..', 'transfermarkt');
await mkdir(TM, { recursive: true });
for (const name of ['players', 'clubs']) {
  const file = path.join(TM, name + '.csv.gz');
  if (!force && await exists(file)) { skipped++; continue; }
  try {
    const res = await fetch(`https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/${name}.csv.gz`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buf);
    console.log(`transfermarkt ${name.padEnd(8)} ${(buf.length / 1e6).toFixed(1)} MB`);
    ok++;
  } catch (err) {
    console.warn(`transfermarkt ${name} failed: ${err.message}`);
    failed++;
  }
}
console.log(`\n${ok} downloaded, ${skipped} already present, ${failed} failed. Files are in data/football-data/ and data/transfermarkt/`);
if (failed && !ok && !skipped) process.exit(1);
