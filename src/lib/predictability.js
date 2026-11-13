// The logistic function.
const sig = x => 1 / (1 + Math.exp(-x));

// Fit how home win, draw and away win depend on the squad-strength gap.
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

// Home win, draw and away win chances for a strength gap.
export function outcomeProbs(fit, g) {
  const pA = sig(fit.t1 - fit.b * g), pH = 1 - sig(fit.t2 - fit.b * g);
  return [pH, 1 - pH - pA, pA];
}

// Spread of home-minus-away win chance over a league's matchups.
export function spreadOfD(fit, gaps) {
  const d = gaps.map(g => { const p = outcomeProbs(fit, g); return p[0] - p[2]; });
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  return { meanD: mean, sdD: Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / d.length) };
}
