import { describe, it, expect } from 'vitest';
import * as E from '@/engine/engine';

// Every attribute must change the thing it stands for. Both sides get the same squad at a neutral ground; one side
// gets +6 in a single attribute and alternates home and away. `npm run attributes` runs the full-size version.
const N = 60;
function compare(attr: string, stat: (r: any, side: number) => number, n = N) {
  let mine = 0, theirs = 0;
  for (let i = 0; i < n; i++) {
    const side = i % 2, teams = [E.makeTeam({ name: 'H', seed: 700 + i }), E.makeTeam({ name: 'A', seed: 700 + i })];
    for (const p of teams[side].players) if (attr !== 'keeping' || p.role === 'GK') (p.attrs as any)[attr] = Math.min(20, (p.attrs as any)[attr] + 6);
    const r: any = E.simulateMatch({ home: teams[0], away: teams[1], seed: 40 + i, control: 'none', neutral: true });
    mine += stat(r, side); theirs += stat(r, 1 - side);
  }
  return { mine: mine / n, theirs: theirs / n };
}
const events = (r: any, side: number, pred: (e: any) => boolean) => r.events.filter((e: any) => e.side === side && pred(e)).length;

describe('player attributes', { timeout: 120_000 }, () => {
  it('pace: faster players get more shots', () => {
    const c = compare('pace', (r, s) => r.teamStats[s].shots);
    expect(c.mine).toBeGreaterThan(c.theirs * 1.2);
  });
  it('stamina: fitter players are less tired at full time', () => {
    const c = compare('stamina', (r, s) => { const l = r.playerStats.filter((p: any) => p.side === s && p.minutes >= 89 && p.role !== 'GK'); return l.reduce((a: number, p: any) => a + p.endCondition, 0) / l.length; });
    expect(c.mine).toBeGreaterThan(c.theirs + 0.03);
  });
  it('passing: better passers complete more passes', () => {
    const c = compare('passing', (r, s) => r.teamStats[s].passPct);
    expect(c.mine).toBeGreaterThan(c.theirs + 2.5);
  });
  it('vision: better vision means fewer offsides and better chances', () => {
    const off = compare('vision', (r, s) => r.teamStats[s].offsides);
    expect(off.mine).toBeLessThan(off.theirs * 0.7);
  });
  it('dribbling: better dribblers carry the ball into the box more often', () => {
    const c = compare('dribbling', (r, s) => r.teamStats[s].boxEntries);
    expect(c.mine).toBeGreaterThan(c.theirs * 1.3);
  });
  it('shooting: better finishers score more of their shots', () => {
    // finishing is noisy per match, so this check uses more matches
    const c = compare('shooting', (r, s) => r.score[s] / Math.max(1, r.teamStats[s].shots), 150);
    expect(c.mine).toBeGreaterThan(c.theirs * 1.1);
  });
  it('heading: better headers score more headed goals', () => {
    const c = compare('heading', (r, s) => events(r, s, e => e.type === 'goal' && /header/.test(e.text)));
    expect(c.mine).toBeGreaterThan(c.theirs * 2);
  });
  it('tackling: better tacklers win the ball more', () => {
    const c = compare('tackling', (r, s) => r.teamStats[s].tackles);
    expect(c.mine).toBeGreaterThan(c.theirs * 1.03);
  });
  it('positioning: well-positioned defenders keep the opponent out of the box', () => {
    const c = compare('positioning', (r, s) => r.teamStats[1 - s].boxEntries);
    expect(c.mine).toBeLessThan(c.theirs * 0.93);
  });
  it('keeping: a better keeper concedes fewer goals per shot on target', () => {
    // only one player gets the boost, so this check uses more matches
    const c = compare('keeping', (r, s) => r.score[1 - s] / Math.max(1, r.teamStats[1 - s].onTarget), 150);
    expect(c.mine).toBeLessThan(c.theirs * 0.93);
  });
});
