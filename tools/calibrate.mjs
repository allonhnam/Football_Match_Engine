// Run many headless matches and compare the engine with real league data.
//   npm run calibrate -- 500          (needs src/data/reference.json: npm run fetch-data && npm run build-reference)
//   npm run calibrate -- 500 --hist   (also print the distributions)
//   npm run calibrate -- 500 --threads 4
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { simulateMatch, makeTeam } from '../src/engine/engine.js';
import { fitOrderedLogit, outcomeProbs, spreadOfD } from '../src/lib/predictability.js';
import { leagueTeams } from '../src/lib/league.js';
import { COUNT_METRICS, RATE_METRICS, RATIO_METRICS, compareCount, compareRate, compareRatio, lineFromEngine } from '../src/lib/metrics.js';

// Worker side, for the odds check: matches at fixed strength gaps, to fit how results depend on the gap.
function simulateGaps(jobs) {
  return jobs.map(({ g, i }) => {
    const r = simulateMatch({ home: makeTeam({ name: 'H', seed: 7 + 2 * i, strength: 12 + g / 2 }), away: makeTeam({ name: 'A', seed: 8 + 2 * i, strength: 12 - g / 2 }), seed: 900 + i, control: 'none' });
    return { g, res: r.score[0] > r.score[1] ? 2 : r.score[0] === r.score[1] ? 1 : 0 };
  });
}

// Worker side: simulate matches number `from` up to (not including) `to` and send back what the comparison needs.
function simulateRange(from, to) {
  const out = [];
  for (let s = from; s < to; s++) {
    const { home, away } = leagueTeams(s);
    const r = simulateMatch({ home, away, seed: s + 1, control: 'none' });
    const [h, a] = r.teamStats;
    out.push({ gap: home.strength - away.strength, res: r.score[0] > r.score[1] ? 2 : r.score[0] === r.score[1] ? 1 : 0, line: lineFromEngine(r.score, r.teamStats), offsides: h.offsides + a.offsides, passes: h.passes + a.passes, passesOk: h.passesOk + a.passesOk });
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const N = Number(args.find(a => /^\d+$/.test(a))) || 200;
  const showHist = args.includes('--hist');
  const ti = args.indexOf('--threads');
  const threads = Math.max(1, Math.min(N, ti >= 0 ? Number(args[ti + 1]) : os.availableParallelism()));

  let reference;
  try {
    reference = JSON.parse(await readFile(fileURLToPath(new URL('../src/data/reference.json', import.meta.url)), 'utf8'));
  } catch {
    console.error('src/data/reference.json is missing. Run `npm run fetch-data` and then `npm run build-reference`.');
    process.exit(1);
  }

  const t0 = performance.now();
  const chunk = Math.ceil(N / threads);
  const results = (await Promise.all(Array.from({ length: threads }, (_, w) => new Promise((resolve, reject) => {
    const from = w * chunk, to = Math.min(N, from + chunk);
    if (from >= to) return resolve([]);
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { kind: 'range', from, to } });
    worker.once('message', resolve);
    worker.once('error', reject);
  })))).flat();
  // Fixed-gap matches for the odds check: 25 gaps from -6 to +6, at least 60 matches each.
  const per = Math.max(60, Math.round(N / 25)), gapJobs = [];
  for (let k = 0; k <= 24; k++) for (let i = 0; i < per; i++) gapJobs.push({ g: -6 + k * 0.5, i });
  const gc = Math.ceil(gapJobs.length / threads);
  const gapResults = reference.odds ? (await Promise.all(Array.from({ length: threads }, (_, w) => new Promise((resolve, reject) => {
    const part = gapJobs.slice(w * gc, (w + 1) * gc);
    if (!part.length) return resolve([]);
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { kind: 'gaps', jobs: part } });
    worker.once('message', resolve);
    worker.once('error', reject);
  })))).flat() : [];
  const secs = (performance.now() - t0) / 1000;

  const lines = results.map(r => r.line);
  const offsides = results.reduce((s, r) => s + r.offsides, 0), passes = results.reduce((s, r) => s + r.passes, 0), passesOk = results.reduce((s, r) => s + r.passesOk, 0);

  const src = reference.source;
  console.log(`${N} simulated matches in ${secs.toFixed(1)} s on ${threads} threads`);
  console.log(`Squads: a fresh pair per match, quality varying like a real league. Real data: ${src.matches} matches, ${src.leagues.join(' ')}, seasons ${src.seasons.join(' ')} (${src.name})\n`);

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
    const c = compareCount(real, lines.map(m.value));
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

  // How much squad quality decides results, against bookmaker odds for the same real matches.
  if (reference.odds) {
    const fit = fitOrderedLogit(gapResults);
    const sp = spreadOfD(fit, results.map(r => r.gap));
    const fav = results.filter(r => { const p = outcomeProbs(fit, r.gap); return p[0] >= p[2] ? r.res === 2 : r.res === 0; }).length / results.length;
    const o = reference.odds;
    console.log('\nPredictability, against bookmaker odds for the same ' + o.matches + ' real matches:');
    row('Spread of win chances', sp.sdD, o.sdD, 0.015, null, Math.abs(sp.sdD - o.sdD) <= 0.015, 3);
    const favTol = Math.max(0.015, 2.5 * Math.sqrt(o.favouriteWin * (1 - o.favouriteWin) / N));
    row('Favourite wins %', 100 * fav, 100 * o.favouriteWin, 100 * favTol, null, Math.abs(fav - o.favouriteWin) <= favTol, 1);
    const p1 = outcomeProbs(fit, 1), p0 = outcomeProbs(fit, 0);
    console.log(`(a squad-strength gap of 1 point at home: ${(100 * p0[0]).toFixed(0)}% → ${(100 * p1[0]).toFixed(0)}% home wins)`);
  }

  console.log(`\n${total - failures} of ${total} data-backed metrics within tolerance`);
  console.log('Shape gap is the total variation distance between the engine and real distributions (0 identical, 1 unrelated).');

  if (showHist) {
    for (const m of COUNT_METRICS.filter(x => ['goals', 'shots', 'corners', 'fouls', 'cards'].includes(x.key))) {
      const real = reference.counts[m.key];
      const values = lines.map(m.value);
      const hist = new Array(real.edges.length + 1).fill(0);
      for (const v of values) { let i = 0; while (i < real.edges.length && v >= real.edges[i]) i++; hist[i]++; }
      console.log(`\n${m.label}  (engine / real, % of matches)`);
      const labels = ['<' + real.edges[0], ...real.edges.slice(0, -1).map((e, i) => (real.edges[i + 1] - 1 === e ? String(e) : `${e}-${real.edges[i + 1] - 1}`)), real.edges.at(-1) + '+'];
      labels.forEach((lab, i) => {
        const e = (100 * hist[i]) / values.length, r = 100 * real.hist[i];
        console.log(`${lab.padStart(6)}  ${'#'.repeat(Math.round(e / 2)).padEnd(20)} ${fmt(e, 0).padStart(3)} / ${fmt(r, 0).padStart(3)}`);
      });
    }
  }
}

if (isMainThread) await main();
else parentPort.postMessage(workerData.kind === 'gaps' ? simulateGaps(workerData.jobs) : simulateRange(workerData.from, workerData.to));
