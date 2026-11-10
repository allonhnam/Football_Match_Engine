import { describe, it, expect } from 'vitest';
import * as E from '@/engine/engine';
import { summarise } from '@/lib/summarise';
import { seasonFixtures, tallySeason } from '@/lib/season';
import { LEAGUES } from '@/lib/util';
import { breathe } from './breathe';

describe('season', () => {
  it('has every club play every other club once at home and once away', () => {
    for (const l of LEAGUES) {
      const jobs = seasonFixtures(l.code, 1), n = l.teams.length;
      expect(jobs).toHaveLength(n * (n - 1));
      for (const t of l.teams) {
        expect(jobs.filter(j => j.home.name === t.name)).toHaveLength(n - 1);
        expect(jobs.filter(j => j.away.name === t.name)).toHaveLength(n - 1);
      }
      expect(new Set(jobs.map(j => j.home.name + '|' + j.away.name)).size).toBe(jobs.length);
    }
  });

  it('adds results into a consistent table and player totals', async () => {
    const jobs = seasonFixtures('E0', 500).slice(0, 24);
    const results: any[] = [];
    for (const j of jobs) { await breathe(); results.push(summarise(E.simulateMatch(j) as any)); }
    const { table, players, played } = tallySeason('E0', jobs, results);
    expect(played).toBe(24);
    expect(table.reduce((s, r) => s + r.p, 0)).toBe(48);
    const goals = results.reduce((s, r) => s + r.score[0] + r.score[1], 0);
    expect(table.reduce((s, r) => s + r.gf, 0)).toBe(goals);
    expect(table.reduce((s, r) => s + r.gd, 0)).toBe(0);
    const draws = results.filter(r => r.score[0] === r.score[1]).length;
    expect(table.reduce((s, r) => s + r.pts, 0)).toBe(3 * (24 - draws) + 2 * draws);
    // every goal is a player's goal or an own goal; cards and injuries match the match records
    expect(players.reduce((s, p) => s + p.goals, 0)).toBeLessThanOrEqual(goals);
    expect(players.reduce((s, p) => s + p.yellows, 0)).toBe(results.reduce((s, r) => s + r.ts[0].yellows + r.ts[1].yellows, 0));
    expect(players.reduce((s, p) => s + p.injuries, 0)).toBe(results.reduce((s, r) => s + r.injuries, 0));
    // real names and clubs, sorted table
    const top = players.slice().sort((a, b) => b.goals - a.goals)[0];
    expect(top.name).not.toMatch(/^tm\d/);
    expect(LEAGUES.find(l => l.code === 'E0')!.teams.map(t => t.name)).toContain(top.club);
    for (let i = 1; i < table.length; i++) expect(table[i - 1].pts).toBeGreaterThanOrEqual(table[i].pts);
  });
});
