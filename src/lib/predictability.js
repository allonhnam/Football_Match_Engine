// How predictable matches are, so the engine's squad-quality effect can be checked against bookmaker odds.
//
// Real side: the odds give each match's home-win and away-win probability (margin removed). Their difference d
// says how one-sided the match was expected to be; its spread over a league says how much quality decides results.
// Engine side: the engine has no odds, so we fit how results depend on the squad-strength gap g (an ordered
// logit: P(away) = s(t1 - b g), P(away or draw) = s(t2 - b g)), then read off d for every league matchup.

const sig = x => 1 / (1 + Math.exp(-x));

/** samples: [{ g, res }] with res 0 = away win, 1 = draw, 2 = home win. Returns { t1, t2, b }. */
export function fitOrderedLogit(samples) {
  let t1 = -0.6, t2 = 0.5, b = 0.4;
  const n = samples.length;
  for (let it = 0; it < 4000; it++) {
    let g1 = 0, g2 = 0, gb = 0;
    for (const { g, res } of samples) {
      const a = sig(t1 - b * g), c = sig(t2 - b * g), da = a * (1 - a), dc = c * (1 - c);
      if (res === 0) { g1 += da / a; gb -= g * da / a; }
      else if (res === 1) { const pd = Math.max(1e-9, c - a); g2 += dc / pd; g1 -= da / pd; gb -= g * (dc - da) / pd; }
      else { const ph = Math.max(1e-9, 1 - c); g2 -= dc / ph; gb += g * dc / ph; }
    }
    t1 += 2 * g1 / n; t2 += 2 * g2 / n; b += 0.5 * gb / n;
  }
  return { t1, t2, b };
}

/** [home win, draw, away win] probabilities for a strength gap under a fitted model. */
export function outcomeProbs(fit, g) {
  const pA = sig(fit.t1 - fit.b * g), pH = 1 - sig(fit.t2 - fit.b * g);
  return [pH, 1 - pH - pA, pA];
}

/** Spread of home-minus-away win probability over a list of gaps, and the mean. */
export function spreadOfD(fit, gaps) {
  const d = gaps.map(g => { const p = outcomeProbs(fit, g); return p[0] - p[2]; });
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  return { meanD: mean, sdD: Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / d.length) };
}
