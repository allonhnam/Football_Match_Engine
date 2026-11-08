// Check that every tactic option matters and none dominates: each option plays the same balanced opponent
// at a neutral venue, with fresh squads every match. Also checks formations and the style match-ups.
//   npm run balance -- 300        (matches per option, default 200)
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { simulateMatch, makeTeam, TACTIC_KEYS, TACTIC_LABELS, FORMATIONS } from '../src/engine/engine.js';
import { leagueTeams } from '../src/lib/league.js';

// A case changes the home side (and optionally the away side) of an otherwise balanced 4-3-3 v 4-3-3 match.
const CASES = [];
for (const dim of TACTIC_KEYS) for (let opt = 0; opt < 3; opt++) CASES.push({ group: dim, label: TACTIC_LABELS[dim][opt], home: { [dim]: opt } });
for (const f of Object.keys(FORMATIONS)) CASES.push({ group: 'formation', label: f, formation: f, home: {} });
const L = TACTIC_LABELS;
for (const [h, a] of [[{ passing: 2 }, { line: 2 }], [{ passing: 1 }, { line: 2 }], [{ passing: 0 }, { pressing: 2 }], [{ passing: 1 }, { pressing: 2 }], [{ passing: 0 }, { pressing: 0 }], [{ passing: 1 }, { pressing: 0 }]]) {
  const [hk, hv] = Object.entries(h)[0], [ak, av] = Object.entries(a)[0];
  CASES.push({ group: 'match-up', label: `${L[hk][hv]} ${hk} v ${L[ak][av]} ${ak}`, home: h, away: a });
}

function runJobs(jobs) {
  return jobs.map(({ c, i }) => {
    const cs = CASES[c];
    let { home, away } = leagueTeams(i);
    if (cs.formation) home = makeTeam({ name: 'Home', seed: 1000 + 2 * i, strength: home.strength, formation: cs.formation });
    home.tactics = { ...home.tactics, ...cs.home };
    away.tactics = { ...away.tactics, ...(cs.away || {}) };
    const r = simulateMatch({ home, away, seed: 7000 + i, control: 'none', neutral: true });
    const t = r.teamStats[0];
    const full = r.playerStats.filter(p => p.side === 0 && p.minutes >= 89);
    return { c, gf: r.score[0], ga: r.score[1], fouls: t.fouls, xg: t.xg, poss: t.possessionPct, pass: t.passPct, shots: t.shots, cond: full.reduce((a, p) => a + p.endCondition, 0) / (full.length || 1) };
  });
}

async function main() {
  const per = Number(process.argv.slice(2).find(a => /^\d+$/.test(a))) || 200;
  const jobs = [];
  CASES.forEach((_, c) => { for (let i = 0; i < per; i++) jobs.push({ c, i }); });

  const threads = os.availableParallelism();
  const chunk = Math.ceil(jobs.length / threads);
  const t0 = performance.now();
  const results = (await Promise.all(Array.from({ length: threads }, (_, w) => new Promise((resolve, reject) => {
    const part = jobs.slice(w * chunk, (w + 1) * chunk);
    if (!part.length) return resolve([]);
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: part });
    worker.once('message', resolve);
    worker.once('error', reject);
  })))).flat();
  console.log(`${jobs.length} matches in ${((performance.now() - t0) / 1000).toFixed(1)} s (${per} per option)\n`);

  console.log('Group'.padEnd(11) + 'Option'.padEnd(30) + 'Win'.padStart(5) + 'Draw'.padStart(6) + 'Loss'.padStart(6) + '   GF    GA    xG  Shots Poss Pass%  Fouls  Cond   Note');
  let flagged = 0, group = null;
  CASES.forEach((cs, c) => {
    if (group !== null && cs.group !== group) console.log('');
    group = cs.group;
    const rs = results.filter(r => r.c === c), n = rs.length;
    const w = rs.filter(r => r.gf > r.ga).length / n, d = rs.filter(r => r.gf === r.ga).length / n;
    const avg = k => rs.reduce((s, r) => s + r[k], 0) / n;
    // With a few hundred matches a win rate has a standard error of about 3 points, so flag only clear outliers.
    const note = cs.group === 'match-up' ? '' : w > 0.5 ? 'too strong' : w < 0.27 ? 'too weak' : '';
    if (note) flagged++;
    console.log(
      cs.group.padEnd(11) + cs.label.padEnd(30) + `${(100 * w).toFixed(0)}%`.padStart(5) + `${(100 * d).toFixed(0)}%`.padStart(6) + `${(100 * (1 - w - d)).toFixed(0)}%`.padStart(6) +
      avg('gf').toFixed(2).padStart(7) + avg('ga').toFixed(2).padStart(6) + avg('xg').toFixed(2).padStart(6) + avg('shots').toFixed(1).padStart(7) + avg('poss').toFixed(0).padStart(5) +
      avg('pass').toFixed(0).padStart(6) + avg('fouls').toFixed(1).padStart(7) + avg('cond').toFixed(2).padStart(6) + (note ? '   ' + note : ''),
    );
  });
  console.log('\nA balanced side wins about 40% against another balanced side (the rest are draws and losses).');
  console.log(flagged ? `${flagged} option(s) look out of balance (win rate above 50% or below 27% against a balanced side).` : 'No tactic or formation is clearly dominant or useless.');
}

if (isMainThread) await main();
else parentPort.postMessage(runJobs(workerData));
