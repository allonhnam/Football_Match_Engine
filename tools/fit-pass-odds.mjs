// Fit the pass-completion model that players use to judge a pass (PASS_ODDS in src/engine/engine.js).
// A share of passes go to a random team-mate in range, so the fit also sees the risky passes players avoid.
//   npm run fit-pass-odds -- 60            (matches, default 40)
//   npm run fit-pass-odds -- 60 --write    (also write the weights into engine.js)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Match } from '../src/engine/engine.js';
import { leagueTeams } from '../src/lib/league.js';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a))) || 40, EXPLORE = 0.3;
const P = Match.prototype, X = [], Y = [];
let pending = null;
const origPass = P._pass, origDecide = P._decide;
P._pass = function (i, j, tx, ty, isThrow) {
  const q = this.players[i], m = this.players[j];
  pending = { f: this._passFeatures(q, m, tx, ty, Math.hypot(tx - q.x, ty - q.y)), side: q.side, recv: j };
  return origPass.call(this, i, j, tx, ty, isThrow);
};
P._decide = function (i) {
  const q = this.players[i];
  if (q.slot !== 0 && this.rng() < EXPLORE) {
    const mates = [];
    this.players.forEach((m, j) => { if (j !== i && m.onPitch && m.side === q.side) { const D = Math.hypot(m.x - q.x, m.y - q.y); if (D > 5 && D < 50) mates.push(j); } });
    if (mates.length) {
      const j = mates[Math.floor(this.rng() * mates.length)], m = this.players[j], d = this.dir(q.side);
      return this._pass(i, j, Math.min(104, Math.max(1, m.x + d * (this.rng() < 0.5 ? 1 : 5))), m.y, false);
    }
  }
  return origDecide.call(this, i);
};

for (let s = 0; s < N; s++) {
  const { home, away } = leagueTeams(s);
  const m = new Match({ home, away, seed: s + 1, control: 'none', officials: false });
  let watch = null, landed = -1;
  while (!m.finished) {
    const before = pending;
    m.step();
    if (pending && pending !== before) { if (m.ball.flight && m.ball.flight.kind === 'pass') { watch = pending; landed = -1; } pending = null; }
    if (!watch || (m.ball.flight && m.ball.flight.kind === 'pass')) continue;
    // Completed when a team-mate has it, including a receiver who runs onto it within 3 s of it landing.
    const b = m.ball;
    if (b.owner >= 0 || m.phase !== 'play') {
      X.push(watch.f); Y.push(b.owner >= 0 && m.players[b.owner].side === watch.side ? 1 : 0); watch = null;
    } else if (landed < 0) landed = m.clockSec();
    else if (m.clockSec() - landed > 3) { X.push(watch.f); Y.push(0); watch = null; }
  }
}

// Logistic regression by Newton's method.
const K = X[0].length;
let w = new Array(K).fill(0);
for (let it = 0; it < 25; it++) {
  const g = new Array(K).fill(0), H = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let n = 0; n < X.length; n++) {
    const x = X[n]; let z = 0; for (let k = 0; k < K; k++) z += w[k] * x[k];
    const p = 1 / (1 + Math.exp(-z));
    for (let a = 0; a < K; a++) { g[a] += (Y[n] - p) * x[a]; for (let c = 0; c < K; c++) H[a][c] += p * (1 - p) * x[a] * x[c]; }
  }
  const A = H.map((row, a) => [...row.map((v, c) => v + (a === c ? 1e-6 : 0)), g[a]]);
  for (let c = 0; c < K; c++) {
    let p = c; for (let r = c + 1; r < K; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < K; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= K; k++) A[r][k] -= f * A[c][k]; }
  }
  w = w.map((v, k) => v + A[k][K] / A[k][k]);
}
w = w.map(v => +v.toFixed(3));
console.log(`${X.length} passes in ${N} matches, ${(100 * Y.reduce((a, b) => a + b, 0) / Y.length).toFixed(1)}% completed (${Math.round(EXPLORE * 100)}% of decisions were random passes)`);
console.log('weights [1, margin, short, lane, distance/10, lofted, error, behind, box, crowd]:', JSON.stringify(w));
const bins = Array.from({ length: 10 }, () => [0, 0, 0]);
for (let n = 0; n < X.length; n++) {
  let z = 0; for (let k = 0; k < K; k++) z += w[k] * X[n][k];
  const p = 1 / (1 + Math.exp(-z)), b = Math.min(9, Math.floor(p * 10));
  bins[b][0]++; bins[b][1] += p; bins[b][2] += Y[n];
}
console.log('predicted -> actual completion:', bins.filter(b => b[0] >= 50).map(b => `${(100 * b[1] / b[0]).toFixed(0)}% -> ${(100 * b[2] / b[0]).toFixed(0)}%`).join('   '));
if (args.includes('--write')) {
  const file = fileURLToPath(new URL('../src/engine/engine.js', import.meta.url));
  const src = await readFile(file, 'utf8');
  const out = src.replace(/const PASS_ODDS = \[[^\]]*\];/, `const PASS_ODDS = ${JSON.stringify(w).replace(/,/g, ', ')};`);
  if (out === src) console.log('PASS_ODDS unchanged'); else { await writeFile(file, out); console.log('wrote PASS_ODDS into src/engine/engine.js'); }
}
