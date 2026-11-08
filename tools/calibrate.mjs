// Run many headless matches and compare the engine with real league data.
//   npm run calibrate -- 500          (needs src/data/reference.json: npm run fetch-data && npm run build-reference)
//   npm run calibrate -- 500 --hist   (also print the distributions)
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { makeTeam, simulateMatch } from '../src/engine/engine.js';
import { COUNT_METRICS, RATE_METRICS, RATIO_METRICS, compareCount, compareRate, compareRatio, lineFromEngine } from '../src/lib/metrics.js';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a))) || 200;
const showHist = args.includes('--hist');

let reference;
try {
  reference = JSON.parse(await readFile(fileURLToPath(new URL('../src/data/reference.json', import.meta.url)), 'utf8'));
} catch {
  console.error('src/data/reference.json is missing. Run `npm run fetch-data` and then `npm run build-reference`.');
  process.exit(1);
}

const lines = [];
let offsides = 0, passes = 0, passesOk = 0;
const t0 = performance.now();
for (let s = 1; s <= N; s++) {
  // A fresh pair of equal-strength squads for every match, like the many different teams of a real league.
  const home = makeTeam({ name: 'Home', seed: 1000 + 2 * s, strength: 12 });
  const away = makeTeam({ name: 'Away', seed: 1001 + 2 * s, strength: 12 });
  const r = simulateMatch({ home, away, seed: s, control: 'none' });
  lines.push(lineFromEngine(r.score, r.teamStats));
  for (const t of r.teamStats) { offsides += t.offsides; passes += t.passes; passesOk += t.passesOk; }
}
const secs = (performance.now() - t0) / 1000;

const src = reference.source;
console.log(`${N} simulated matches in ${secs.toFixed(1)} s (${((1000 * secs) / N).toFixed(0)} ms each)`);
console.log(`Real data: ${src.matches} matches, ${src.leagues.join(' ')}, seasons ${src.seasons.join(' ')} (${src.name})\n`);

const fmt = (v, d) => v.toFixed(d);
const pad = (s, n) => String(s).padStart(n);
console.log('Metric'.padEnd(26) + pad('Engine', 9) + pad('Real', 9) + pad('Allowed ±', 11) + pad('Shape gap', 11) + '  Result');
let failures = 0, total = 0;
const row = (label, engine, real, tol, tv, ok, d) => {
  total++; if (!ok) failures++;
  console.log(label.padEnd(26) + pad(fmt(engine, d), 9) + pad(fmt(real, d), 9) + pad(fmt(tol, d), 11) + pad(tv == null ? '' : fmt(tv, 2), 11) + (ok ? '  ok' : '  CHECK'));
};

for (const m of COUNT_METRICS) {
  const real = reference.counts[m.key];
  const values = lines.map(m.value);
  const c = compareCount(real, values);
  row(m.label, c.mean, real.mean, c.tol, c.tv, c.ok, m.decimals);
}
for (const m of RATE_METRICS) {
  const c = compareRate(reference.rates[m.key], lines.filter(m.hit).length, lines.length);
  row(m.label, 100 * c.mean, 100 * reference.rates[m.key], 100 * c.tol, null, c.ok, 1);
}
for (const m of RATIO_METRICS) {
  const num = lines.reduce((s, l) => s + m.num(l), 0), den = lines.reduce((s, l) => s + m.den(l), 0);
  const c = compareRatio(reference.ratios[m.key], num / den);
  row(m.label, 100 * c.mean, 100 * reference.ratios[m.key], 100 * c.tol, null, c.ok, 1);
}

console.log('\nNot in the dataset (rough estimates, not data):');
const est = reference.estimates;
const off = offsides / N, pc = passesOk / passes;
console.log(`${'Offsides / match'.padEnd(26)}${pad(fmt(off, 2), 9)}${pad('~' + fmt(est.offsides.mean, 1), 9)}   expected range ${est.offsides.lo}-${est.offsides.hi}${off >= est.offsides.lo && off <= est.offsides.hi ? '  ok' : '  CHECK'}`);
console.log(`${'Pass completion %'.padEnd(26)}${pad(fmt(100 * pc, 1), 9)}${pad('~' + fmt(100 * est.passCompletion.mean, 0), 9)}   expected range ${100 * est.passCompletion.lo}-${100 * est.passCompletion.hi}${pc >= est.passCompletion.lo && pc <= est.passCompletion.hi ? '  ok' : '  CHECK'}`);

console.log(`\n${total - failures} of ${total} data-backed metrics within tolerance`);
console.log('Shape gap is the total variation distance between the engine and real distributions (0 identical, 1 unrelated).');

if (showHist) {
  for (const m of COUNT_METRICS.filter(x => ['goals', 'shots', 'corners', 'fouls', 'cards'].includes(x.key))) {
    const real = reference.counts[m.key];
    const values = lines.map(m.value);
    const eng = real.edges.length + 1;
    const hist = new Array(eng).fill(0);
    for (const v of values) { let i = 0; while (i < real.edges.length && v >= real.edges[i]) i++; hist[i]++; }
    console.log(`\n${m.label}  (engine / real, % of matches)`);
    const labels = ['<' + real.edges[0], ...real.edges.slice(0, -1).map((e, i) => (real.edges[i + 1] - 1 === e ? String(e) : `${e}-${real.edges[i + 1] - 1}`)), real.edges.at(-1) + '+'];
    labels.forEach((lab, i) => {
      const e = (100 * hist[i]) / values.length, r = 100 * real.hist[i];
      console.log(`${lab.padStart(6)}  ${'#'.repeat(Math.round(e / 2)).padEnd(20)} ${fmt(e, 0).padStart(3)} / ${fmt(r, 0).padStart(3)}`);
    });
  }
}
