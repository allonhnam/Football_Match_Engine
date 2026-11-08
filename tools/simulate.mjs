// Play one match headless and print the result.
//   npm run simulate -- --seed 42 --home-strength 14 --away-strength 12 --events
import { makeTeam, simulateMatch } from '../src/engine/engine.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const seed = Number(opt('seed', 42));
const home = makeTeam({ name: 'Northbridge FC', short: 'NBR', seed: 11, strength: Number(opt('home-strength', 13)), formation: opt('home-formation', '4-3-3') });
const away = makeTeam({ name: 'Harbour City', short: 'HBR', seed: 22, strength: Number(opt('away-strength', 12)), formation: opt('away-formation', '4-2-3-1') });

const t0 = performance.now();
const r = simulateMatch({ home, away, seed, control: 'none', neutral: args.includes('--neutral') });
const ms = performance.now() - t0;

if (r.errors) {
  console.error('Illegal lineup:');
  for (const e of r.errors) console.error(`  [${e.side}] ${e.code}: ${e.message}`);
  process.exit(1);
}

const [h, a] = r.teamStats;
console.log(`${home.name} ${r.score[0]} - ${r.score[1]} ${away.name}   (seed ${seed}, ${ms.toFixed(0)} ms)`);
console.log(r.explanation.verdict);
console.log('');
const row = (label, x, y) => console.log(`${label.padEnd(20)}${String(x).padStart(8)}${String(y).padStart(8)}`);
row('', home.short, away.short);
row('Possession %', h.possessionPct, a.possessionPct);
row('xG', h.xg.toFixed(2), a.xg.toFixed(2));
row('Shots', h.shots, a.shots);
row('On target', h.onTarget, a.onTarget);
row('Passes', h.passes, a.passes);
row('Pass accuracy %', h.passPct, a.passPct);
row('Corners', h.corners, a.corners);
row('Fouls', h.fouls, a.fouls);
row('Offsides', h.offsides, a.offsides);
row('Yellow cards', h.yellows, a.yellows);
row('Red cards', h.reds, a.reds);

console.log('');
const shown = args.includes('--events') ? r.events : r.events.filter(e => e.key);
for (const e of shown) console.log(`${String(e.minute).padStart(6)}  ${e.text}`);
