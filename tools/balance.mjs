// Check that every tactic option matters and none dominates: each option plays the same balanced opponent
// at a neutral venue, with fresh squads every match.
//   npm run balance -- 300        (matches per option, default 200)
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { simulateMatch, TACTIC_KEYS, TACTIC_LABELS } from '../src/engine/engine.js';
import { leagueTeams } from '../src/lib/league.js';

function runJobs(jobs) {
  return jobs.map(({ dim, opt, i }) => {
    const { home, away } = leagueTeams(i);
    home.tactics = { ...home.tactics, [dim]: opt };
    const r = simulateMatch({ home, away, seed: 7000 + i, control: 'none', neutral: true });
    return { dim, opt, gf: r.score[0], ga: r.score[1], fouls: r.teamStats[0].fouls, xg: r.teamStats[0].xg };
  });
}

async function main() {
  const per = Number(process.argv.slice(2).find(a => /^\d+$/.test(a))) || 200;
  const jobs = [];
  for (const dim of TACTIC_KEYS) for (let opt = 0; opt < 3; opt++) for (let i = 0; i < per; i++) jobs.push({ dim, opt, i });

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

  console.log('Tactic'.padEnd(12) + 'Option'.padEnd(11) + 'Win'.padStart(6) + 'Draw'.padStart(6) + 'Loss'.padStart(6) + '   GF    GA    xG  Fouls   Note');
  let flagged = 0;
  for (const dim of TACTIC_KEYS) {
    for (let opt = 0; opt < 3; opt++) {
      const rs = results.filter(r => r.dim === dim && r.opt === opt);
      const n = rs.length;
      const w = rs.filter(r => r.gf > r.ga).length / n, d = rs.filter(r => r.gf === r.ga).length / n;
      const avg = k => rs.reduce((s, r) => s + r[k], 0) / n;
      // With this many matches a win rate has a standard error of about 3 points, so flag only clear outliers.
      const note = w > 0.58 ? 'too strong' : w < 0.22 ? 'too weak' : '';
      if (note) flagged++;
      console.log(
        dim.padEnd(12) + TACTIC_LABELS[dim][opt].padEnd(11) + `${(100 * w).toFixed(0)}%`.padStart(6) + `${(100 * d).toFixed(0)}%`.padStart(6) + `${(100 * (1 - w - d)).toFixed(0)}%`.padStart(6) +
        avg('gf').toFixed(2).padStart(7) + avg('ga').toFixed(2).padStart(6) + avg('xg').toFixed(2).padStart(6) + avg('fouls').toFixed(1).padStart(7) + (note ? '   ' + note : ''),
      );
    }
    console.log('');
  }
  console.log(flagged ? `${flagged} option(s) look out of balance (win rate above 58% or below 22% against a balanced side).` : 'No option is clearly dominant or useless.');
}

if (isMainThread) await main();
else parentPort.postMessage(runJobs(workerData));
