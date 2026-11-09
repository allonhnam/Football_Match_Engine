import { describe, it, expect } from 'vitest';
import * as E from '@/engine/engine';
import type { MatchConfig, TeamSheet } from '@/engine/engine';
import { breathe } from './breathe';
import { describeStatistical, itStatistical } from './statistical';

const team = (name: string, seed: number, strength = 12, extra: object = {}): TeamSheet =>
  E.makeTeam({ name, seed, strength, ...extra });

const config = (seed: number, over: Partial<MatchConfig> = {}): MatchConfig => ({
  home: team('Home FC', 11), away: team('Away United', 22), seed, control: 'none', ...over,
});

const fingerprint = (r: any) =>
  JSON.stringify([r.score, r.events.map((e: any) => [e.tick, e.type, e.player ?? null, e.side ?? null])]);

describe('determinism', () => {
  it('gives the same match for the same inputs and seed', () => {
    const a = E.simulateMatch(config(42)) as any;
    const b = E.simulateMatch(config(42)) as any;
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('gives different matches for different seeds', () => {
    const prints = new Set([1, 2, 3, 4, 5].map(s => fingerprint(E.simulateMatch(config(s)))));
    expect(prints.size).toBeGreaterThan(1);
  });

  it('save and load mid-match does not change the result', () => {
    const cfg = config(77, { control: 'home' });
    const straight = new E.Match(cfg);
    straight.runUntil({ minute: 30 });
    const out = straight.onPitch(0).find((q: any) => q.slot === 6);
    straight.substitute(0, out.id, straight.teams[0].bench[3].id);
    straight.setTactics(0, { pressing: 2, mentality: 2 });
    straight.runUntil({ minute: 60 });
    const saved = straight.save();
    const finished = straight.runToEnd();

    const reloaded = E.Match.load(saved).runToEnd();
    const replayed = E.Match.replay(cfg, finished.commands).result();
    expect(fingerprint(reloaded)).toBe(fingerprint(finished));
    expect(fingerprint(replayed)).toBe(fingerprint(finished));
  });
});

describe('lineup validation', () => {
  it('accepts a generated squad', () => {
    expect(E.validateLineup(team('A', 1))).toEqual([]);
  });

  it('rejects a duplicated player and a missing goalkeeper', () => {
    const t = team('A', 1);
    t.xi[0] = t.xi[5];
    const codes = E.validateLineup(t).map(e => e.code);
    expect(codes).toContain('DUPLICATE');
    expect(codes).toContain('NO_GK');
  });

  it('rejects an unavailable player', () => {
    const t = team('A', 1);
    t.players.find(p => p.id === t.xi[3])!.unavailable = 'suspended';
    expect(E.validateLineup(t).map(e => e.code)).toContain('UNAVAILABLE');
  });

  it('rejects the wrong number of starters', () => {
    const t = team('A', 1);
    t.xi = t.xi.slice(0, 10);
    expect(E.validateLineup(t).map(e => e.code)).toContain('XI_SIZE');
  });

  it('refuses to start a match with an illegal lineup instead of throwing', () => {
    const cfg = config(1);
    cfg.home.xi = cfg.home.xi.slice(0, 10);
    const result: any = E.simulateMatch(cfg);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('substitutions', () => {
  it('allows at most five substitutes', () => {
    const m = new E.Match(config(5, { control: 'home' }));
    m.runUntil({ minute: 10 });
    const outfield = m.onPitch(0).filter((q: any) => q.slot !== 0);
    const bench = m.teams[0].bench.filter((p: any) => p.role !== 'GK');
    const acks = [0, 1, 2, 3, 4, 5].map(i => m.substitute(0, outfield[i].id, bench[i].id));
    expect(acks.slice(0, 5).every(a => a.ok)).toBe(true);
    expect(acks[5].ok).toBe(false);
  });

  it('counts substitutions made in the same stoppage as one window', () => {
    const m = new E.Match(config(5, { control: 'home' }));
    m.runUntil({ minute: 10 });
    const outfield = m.onPitch(0).filter((q: any) => q.slot !== 0);
    const bench = m.teams[0].bench.filter((p: any) => p.role !== 'GK');
    for (let i = 0; i < 5; i++) expect(m.substitute(0, outfield[i].id, bench[i].id).ok).toBe(true);
    // Subs made in open play wait for the next stoppage; run until all five are on.
    while (m.events.filter((e: any) => e.type === 'sub' && e.side === 0).length < 5 && !m.finished) m.runUntil({ event: 'sub' });
    expect(m.teams[0].windowsUsed).toBe(1);
    expect(m.teams[0].subsUsed).toBe(5);
  });

  it('refuses unknown players', () => {
    const m = new E.Match(config(5, { control: 'home' }));
    expect(m.substitute(0, 'nobody', 'nobody-else').ok).toBe(false);
  });
});

describe('robustness', () => {
  it('survives random squads, tactics and manager commands without breaking invariants', async () => {
    const rng = E.makeRng(2026);
    const pick = (n: number) => Math.floor(rng() * n);
    const formations = Object.keys(E.FORMATIONS) as (keyof typeof E.FORMATIONS)[];

    for (let i = 0; i < 24; i++) { await breathe();
      const tactics = () => Object.fromEntries(E.TACTIC_KEYS.map(k => [k, pick(3)]));
      const home = team('H' + i, i + 1, 4 + pick(15), { formation: formations[pick(formations.length)], tactics: tactics() });
      const away = team('A' + i, i + 100, 4 + pick(15), { formation: formations[pick(formations.length)], tactics: tactics() });
      const m = new E.Match({ home, away, seed: i * 7 + 3, control: 'both' });

      let lastClock = -1;
      let lastHalf = 1;
      for (let guard = 0; !m.finished && guard < 400; guard++) {
        m.runUntil({ ticks: 150 });
        const side = pick(2) as 0 | 1;
        const roll = pick(3);
        if (roll === 0) m.setTactics(side, tactics());
        else if (roll === 1) m.setFormation(side, formations[pick(formations.length)]);
        else {
          const out = m.onPitch(side)[pick(11)];
          const bench = m.teams[side].bench;
          if (out && bench.length) m.substitute(side, out.id, bench[pick(bench.length)].id);
        }
        for (const q of m.players) {
          if (!q.onPitch) continue;
          expect(Number.isFinite(q.x) && Number.isFinite(q.y)).toBe(true);
          expect(q.cond).toBeGreaterThan(0);
        }
        expect(m.onPitch(0).length).toBeLessThanOrEqual(11);
        expect(m.onPitch(1).length).toBeLessThanOrEqual(11);
        expect(Number.isFinite(m.ball.x) && Number.isFinite(m.ball.y)).toBe(true);
        // The match clock restarts at 45:00 for the second half, so it only has to move forward within a half.
        const clock = m.clockSec();
        if (m.half === lastHalf) expect(clock).toBeGreaterThanOrEqual(lastClock);
        lastClock = clock;
        lastHalf = m.half;
      }

      const result = m.runToEnd();
      const goals = result.events.filter(e => e.type === 'goal');
      expect(goals.filter(e => e.side === 0).length).toBe(result.score[0]);
      expect(goals.filter(e => e.side === 1).length).toBe(result.score[1]);
      expect(result.playerStats.length).toBeGreaterThan(10);
      expect(result.carryOver.length).toBeGreaterThan(10);
    }
  });
});

describeStatistical('realism guard rails', () => {
  it('keeps headline numbers near real football for equal squads', async () => {
    let goals = 0, shots = 0, yellows = 0;
    const n = 30;
    for (let s = 1; s <= n; s++) { await breathe();
      // a fresh pair of equal-strength squads every match: one fixed pair gives squad-specific numbers
      const r: any = E.simulateMatch({ home: team('H', 100 + 2 * s), away: team('A', 101 + 2 * s), seed: s, control: 'none', neutral: true });
      goals += r.score[0] + r.score[1];
      shots += r.teamStats[0].shots + r.teamStats[1].shots;
      yellows += r.teamStats[0].yellows + r.teamStats[1].yellows;
    }
    expect(goals / n).toBeGreaterThan(1.8);
    expect(goals / n).toBeLessThan(3.6);
    expect(shots / n).toBeGreaterThan(18);
    expect(shots / n).toBeLessThan(36);
    expect(yellows / n).toBeGreaterThan(2);
    expect(yellows / n).toBeLessThan(6.5);
  });

  it('lets a clearly better squad win more often', async () => {
    let strongWins = 0, weakWins = 0;
    for (let s = 1; s <= 30; s++) { await breathe();
      const r: any = E.simulateMatch({ home: team('Strong', 11, 15), away: team('Weak', 22, 10), seed: s, control: 'none', neutral: true });
      if (r.score[0] > r.score[1]) strongWins++;
      if (r.score[0] < r.score[1]) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2);
  });
});
