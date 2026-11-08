import { describe, it, expect } from 'vitest';
import reference from '@/data/reference.json';
import * as E from '@/engine/engine';
import { leagueTeams } from '@/lib/league';
import { COUNT_METRICS, RATE_METRICS, compareRate, lineFromEngine } from '@/lib/metrics';

describe('league squads', () => {
  it('are repeatable and different from match to match', () => {
    expect(leagueTeams(3).home.xi).toEqual(leagueTeams(3).home.xi);
    expect(leagueTeams(3).home.xi).not.toEqual(leagueTeams(4).home.xi);
  });

  it('vary in quality around an average of 12', () => {
    const strengths = Array.from({ length: 300 }, (_, i) => leagueTeams(i).home.strength);
    const mean = strengths.reduce((a, b) => a + b, 0) / strengths.length;
    const spread = Math.sqrt(strengths.reduce((a, b) => a + (b - mean) ** 2, 0) / strengths.length);
    expect(mean).toBeGreaterThan(11.7);
    expect(mean).toBeLessThan(12.3);
    expect(spread).toBeGreaterThan(0.6);
    expect(spread).toBeLessThan(1.5);
  });

  it('can favour one side', () => {
    expect(leagueTeams(7, 4).home.strength).toBeGreaterThan(leagueTeams(7, 4).away.strength);
  });
});

describe('agreement with real league data', () => {
  // A regression guard: if a change to the engine drags a headline statistic away from real football, this fails.
  // 150 matches keeps the test quick; the tolerance widens with the batch's own noise.
  it('keeps the headline statistics within tolerance of 8,900 real matches', () => {
    const lines = [];
    for (let i = 0; i < 150; i++) {
      const { home, away } = leagueTeams(i);
      const r: any = E.simulateMatch({ home, away, seed: i + 1, control: 'none' });
      lines.push(lineFromEngine(r.score, r.teamStats));
    }
    const failures: string[] = [];
    for (const key of ['goals', 'shots', 'corners', 'fouls', 'cards']) {
      const metric = COUNT_METRICS.find(m => m.key === key)!;
      const real = (reference.counts as any)[key];
      const values = lines.map(metric.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const se = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)) / Math.sqrt(values.length);
      // Within 10% of the real mean, or three standard errors of this small batch, whichever is larger.
      const allowed = Math.max(0.1 * real.mean, 3 * se);
      if (Math.abs(mean - real.mean) > allowed) failures.push(`${key}: engine ${mean.toFixed(2)} vs real ${real.mean.toFixed(2)} (allowed ±${allowed.toFixed(2)})`);
    }
    for (const key of ['homeWin', 'draw']) {
      const metric = RATE_METRICS.find(m => m.key === key)!;
      const c = compareRate((reference.rates as any)[key], lines.filter(metric.hit).length, lines.length);
      if (!c.ok) failures.push(`${key}: engine ${c.mean.toFixed(3)} vs real ${(reference.rates as any)[key].toFixed(3)}`);
    }
    expect(failures).toEqual([]);
  }, 90_000);
});
