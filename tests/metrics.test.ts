import { describe, it, expect } from 'vitest';
import reference from '@/data/reference.json';
import {
  analyse, compareCount, compareRate, compareRatio, histogram, totalVariation, lineFromEngine,
  HALF_METRICS, SCORELINES, compareHalf, compareScorelines, scorelineKey,
  type MatchLine,
} from '@/lib/metrics';

const line = (over: Partial<MatchLine> = {}): MatchLine => ({
  goalsH: 1, goalsA: 1, shotsH: 12, shotsA: 10, onTargetH: 4, onTargetA: 3, cornersH: 5, cornersA: 4,
  foulsH: 11, foulsA: 12, yellowsH: 2, yellowsA: 1, redsH: 0, redsA: 0, ...over,
});

describe('histogram', () => {
  it('puts values in bins defined by inner edges and sums to one', () => {
    const h = histogram([0, 1, 1, 2, 3, 9], [1, 2, 3]);
    // bins: below 1, 1 to 2, 2 to 3, 3 or more
    expect(h).toEqual([1 / 6, 2 / 6, 1 / 6, 2 / 6]);
    expect(h.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('measures how different two distributions are', () => {
    expect(totalVariation([0.5, 0.5], [0.5, 0.5])).toBe(0);
    expect(totalVariation([1, 0], [0, 1])).toBe(1);
    expect(totalVariation([0.7, 0.3], [0.5, 0.5])).toBeCloseTo(0.2);
  });
});

describe('analyse', () => {
  it('summarises match lines', () => {
    const lines = [line(), line({ goalsH: 3, goalsA: 0 }), line({ goalsH: 0, goalsA: 0 }), line({ goalsH: 0, goalsA: 2 })];
    const a = analyse(lines);
    expect(a.n).toBe(4);
    expect(a.counts.goals.mean).toBe((2 + 3 + 0 + 2) / 4);
    expect(a.rates.homeWin).toBe(0.25);
    expect(a.rates.draw).toBe(0.5);
    expect(a.rates.awayWin).toBe(0.25);
    expect(a.rates.zeroZero).toBe(0.25);
    expect(a.ratios.onTargetPct).toBeCloseTo(7 / 22);
    expect(a.counts.cards.mean).toBe(3);
  });

  it('turns engine team stats into a match line', () => {
    const stats = [
      { shots: 10, onTarget: 4, corners: 5, fouls: 9, yellows: 2, reds: 0 },
      { shots: 8, onTarget: 3, corners: 3, fouls: 12, yellows: 1, reds: 1 },
    ];
    expect(lineFromEngine([2, 1], stats)).toMatchObject({ goalsH: 2, goalsA: 1, shotsH: 10, shotsA: 8, redsA: 1, foulsA: 12 });
  });
});

describe('halves and scorelines', () => {
  const half = (key: string) => HALF_METRICS.find(m => m.key === key)!;
  // 1-0 at half-time: won 2-0, drawn 1-1, lost 1-2. Level 0-0 at half-time: 1-1. No half-time score: ignored.
  const lines = [
    line({ goalsH: 2, goalsA: 0, htH: 1, htA: 0 }), line({ goalsH: 1, goalsA: 1, htH: 1, htA: 0 }),
    line({ goalsH: 1, goalsA: 2, htH: 1, htA: 0 }), line({ goalsH: 1, goalsA: 1, htH: 0, htA: 0 }),
    line({ goalsH: 5, goalsA: 0 }),
  ];

  it('follows what the half-time leader did, from either side', () => {
    const a = analyse(lines);
    expect(a.half.leadHeld).toBeCloseTo(1 / 3);
    expect(a.half.leadDrawn).toBeCloseTo(1 / 3);
    expect(a.half.leadLost).toBeCloseTo(1 / 3);
    expect(a.half.htLevel).toBeCloseTo(1 / 4);
    expect(a.half.htZeroZero).toBeCloseTo(1 / 4);
    // goals 2+2+3+2 = 9, of which 1+1+1+0 = 3 before the break
    expect(a.half.secondHalfGoals).toBeCloseTo(6 / 9);
    // an away lead held counts the same as a home one
    expect(analyse([line({ goalsH: 0, goalsA: 2, htH: 0, htA: 1 })]).half.leadHeld).toBe(1);
  });

  it('groups final scores, with the rest as other', () => {
    expect(scorelineKey(line({ goalsH: 2, goalsA: 1 }))).toBe('2-1');
    expect(scorelineKey(line({ goalsH: 4, goalsA: 0 }))).toBe('other');
    const hist = analyse(lines).scorelines.hist;
    expect(hist.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(hist[SCORELINES.indexOf('1-1')]).toBeCloseTo(2 / 5);
  });

  it('reads the half-time score from an engine result', () => {
    const stats = Array(2).fill({ shots: 0, onTarget: 0, corners: 0, fouls: 0, yellows: 0, reds: 0 });
    expect(lineFromEngine([2, 1], stats, [1, 1])).toMatchObject({ htH: 1, htA: 1 });
    expect(lineFromEngine([2, 1], stats).htH).toBeNaN();
  });

  it('accepts a matching batch and rejects a different one', () => {
    const real = analyse(lines);
    expect(compareHalf(half('leadHeld'), real.half.leadHeld, lines).ok).toBe(true);
    expect(compareHalf(half('htLevel'), 0.9, Array(400).fill(line({ htH: 1, htA: 0 }))).ok).toBe(false);
    const draws = Array(400).fill(line({ goalsH: 1, goalsA: 1 }));
    expect(compareScorelines(analyse(draws).scorelines.hist, draws).ok).toBe(true);
    expect(compareScorelines(reference.scorelines.hist, draws).ok).toBe(false);
  });
});

describe('comparisons', () => {
  const real = { mean: 2.8, sd: 1.7, p10: 1, p50: 3, p90: 5, edges: [1, 2, 3, 4, 5, 6], hist: [0.06, 0.16, 0.24, 0.22, 0.16, 0.09, 0.07] };

  it('accepts a mean close to the real one and rejects a far one', () => {
    expect(compareCount(real, Array(200).fill(2.8)).ok).toBe(true);
    expect(compareCount(real, Array(200).fill(2.0)).ok).toBe(false);
  });

  it('is more forgiving when the simulated batch is noisy', () => {
    const noisy = Array.from({ length: 10 }, (_, i) => (i % 2 ? 0 : 5.2)); // mean 2.6, huge spread, few matches
    expect(compareCount(real, noisy).ok).toBe(true);
  });

  it('compares shares and ratios', () => {
    expect(compareRate(0.435, 220, 500).ok).toBe(true);   // 44%
    expect(compareRate(0.435, 100, 500).ok).toBe(false);  // 20%
    expect(compareRatio(0.349, 0.33).ok).toBe(true);
    expect(compareRatio(0.349, 0.2).ok).toBe(false);
  });
});

describe('real-data reference', () => {
  it('was built from a large sample of real matches', () => {
    expect(reference.source.matches).toBeGreaterThan(5000);
    expect(reference.source.leagues.length).toBeGreaterThanOrEqual(3);
  });

  it('has plausible top-league numbers', () => {
    expect(reference.counts.goals.mean).toBeGreaterThan(2.4);
    expect(reference.counts.goals.mean).toBeLessThan(3.2);
    expect(reference.counts.shots.mean).toBeGreaterThan(20);
    expect(reference.counts.shots.mean).toBeLessThan(30);
    expect(reference.rates.homeWin + reference.rates.draw + reference.rates.awayWin).toBeCloseTo(1);
    expect(reference.rates.homeWin).toBeGreaterThan(reference.rates.awayWin);
  });

  it('has a distribution for each counted metric that sums to one', () => {
    for (const c of Object.values(reference.counts)) {
      expect(c.hist.length).toBe(c.edges.length + 1);
      expect(c.hist.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    }
  });

  it('has half-time numbers and a scoreline distribution', () => {
    expect(reference.half.secondHalfGoals).toBeGreaterThan(0.5); // more goals after the break
    expect(reference.half.leadHeld + reference.half.leadDrawn + reference.half.leadLost).toBeCloseTo(1);
    expect(reference.scorelines.keys).toEqual(SCORELINES);
    expect(reference.scorelines.hist.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

describe('predictability fit (odds check)', () => {
  it('recovers a known ordered-logit model from simulated results', async () => {
    const { fitOrderedLogit, outcomeProbs } = await import('@/lib/predictability.js');
    const truth = { t1: -0.9, t2: 0.3, b: 0.7 };
    let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    const samples: { g: number; res: number }[] = [];
    for (let k = 0; k < 8000; k++) {
      const g = -4 + 8 * rnd(), [pH, pD] = outcomeProbs(truth, g), u = rnd();
      samples.push({ g, res: u < pH ? 2 : u < pH + pD ? 1 : 0 });
    }
    const fit = fitOrderedLogit(samples);
    expect(Math.abs(fit.b - truth.b)).toBeLessThan(0.08);
    expect(Math.abs(fit.t1 - truth.t1)).toBeLessThan(0.12);
    expect(Math.abs(fit.t2 - truth.t2)).toBeLessThan(0.12);
  });
});
