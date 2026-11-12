import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { simulateMatch, makeTeam, ATTRS } from '../src/engine/engine.js';

const BOOST = 3;
// What each attribute should change, as [label, value for a side, which side should be higher (+1 boosted, -1 opponent)]
const MECHANISM = {
  pace: ['shots', (r, s) => r.teamStats[s].shots],
  stamina: ['end condition', (r, s) => avg(r.playerStats.filter(p => p.side === s && p.minutes >= 89 && p.role !== 'GK').map(p => p.endCondition))],
  passing: ['pass %', (r, s) => r.teamStats[s].passPct],
  vision: ['xG per shot', (r, s) => r.teamStats[s].xg / Math.max(1, r.teamStats[s].shots)],
  dribbling: ['possession %', (r, s) => r.teamStats[s].possessionPct],
  shooting: ['goals per shot', (r, s) => r.score[s] / Math.max(1, r.teamStats[s].shots)],
  heading: ['header goals', (r, s) => r.events.filter(e => e.type === 'goal' && e.side === s && /header/.test(e.text)).length],
  tackling: ['tackles', (r, s) => r.teamStats[s].tackles],
  positioning: ['goals against', (r, s) => r.score[1 - s], -1],
  keeping: ['goals against', (r, s) => r.score[1 - s], -1],
  all: ['goal difference', (r, s) => r.score[s] - r.score[1 - s]],
};
// Average of a list of numbers.
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

// A copy of a team with one attribute raised for every player.
function boosted(team, other, attr) {
  team.players.forEach((p, i) => { for (const k of ATTRS) if (attr === 'all' || k === attr) {
    if (k === 'keeping' && p.role !== 'GK') continue;
    const up = Math.min(20, p.attrs[k] + BOOST) - p.attrs[k];
    p.attrs[k] += up; other.players[i].attrs[k] -= BOOST - up;
  } });
  return team;
}

// Play this worker's share of the attribute matches.
function runJobs(jobs) {
  return jobs.map(({ attr, i }) => {
    const seed = 500 + i, side = i % 2;
    const teams = [makeTeam({ name: 'H', seed, strength: 12 }), makeTeam({ name: 'A', seed, strength: 12 })];
    if (attr !== 'none') boosted(teams[side], teams[1 - side], attr);
    const r = simulateMatch({ home: teams[0], away: teams[1], seed: 9000 + i, control: 'none', neutral: true });
    const m = MECHANISM[attr === 'none' ? 'all' : attr];
    return { attr, gf: r.score[side], ga: r.score[1 - side], mine: m[1](r, side), theirs: m[1](r, 1 - side) };
  });
}

// Run the attribute check on all cores and print the table.
async function main() {
  const per = Number(process.argv.slice(2).find(a => /^\d+$/.test(a))) || 300;
  const oi = process.argv.indexOf('--only');
  const attrs = oi > 0 ? ['none', ...process.argv[oi + 1].split(',')] : ['none', ...ATTRS, 'all'];
  const jobs = [];
  for (const attr of attrs) for (let i = 0; i < per; i++) jobs.push({ attr, i });
  const threads = os.availableParallelism(), chunk = Math.ceil(jobs.length / threads);
  const t0 = performance.now();
  const results = (await Promise.all(Array.from({ length: threads }, (_, w) => new Promise((resolve, reject) => {
    const part = jobs.slice(w * chunk, (w + 1) * chunk);
    if (!part.length) return resolve([]);
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: part });
    worker.once('message', resolve); worker.once('error', reject);
  })))).flat();
  console.log(`${jobs.length} matches in ${((performance.now() - t0) / 1000).toFixed(1)} s: identical squads, neutral ground, +${BOOST} in one attribute for one side\n`);
  console.log('Attribute'.padEnd(13) + 'Win'.padStart(5) + 'Draw'.padStart(6) + 'Loss'.padStart(6) + '    GD   ' + 'Should raise'.padEnd(17) + 'Boosted'.padStart(9) + 'Other'.padStart(9) + '   Note');
  let flagged = 0;
  for (const attr of attrs) {
    const rs = results.filter(r => r.attr === attr), n = rs.length;
    const w = rs.filter(r => r.gf > r.ga).length / n, d = rs.filter(r => r.gf === r.ga).length / n;
    const gd = avg(rs.map(r => r.gf - r.ga)), mine = avg(rs.map(r => r.mine)), theirs = avg(rs.map(r => r.theirs));
    const m = MECHANISM[attr === 'none' ? 'all' : attr], dir = m[2] || 1;
    const moved = attr !== 'none' && dir * (mine - theirs) > 0.03 * Math.max(1, Math.abs(theirs));
    const note = attr === 'none' ? '(baseline)' : attr === 'all' ? '(reference)' : !moved && gd < 0.1 ? 'DEAD' : w > 0.6 ? 'TOO STRONG' : '';
    if (note === 'DEAD' || note === 'TOO STRONG') flagged++;
    const f = v => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1));
    console.log((attr === 'none' ? 'none' : attr).padEnd(13) + `${(100 * w).toFixed(0)}%`.padStart(5) + `${(100 * d).toFixed(0)}%`.padStart(6) + `${(100 * (1 - w - d)).toFixed(0)}%`.padStart(6) +
      (gd >= 0 ? '+' : '') + gd.toFixed(2).padStart(5) + '   ' + m[0].padEnd(17) + f(mine).padStart(9) + f(theirs).padStart(9) + '   ' + note);
  }
  console.log(flagged ? `\n${flagged} attribute(s) look dead or too strong.` : '\nEvery attribute moves its own statistic and the result, and none decides matches on its own.');
}

if (isMainThread) await main();
else parentPort.postMessage(runJobs(workerData));
