// Statistics shared by the real-data builder, the calibrate script and the Engine Lab, so that a number
// like "shots per match" is defined and binned the same way for real matches and simulated ones.
//
// A "match line" is a plain object with the per-team totals both data sources can provide:
//   { goalsH, goalsA, shotsH, shotsA, onTargetH, onTargetA, cornersH, cornersA,
//     foulsH, foulsA, yellowsH, yellowsA, redsH, redsA, htH, htA }
// htH and htA are the half-time goals; NaN when unknown (lines without them are left out of the half-time checks).

/**
 * Per-match counts (both teams combined). `edges` are the inner bin boundaries: with edges [1, 2, 3] the bins are
 * below 1, 1 to 2, 2 to 3, and 3 or more.
 */
export const COUNT_METRICS = [
  { key: 'goals', label: 'Goals / match', edges: [1, 2, 3, 4, 5, 6], decimals: 2, value: l => l.goalsH + l.goalsA },
  { key: 'shots', label: 'Shots / match', edges: [14, 18, 22, 26, 30, 34], decimals: 1, value: l => l.shotsH + l.shotsA },
  { key: 'onTarget', label: 'Shots on target / match', edges: [4, 6, 8, 10, 12, 14], decimals: 1, value: l => l.onTargetH + l.onTargetA },
  { key: 'corners', label: 'Corners / match', edges: [4, 6, 8, 10, 12, 14], decimals: 1, value: l => l.cornersH + l.cornersA },
  { key: 'fouls', label: 'Fouls / match', edges: [12, 16, 20, 24, 28, 32], decimals: 1, value: l => l.foulsH + l.foulsA },
  { key: 'yellows', label: 'Yellow cards / match', edges: [1, 2, 3, 4, 5, 6, 7], decimals: 2, value: l => l.yellowsH + l.yellowsA },
  { key: 'reds', label: 'Red cards / match', edges: [1, 2], decimals: 2, value: l => l.redsH + l.redsA },
  { key: 'cards', label: 'Cards / match', edges: [1, 2, 3, 4, 5, 6, 7], decimals: 2, value: l => l.yellowsH + l.yellowsA + l.redsH + l.redsA },
  { key: 'margin', label: 'Goal margin', edges: [1, 2, 3, 4], decimals: 2, value: l => Math.abs(l.goalsH - l.goalsA) },
];

/** Shares of matches, and ratios of totals. */
export const RATE_METRICS = [
  { key: 'homeWin', label: 'Home win rate', hit: l => l.goalsH > l.goalsA },
  { key: 'draw', label: 'Draw rate', hit: l => l.goalsH === l.goalsA },
  { key: 'awayWin', label: 'Away win rate', hit: l => l.goalsH < l.goalsA },
  { key: 'zeroZero', label: '0-0 draws', hit: l => l.goalsH + l.goalsA === 0 },
];
export const RATIO_METRICS = [
  { key: 'onTargetPct', label: 'Shots on target', num: l => l.onTargetH + l.onTargetA, den: l => l.shotsH + l.shotsA },
  { key: 'goalsPerShot', label: 'Goals / shot', num: l => l.goalsH + l.goalsA, den: l => l.shotsH + l.shotsA },
];

const hasHt = l => Number.isFinite(l.htH) && Number.isFinite(l.htA);
const htLead = l => hasHt(l) && l.htH !== l.htA;
const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
/**
 * How matches unfold over the two halves, from the half-time score. Each value is sum(num) / sum(den) over the lines
 * where `when` holds: a share of matches (den 1) or, for second-half goals, a share of goals.
 */
export const HALF_METRICS = [
  { key: 'secondHalfGoals', label: 'Goals in the second half', when: hasHt, num: l => l.goalsH + l.goalsA - l.htH - l.htA, den: l => l.goalsH + l.goalsA },
  { key: 'htLevel', label: 'Level at half-time', when: hasHt, num: l => +(l.htH === l.htA), den: () => 1 },
  { key: 'htZeroZero', label: '0-0 at half-time', when: hasHt, num: l => +(l.htH + l.htA === 0), den: () => 1 },
  { key: 'leadHeld', label: 'Half-time leader wins', when: htLead, num: l => +(sign(l.goalsH - l.goalsA) === sign(l.htH - l.htA)), den: () => 1 },
  { key: 'leadDrawn', label: 'Half-time leader draws', when: htLead, num: l => +(l.goalsH === l.goalsA), den: () => 1 },
  { key: 'leadLost', label: 'Half-time leader loses', when: htLead, num: l => +(sign(l.goalsH - l.goalsA) === -sign(l.htH - l.htA)), den: () => 1 },
];

/** Final scores in the order a results page would list them; anything else counts as 'other'. */
export const SCORELINES = ['0-0', '1-0', '0-1', '1-1', '2-0', '0-2', '2-1', '1-2', '2-2', '3-0', '0-3', '3-1', '1-3', '3-2', '2-3', 'other'];
export function scorelineKey(l) {
  const k = l.goalsH + '-' + l.goalsA;
  return SCORELINES.includes(k) ? k : 'other';
}
/** Share of matches ending in each scoreline, in SCORELINES order. */
export function scorelineHist(lines) {
  const counts = Object.fromEntries(SCORELINES.map(k => [k, 0]));
  for (const l of lines) counts[scorelineKey(l)]++;
  return SCORELINES.map(k => counts[k] / (lines.length || 1));
}

const sum = a => a.reduce((s, v) => s + v, 0);
const mean = a => (a.length ? sum(a) / a.length : 0);

function halfValue(m, lines) {
  const use = lines.filter(m.when);
  return { value: sum(use.map(m.num)) / (sum(use.map(m.den)) || 1), n: use.length, den: sum(use.map(m.den)) };
}
const sd = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(sum(a.map(v => (v - m) * (v - m))) / (a.length - 1)) : 0; };
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);

/** Fraction of values in each bin defined by inner `edges`. */
export function histogram(values, edges) {
  const bins = new Array(edges.length + 1).fill(0);
  for (const v of values) {
    let i = 0;
    while (i < edges.length && v >= edges[i]) i++;
    bins[i]++;
  }
  return bins.map(c => c / (values.length || 1));
}

/** Total variation distance between two histograms: 0 identical, 1 completely different. */
export function totalVariation(a, b) {
  return 0.5 * sum(a.map((v, i) => Math.abs(v - (b[i] || 0))));
}

/** Everything the tools compare, computed from a list of match lines. */
export function analyse(lines) {
  const counts = {};
  for (const m of COUNT_METRICS) {
    const values = lines.map(m.value);
    const sorted = values.slice().sort((x, y) => x - y);
    counts[m.key] = {
      mean: mean(values), sd: sd(values), p10: quantile(sorted, 0.1), p50: quantile(sorted, 0.5), p90: quantile(sorted, 0.9),
      edges: m.edges, hist: histogram(values, m.edges),
    };
  }
  const rates = {};
  for (const m of RATE_METRICS) rates[m.key] = lines.filter(m.hit).length / (lines.length || 1);
  const ratios = {};
  for (const m of RATIO_METRICS) ratios[m.key] = sum(lines.map(m.num)) / (sum(lines.map(m.den)) || 1);
  const half = {};
  for (const m of HALF_METRICS) half[m.key] = halfValue(m, lines).value;
  return { n: lines.length, counts, rates, ratios, half, scorelines: { keys: SCORELINES, hist: scorelineHist(lines) } };
}

/**
 * Compare a simulated mean with the real one. The engine passes if it is within 7% of the real mean, or within
 * 2.5 standard errors of its own sample (so small batches are not judged too harshly).
 */
export function compareCount(real, engineValues) {
  const m = mean(engineValues);
  const se = sd(engineValues) / Math.sqrt(engineValues.length || 1);
  const tol = Math.max(0.07 * real.mean, 2.5 * se);
  return { mean: m, tol, ok: Math.abs(m - real.mean) <= tol, tv: totalVariation(histogram(engineValues, real.edges), real.hist) };
}

export function compareRate(realRate, hits, n) {
  const p = hits / (n || 1);
  const tol = Math.max(0.04, 2.5 * Math.sqrt((p * (1 - p)) / (n || 1)));
  return { mean: p, tol, ok: Math.abs(p - realRate) <= tol };
}

export function compareRatio(realRatio, value) {
  const tol = 0.07 * realRatio;
  return { mean: value, tol, ok: Math.abs(value - realRatio) <= tol };
}

/**
 * Compare a half-time metric. The engine passes if it is within 2.5 percentage points of the real value, or within
 * 2.5 standard errors of its own sample (a binomial error over the matches, or goals, it is a share of).
 */
export function compareHalf(metric, realValue, lines) {
  const { value, n, den } = halfValue(metric, lines);
  const tol = Math.max(0.025, 2.5 * Math.sqrt((value * (1 - value)) / (den || 1)));
  return { mean: value, tol, ok: Math.abs(value - realValue) <= tol, n };
}

/**
 * Compare the scoreline distribution. The gap is the total variation distance; it passes if it is below 0.05, or
 * twice the gap expected from sampling noise alone in a batch this size, whichever is larger.
 */
export function compareScorelines(realHist, lines) {
  const hist = scorelineHist(lines), n = lines.length || 1;
  const noise = 0.5 * sum(realHist.map(p => Math.sqrt((2 * p * (1 - p)) / (Math.PI * n))));
  const tol = Math.max(0.05, 2 * noise);
  const tv = totalVariation(hist, realHist);
  return { hist, tv, tol, ok: tv <= tol };
}

/** Turn an engine result (or a batch summary with the same fields) into a match line. */
export function lineFromEngine(score, teamStats, halftimeScore) {
  const [h, a] = teamStats;
  return {
    goalsH: score[0], goalsA: score[1], shotsH: h.shots, shotsA: a.shots, onTargetH: h.onTarget, onTargetA: a.onTarget,
    cornersH: h.corners, cornersA: a.corners, foulsH: h.fouls, foulsA: a.fouls,
    yellowsH: h.yellows, yellowsA: a.yellows, redsH: h.reds, redsA: a.reds,
    htH: halftimeScore ? halftimeScore[0] : NaN, htA: halftimeScore ? halftimeScore[1] : NaN,
  };
}

// ----- How a match flows and who does what -----
// Not in the dataset: compared with published top-league averages (reference.estimates). The same code serves the
// calibrate tool and the Engine Lab.

/** Reduce an engine result to the numbers the match-flow checks need. */
export function matchFlow(r) {
  const [h, a] = r.teamStats, byPos = { FW: 0, MF: 0, DF: 0, GK: 0 };
  let shots = 0, headers = 0, outside = 0;
  for (const e of r.events) {
    if (!(e.type === 'shot' || (e.type === 'goal' && !e.ownGoal)) || e.penalty) continue;
    shots++; if (e.header) headers++;
    const gx = e.x > 52.5 ? 105 : 0;
    if (Math.abs(e.x - gx) > 16.5 || Math.abs(e.y - 34) > 20.16) outside++;
  }
  const top = [0, 1].map(s => {
    const ps = r.playerStats.filter(p => p.side === s), t = ps.reduce((n, p) => n + p.shots, 0);
    return t ? Math.max(...ps.map(p => p.shots)) / t : null;
  }).filter(v => v != null);
  for (const p of r.playerStats) byPos[p.position] = (byPos[p.position] || 0) + p.shots;
  return {
    passes: h.passes + a.passes, ballInPlay: r.ballInPlay / 60, throwIns: h.throwIns + a.throwIns, goalKicks: h.goalKicks + a.goalKicks,
    shots, headers, outside, byPos, top, hatTricks: r.playerStats.filter(p => p.goals >= 3).length,
    km: r.playerStats.filter(p => p.position !== 'GK' && p.minutes >= 90).map(p => p.distKm),
  };
}

const share = (flows, f) => { const pos = flows.reduce((t, x) => t + x.byPos.FW + x.byPos.MF + x.byPos.DF + x.byPos.GK, 0) || 1; return flows.reduce((t, x) => t + f(x), 0) / pos; };
const avg = a => (a.length ? a.reduce((t, v) => t + v, 0) / a.length : 0);
const per = (flows, k) => flows.reduce((t, f) => t + f[k], 0) / (flows.length || 1);
const ofShots = (flows, k) => flows.reduce((t, f) => t + f[k], 0) / (flows.reduce((t, f) => t + f.shots, 0) || 1);
/** key in reference.estimates, label, how to aggregate, whether it is a share, decimals. */
export const FLOW_METRICS = [
  { key: 'passesPerTeam', label: 'Passes per team', value: fl => per(fl, 'passes') / 2, pct: false, decimals: 0 },
  { key: 'ballInPlay', label: 'Ball in play (min)', value: fl => per(fl, 'ballInPlay'), pct: false, decimals: 1 },
  { key: 'throwIns', label: 'Throw-ins / match', value: fl => per(fl, 'throwIns'), pct: false, decimals: 1 },
  { key: 'goalKicks', label: 'Goal kicks / match', value: fl => per(fl, 'goalKicks'), pct: false, decimals: 1 },
  { key: 'headerShare', label: 'Headed shots', value: fl => ofShots(fl, 'headers'), pct: true, decimals: 1 },
  { key: 'outsideBox', label: 'Shots outside the box', value: fl => ofShots(fl, 'outside'), pct: true, decimals: 1 },
  { key: 'forwardShots', label: 'Shots by forwards', value: fl => share(fl, x => x.byPos.FW), pct: true, decimals: 1 },
  { key: 'midfieldShots', label: 'Shots by midfielders', value: fl => share(fl, x => x.byPos.MF), pct: true, decimals: 1 },
  { key: 'defenderShots', label: 'Shots by defenders', value: fl => share(fl, x => x.byPos.DF), pct: true, decimals: 1 },
  { key: 'topShooter', label: "Top shooter's share", value: fl => avg(fl.flatMap(f => f.top)), pct: true, decimals: 1 },
  { key: 'hatTricks', label: 'Hat-tricks / match', value: fl => per(fl, 'hatTricks'), pct: false, decimals: 3 },
  { key: 'distance', label: 'Km per outfield player', value: fl => avg(fl.flatMap(f => f.km)), pct: false, decimals: 1 },
];
/** Each flow metric against its published range. */
export function compareFlow(estimates, flows) {
  return FLOW_METRICS.filter(m => estimates[m.key]).map(m => {
    const e = estimates[m.key], v = m.value(flows);
    return { ...m, engine: v, real: e.mean, lo: e.lo, hi: e.hi, ok: v >= e.lo && v <= e.hi };
  });
}
