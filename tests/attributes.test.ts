import { it, expect } from 'vitest';
import * as E from '@/engine/engine';
import { breathe } from './breathe';
import { describeStatistical } from './statistical';

// Every attribute must change the thing it stands for.
const N = 60;
// Sum a statistic over n matches for the boosted side and its opponent.
async function play(attr: string, stat: (r: any, side: number) => [number, number], n: number) {
  const mine = [0, 0], theirs = [0, 0];
  for (let i = 0; i < n; i++) {
    await breathe();
    const side = i % 2, teams = [E.makeTeam({ name: 'H', seed: 700 + i }), E.makeTeam({ name: 'A', seed: 700 + i })];
    for (const p of teams[side].players) if (attr !== 'keeping' || p.role === 'GK') (p.attrs as any)[attr] = Math.min(20, (p.attrs as any)[attr] + 6);
    const r: any = E.simulateMatch({ home: teams[0], away: teams[1], seed: 40 + i, control: 'none', neutral: true });
    const a = stat(r, side), b = stat(r, 1 - side);
    mine[0] += a[0]; mine[1] += a[1]; theirs[0] += b[0]; theirs[1] += b[1];
  }
  return { mine: mine[0] / mine[1], theirs: theirs[0] / theirs[1] };
}
// Average a per-match statistic for the boosted side and its opponent.
const compare = (attr: string, stat: (r: any, side: number) => number, n = N) => play(attr, (r, s) => [stat(r, s), 1], n);
// Goals per attempt and per shot on target from the same chance taken many times.
function scoringRate({ shooting, keeping }: { shooting: number; keeping: number }) {
  const m: any = new E.Match({ home: E.makeTeam({ name: 'H', seed: 7 }), away: E.makeTeam({ name: 'A', seed: 7 }), seed: 5, control: 'none', neutral: true });
  m.runUntil({ minute: 3 });
  const i = m.players.findIndex((q: any) => q.onPitch && q.side === 0 && q.slot === 9), q = m.players[i];
  const gk = m.players.find((p: any) => p.onPitch && p.side === 1 && p.slot === 0);
  q.p = { ...q.p, attrs: { ...q.p.attrs, shooting } };
  gk.p = { ...gk.p, attrs: { ...gk.p.attrs, keeping } };
  let goals = 0, onTarget = 0;
  for (let k = 0; k < 4000; k++) {
    q.x = m.dir(0) > 0 ? 105 - 14 : 14; q.y = 34;
    m._shoot(i, { xg: 0.15, freekick: true });
    const o = m.ball.flight.outcome;
    if (o === 'goal' || o === 'saved') onTarget++;
    if (o === 'goal') goals++;
  }
  return { perAttempt: goals / 4000, perOnTarget: goals / onTarget };
}
// Count one side's events that match a test.
const events = (r: any, side: number, pred: (e: any) => boolean) => r.events.filter((e: any) => e.side === side && pred(e)).length;

describeStatistical('player attributes', () => {
  it('pace: faster players get more shots', async () => {
    const c = await compare('pace', (r, s) => r.teamStats[s].shots);
    expect(c.mine).toBeGreaterThan(c.theirs * 1.2);
  });
  it('stamina: fitter players are less tired at full time', async () => {
    const c = await compare('stamina', (r, s) => { const l = r.playerStats.filter((p: any) => p.side === s && p.minutes >= 89 && p.role !== 'GK'); return l.reduce((a: number, p: any) => a + p.endCondition, 0) / l.length; });
    expect(c.mine).toBeGreaterThan(c.theirs + 0.03);
  });
  it('passing: better passers complete more passes', async () => {
    const c = await compare('passing', (r, s) => r.teamStats[s].passPct);
    expect(c.mine).toBeGreaterThan(c.theirs + 2.5);
  });
  it('vision: better vision means fewer offsides and better chances', async () => {
    const off = await compare('vision', (r, s) => r.teamStats[s].offsides);
    expect(off.mine).toBeLessThan(off.theirs * 0.7);
  });
  it('dribbling: better dribblers carry the ball into the box more often', async () => {
    const c = await compare('dribbling', (r, s) => r.teamStats[s].boxEntries);
    expect(c.mine).toBeGreaterThan(c.theirs * 1.3);
  });
  it('shooting: a better finisher scores more of the same chances', async () => {
    expect(scoringRate({ shooting: 16, keeping: 13 }).perAttempt).toBeGreaterThan(scoringRate({ shooting: 10, keeping: 13 }).perAttempt * 1.25);
  });
  it('heading: better headers win more headers and get more headed attempts', async () => {
    const c = await compare('heading', (r, s) => events(r, s, e => (e.type === 'shot' || e.type === 'goal') && e.header));
    expect(c.mine).toBeGreaterThan(c.theirs * 1.3);
  });
  it('tackling: better tacklers win more of their challenges', async () => {
    const c = await compare('tackling', (r, s) => r.teamStats[s].tackles / Math.max(1, r.teamStats[s].challenges));
    expect(c.mine).toBeGreaterThan(c.theirs * 1.1);
  });
  it('positioning: well-positioned defenders keep the opponent out of the box', async () => {
    const c = await compare('positioning', (r, s) => r.teamStats[1 - s].boxEntries);
    expect(c.mine).toBeLessThan(c.theirs * 0.93);
  });
  it('keeping: a better keeper saves more of the same shots on target', async () => {
    expect(scoringRate({ shooting: 13, keeping: 16 }).perOnTarget).toBeLessThan(scoringRate({ shooting: 13, keeping: 10 }).perOnTarget * 0.85);
  });
});
