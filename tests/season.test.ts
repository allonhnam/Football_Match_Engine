import { describe, it, expect } from 'vitest';
import * as E from '@/engine/engine';
import { summarise } from '@/lib/summarise';
import { seasonFixtures, seasonSchedule, playSeason, tallySeason } from '@/lib/season';
import { LEAGUES } from '@/lib/util';
import { breathe } from './breathe';
import { describeStatistical } from './statistical';

// plays a list of matches one after another, as the browser's worker pool would
const run = async (jobs: any[]) => { const out: any[] = []; for (const j of jobs) { await breathe(); out.push(summarise(E.simulateMatch(j) as any)); } return out; };

describe('season', () => {
  it('schedules every club once per matchday, against every other club home and away', () => {
    for (const n of [18, 20]) {
      const s = seasonSchedule(n);
      expect(s).toHaveLength(2 * (n - 1));
      for (const round of s) expect(new Set(round.flat()).size).toBe(n);
      const pairs = s.flat().map(([h, a]) => `${h}-${a}`);
      expect(new Set(pairs).size).toBe(n * (n - 1));
      // every club has exactly n - 1 home matches
      for (let t = 0; t < n; t++) expect(s.filter(r => r.some(([h]) => h === t)).length).toBe(n - 1);
    }
  });

  it('has every club play every other club once at home and once away', () => {
    for (const l of LEAGUES) {
      const jobs = seasonFixtures(l.code, 1), n = l.teams.length;
      expect(jobs).toHaveLength(n * (n - 1));
      expect(new Set(jobs.map(j => j.home.name + '|' + j.away.name)).size).toBe(jobs.length);
    }
  });

  it('keeps injured and banned players out until they have served their time', async () => {
    const s = (await playSeason('E0', 77, run, undefined, 6))!;
    expect(s.jobs).toHaveLength(60);
    let checked = 0;
    for (const job of s.jobs) for (const sheet of [job.home, job.away]) {
      expect(E.validateLineup(sheet)).toEqual([]);
      for (const p of sheet.players) if (p.unavailable) { expect(sheet.xi).not.toContain(p.id); expect(sheet.bench).not.toContain(p.id); checked++; }
    }
    expect(checked).toBeGreaterThan(0); // somebody was injured or banned in six matchdays
    const { table, players, played } = tallySeason('E0', s.jobs, s.results, s.status);
    expect(played).toBe(60);
    expect(table.every(r => r.p === 6)).toBe(true);
    const missed = players.reduce((n, p) => n + p.missedInjured + p.missedBanned, 0);
    expect(missed).toBe(checked);
  });

  it('adds results into a consistent table and player totals', async () => {
    const jobs = seasonFixtures('E0', 500).slice(0, 24);
    const results = await run(jobs);
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
    const top = players.slice().sort((a, b) => b.goals - a.goals)[0];
    expect(top.name).not.toMatch(/^tm\d/);
    for (let i = 1; i < table.length; i++) expect(table[i - 1].pts).toBeGreaterThanOrEqual(table[i].pts);
  });
});

describeStatistical('season realism', () => {
  it('plays a whole Premier League season with goals, cards and appearances near real seasons', async () => {
    const s = (await playSeason('E0', 2026, run))!;
    const { table, players, played } = tallySeason('E0', s.jobs, s.results, s.status);
    expect(played).toBe(380);
    const goals = table.reduce((n, r) => n + r.gf, 0) / played;
    expect(goals).toBeGreaterThan(2.3);
    expect(goals).toBeLessThan(3.3);
    // bans stop anyone piling up cards: real seasons top out around 12-14 yellows
    expect(Math.max(...players.map(p => p.yellows))).toBeLessThanOrEqual(16);
    // injuries and bans mean most regulars miss some matches
    expect(players.filter(p => p.apps === 38).length).toBeLessThan(100);
    expect(players.reduce((n, p) => n + p.missedBanned, 0)).toBeGreaterThan(0);
    expect(players.reduce((n, p) => n + p.missedInjured, 0)).toBeGreaterThan(0);
  });
});
