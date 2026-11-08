// Run many headless matches and compare the engine with approximate top-league reference ranges.
//   npm run calibrate -- 500
import { makeTeam, simulateMatch } from '../src/engine/engine.js';

const N = Number(process.argv[2]) || 200;

// Approximate per-match values for both teams combined. Replace with figures computed from
// real league data (for example football-data.co.uk) when available.
const REF = {
  'Goals': [2.45, 3.0, v => v.goals],
  'Shots': [22, 27.5, v => v.shots],
  'Shots on target %': [31, 37, v => (100 * v.onTarget) / v.shots],
  'Corners': [8.5, 11, v => v.corners],
  'Fouls': [19, 25, v => v.fouls],
  'Yellow cards': [3.2, 4.7, v => v.yellows],
  'Red cards': [0.08, 0.22, v => v.reds],
  'Offsides': [3.2, 4.8, v => v.offsides],
  'Pass completion %': [78, 86, v => (100 * v.passesOk) / v.passes],
  '0-0 draws %': [5, 11, v => (v.goals === 0 ? 100 : 0)],
};

const sums = {};
const rows = [];
const t0 = performance.now();
for (let s = 1; s <= N; s++) {
  const swap = s % 2;
  const home = makeTeam({ name: 'Home', seed: swap ? 22 : 11, strength: 12 });
  const away = makeTeam({ name: 'Away', seed: swap ? 11 : 22, strength: 12 });
  const r = simulateMatch({ home, away, seed: s, control: 'none' });
  const [h, a] = r.teamStats;
  rows.push({
    goals: r.score[0] + r.score[1], shots: h.shots + a.shots, onTarget: h.onTarget + a.onTarget,
    corners: h.corners + a.corners, fouls: h.fouls + a.fouls, yellows: h.yellows + a.yellows,
    reds: h.reds + a.reds, offsides: h.offsides + a.offsides, passes: h.passes + a.passes, passesOk: h.passesOk + a.passesOk,
  });
}
const secs = (performance.now() - t0) / 1000;

console.log(`${N} matches in ${secs.toFixed(1)} s (${(1000 * secs / N).toFixed(0)} ms each)\n`);
console.log('Metric'.padEnd(20) + 'Engine'.padStart(9) + 'Low'.padStart(8) + 'High'.padStart(8) + '  Result');
let failures = 0;
for (const [name, [lo, hi, f]] of Object.entries(REF)) {
  const mean = rows.reduce((acc, r) => acc + f(r), 0) / rows.length;
  const ok = mean >= lo && mean <= hi;
  if (!ok) failures++;
  console.log(name.padEnd(20) + mean.toFixed(2).padStart(9) + String(lo).padStart(8) + String(hi).padStart(8) + (ok ? '  ok' : '  CHECK'));
}
console.log(`\n${Object.keys(REF).length - failures} of ${Object.keys(REF).length} metrics in range`);
