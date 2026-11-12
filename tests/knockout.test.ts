import { describe, it, expect } from 'vitest';
import * as E from '@/engine/engine';
import { breathe } from './breathe';
import { itStatistical } from './statistical';

// Play knockout tie number i.
const tie = (i: number, extra: object = {}) => E.simulateMatch({
  home: E.makeTeam({ name: 'H', seed: 2 * i + 1 }), away: E.makeTeam({ name: 'A', seed: 2 * i + 2 }),
  seed: i, control: 'none', knockout: true, ...extra,
}) as any;

// Check a shootout followed the rules and stopped as soon as it was decided.
function checkShootout(so: any) {
  const score = [0, 0], taken = [0, 0];
  so.kicks.forEach((k: any, j: number) => {
    expect(k.side).toBe(j % 2 === 0 ? so.first : 1 - so.first);
    taken[k.side]++; if (k.scored) score[k.side]++;
    const last = j === so.kicks.length - 1;
    const left = (s: number) => Math.max(0, 5 - taken[s]);
    const decided = taken[0] < 5 || taken[1] < 5
      ? score[0] + left(0) < score[1] || score[1] + left(1) < score[0]
      : taken[0] === taken[1] && score[0] !== score[1];
    expect(decided).toBe(last);
  });
  expect(score).toEqual(so.score);
}

describe('knockout ties', () => {
  itStatistical('always produces a winner, through extra time and penalties when needed', async () => {
    let et = 0, pens = 0;
    for (let i = 0; i < 60; i++) { await breathe();
      const r = tie(i);
      expect(r.winner === 0 || r.winner === 1).toBe(true);
      if (r.extraTime) et++;
      if (r.shootout) { pens++; checkShootout(r.shootout); expect(r.score[0]).toBe(r.score[1]); }
      if (!r.extraTime) expect(r.score[0]).not.toBe(r.score[1]);
    }
    expect(et).toBeGreaterThan(5);
    expect(pens).toBeGreaterThan(2);
  });

  it('plays two 15-minute halves of extra time after a draw', async () => {
    let i = 0, r: any;
    do { await breathe(); r = tie(i++); } while (!r.extraTime);
    const kickoffs = r.events.filter((e: any) => e.type === 'kickoff');
    expect(kickoffs.length).toBe(4);
    expect(r.events.some((e: any) => e.type === 'extratime')).toBe(true);
    const lastClock = r.events[r.events.length - 1].t;
    expect(lastClock).toBeGreaterThanOrEqual(120 * 60);
    expect(lastClock).toBeLessThan(126 * 60);
  });

  itStatistical('decides a second leg on aggregate', async () => {
    for (let i = 0; i < 30; i++) { await breathe();
      const r = tie(i, { knockout: { aggregate: [0, 2] } });
      const at90 = [0, 1].map(side => r.events.filter((e: any) => e.type === 'goal' && e.side === side && e.half <= 2).length);
      expect(r.extraTime).toBe(at90[0] === at90[1] + 2);
      const agg = [r.score[0], r.score[1] + 2];
      if (!r.shootout) expect(r.winner).toBe(agg[0] > agg[1] ? 0 : 1);
    }
  });

  it('allows a sixth substitute in extra time, but not before', () => {
    const m: any = new E.Match({ home: E.makeTeam({ name: 'H', seed: 1 }), away: E.makeTeam({ name: 'A', seed: 2 }), seed: 1, control: 'both', knockout: true });
    m.half = 3;
    expect(m._maxSubs()).toBe(6);
    m.half = 2;
    expect(m._maxSubs()).toBe(5);
  });

  it('leaves league matches unchanged: a draw stays a draw', async () => {
    for (let i = 0; i < 20; i++) { await breathe();
      const r: any = E.simulateMatch({ home: E.makeTeam({ name: 'H', seed: 2 * i + 1 }), away: E.makeTeam({ name: 'A', seed: 2 * i + 2 }), seed: i, control: 'none' });
      expect(r.extraTime).toBe(false);
      expect(r.shootout).toBe(null);
      if (r.score[0] === r.score[1]) expect(r.winner).toBe(null);
    }
  });

  it('replays a knockout tie exactly from its saved inputs', async () => {
    let i = 0, r: any;
    do { await breathe(); r = tie(i++); } while (!r.shootout);
    const cfg = { home: E.makeTeam({ name: 'H', seed: 2 * (i - 1) + 1 }), away: E.makeTeam({ name: 'A', seed: 2 * (i - 1) + 2 }), seed: i - 1, control: 'none' as const, knockout: true };
    const again: any = E.Match.replay(cfg, []).result();
    expect(again.shootout).toEqual(r.shootout);
  });
});
