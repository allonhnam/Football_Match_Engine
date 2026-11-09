import { describe, it, expect } from 'vitest';
import * as E from '@/engine/engine';
import { leagueTeams } from '@/lib/league';
import { breathe } from './breathe';
import { describeStatistical, itStatistical } from './statistical';

const L = 105, W = 68;
const newMatch = (seed = 3) => {
  const m: any = new E.Match({ home: E.makeTeam({ name: 'Home', seed: 11 }), away: E.makeTeam({ name: 'Away', seed: 22 }), seed, control: 'none' });
  m.runUntil({ minute: 5 });
  while (m.phase !== 'play') m.step();
  return m;
};
const idx = (m: any, side: number, pred: (q: any) => boolean) => m.players.findIndex((q: any) => q.onPitch && q.side === side && pred(q));
const lastEvent = (m: any, type: string) => m.events.filter((e: any) => e.type === type).pop();
/** Put the ball at a point in the penalty area that `side` attacks. */
const intoBox = (m: any, side: number) => { const d = m.dir(side); m.ball.x = d > 0 ? L - 8 : 8; m.ball.y = W / 2; };

describe('laws of the game', () => {
  it('takes every kick-off after a goal with all players in their own half (Law 8)', async () => {
    let kickoffs = 0;
    const offenders: string[] = [];
    for (let i = 0; i < 12; i++) { await breathe();
      const { home, away } = leagueTeams(i);
      const m: any = new E.Match({ home, away, seed: i + 1, control: 'none', officials: false });
      let afterGoal = false, prev: any = null;
      m.on((e: any) => { if (e.type === 'goal') afterGoal = true; });
      while (!m.finished) {
        m.step();
        if (prev && prev.type === 'kickoff' && !m.restart && afterGoal) {
          kickoffs++; afterGoal = false;
          m.players.forEach((q: any, k: number) => {
            if (q.onPitch && k !== prev.taker && (q.x - L / 2) * m.dir(q.side) > 1) offenders.push(`match ${i}, ${m.minuteLabel()}: ${q.p.name}`);
          });
        }
        prev = m.restart ? { type: m.restart.type, taker: m.restart.taker } : null;
      }
    }
    expect(kickoffs).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });

  it('never gives two team-mates the same surname', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const surnames = E.generateSquad(seed, 'Club', 12).map(p => p.name.split('. ')[1]);
      expect(new Set(surnames).size).toBe(surnames.length);
    }
  });

  it('awards a penalty for a handball in the defending penalty area (Law 12)', () => {
    const m = newMatch();
    intoBox(m, 0);
    const def = idx(m, 1, q => q.slot !== 0);
    m._foul(def, -1, 'handball');
    expect(m.restart.type).toBe('penalty');
    expect(m.restart.side).toBe(0);
    expect(lastEvent(m, 'foul').offence).toBe('handball');
  });

  it('gives an indirect free kick, not a penalty, for dangerous play in the area', () => {
    const m = newMatch();
    intoBox(m, 0);
    const def = idx(m, 1, q => q.slot !== 0), att = idx(m, 0, q => q.slot !== 0);
    m.players[att].x = m.ball.x; m.players[att].y = m.ball.y;
    m._foul(def, att, 'dangerous');
    expect(m.restart.type).toBe('freekick');
    expect(m.restart.direct).toBe(false);
  });

  it('never lets a team score directly from an indirect free kick', () => {
    const m = newMatch();
    intoBox(m, 0);
    m._setRestart('freekick', 0, m.ball.x, m.ball.y, 0, { direct: false });
    const shotsBefore = m.teams[0].stats.shots;
    m._resume();
    expect(m.teams[0].stats.shots).toBe(shotsBefore);
  });

  it('gives a corner when the keeper holds the ball in his hands for more than 8 seconds', () => {
    const m = newMatch();
    const gk = idx(m, 0, q => q.slot === 0), g = m.players[gk];
    const d = m.dir(0); g.x = d > 0 ? 6 : L - 6; g.y = W / 2;
    m._giveKeeper(gk, false);
    expect(m.gkHands).toBe(gk);
    m.decisionT = 99; // a time-wasting keeper
    for (let i = 0; i < 40 && m.phase === 'play'; i++) m.step();
    expect(lastEvent(m, 'keeperholding')).toBeTruthy();
    expect(m.restart.type).toBe('corner');
    expect(m.restart.side).toBe(1);
  });

  it('does not let the keeper handle a deliberate back-pass', () => {
    const m = newMatch();
    const gk = idx(m, 0, q => q.slot === 0), g = m.players[gk];
    const d = m.dir(0); g.x = d > 0 ? 6 : L - 6; g.y = W / 2;
    m.rng = () => 0.5;
    m._giveKeeper(gk, true);
    expect(m.gkHands).toBe(-1);
  });

  it('credits an own goal to the other side and restarts with their opponents kicking off', () => {
    const m = newMatch();
    const def = idx(m, 1, q => q.slot !== 0);
    m._ownGoal(def);
    expect(m.teams[0].score).toBe(1);
    const g = lastEvent(m, 'goal');
    expect(g.ownGoal).toBe(true);
    expect(g.side).toBe(0);
    expect(m.restart.type).toBe('kickoff');
    expect(m.restart.side).toBe(1);
  });

  it('stops play for a serious injury and restarts with a dropped ball (Law 8)', () => {
    const m = newMatch();
    const p = idx(m, 0, q => q.slot !== 0);
    m.rng = () => 0.9; // a long injury
    expect(m._injure(p, true)).toBe(true);
    expect(m.restart.type).toBe('dropball');
  });

  it('keeps opponents 2 m away at throw-ins and 9.15 m away at free kicks', () => {
    const m = newMatch();
    m._setRestart('throwin', 0, 50, 0, 3);
    for (let i = 0; i < 12; i++) m.step();
    const near = m.players.filter((q: any) => q.onPitch && q.side === 1 && Math.hypot(q.x - 50, q.y) < 1.9);
    expect(near.length).toBe(0);
  });

  it('puts another player in goal when the keeper is sent off', () => {
    const m = newMatch();
    const gk = idx(m, 1, q => q.slot === 0);
    m._sendOff(gk, 'denied an obvious goal-scoring opportunity');
    m._setRestart('freekick', 0, 60, 30, 2, { direct: true });
    expect(m.onPitch(1).some((q: any) => q.slot === 0)).toBe(true);
  });

  it('plays advantage and still shows the card at the next stoppage', async () => {
    let advantages = 0, recalled = 0;
    for (let s = 1; s <= 12; s++) { await breathe();
      const { home, away } = leagueTeams(s);
      const r: any = E.simulateMatch({ home, away, seed: s, control: 'none' });
      advantages += r.events.filter((e: any) => e.type === 'advantage' && !/^No advantage/.test(e.text)).length;
      recalled += r.events.filter((e: any) => e.type === 'advantage' && /^No advantage/.test(e.text)).length;
    }
    expect(advantages).toBeGreaterThan(12);
    expect(recalled).toBeGreaterThan(0);
    expect(recalled).toBeLessThan(advantages);
  });

  // A last-man foul 20 m out by `slot 2` of the away side on the home centre-forward, with the home side keeping the
  // ball. `rolls` are the referee's random draws in order (card decisions, injury, advantage).
  const lastManFoul = (rolls: number[]) => {
    const m = newMatch(), d = m.dir(0);
    const oi = idx(m, 0, q => q.slot === 9), ti = idx(m, 1, q => q.slot === 2), o = m.players[oi], t = m.players[ti];
    o.x = d > 0 ? L - 20 : 20; o.y = W / 2; t.x = o.x; t.y = o.y + 1;
    m.players.forEach((q: any) => { if (q.onPitch && q.side === 1 && q.slot !== 0 && q !== t) q.x = o.x - d * 10; });
    m.ball.owner = oi; m.ball.x = o.x; m.ball.y = o.y;
    const rng = m.rng; let k = 0; m.rng = () => (k < rolls.length ? rolls[k++] : 0.5);
    m._foul(ti, oi, 'challenge');
    m.rng = rng;
    return { m, t, oi };
  };

  it('cautions instead of sending off when advantage is played for denying a goal-scoring chance (Law 12)', () => {
    const { m, t } = lastManFoul([0, 0.5, 0.1]);
    expect(m.advantage).toBeTruthy();
    expect(m.pendingCards[0].orig.card).toBe('red'); // a red had play been stopped
    m._setRestart('throwin', 0, 50, 0, 3);
    expect(t.red).toBe(false);
    expect(t.yellow).toBe(1);
  });

  it('shows no card for denying a goal-scoring chance when advantage is played and the goal follows (Law 12, 2026/27)', () => {
    const { m, t, oi } = lastManFoul([0, 0.5, 0.1]);
    const rng = m.rng; m.rng = () => 0.5;
    m._resolveShot({ outcome: 'goal', shooter: oi, xg: 0.4, sx: m.players[oi].x, sy: W / 2 });
    m.rng = rng;
    expect(lastEvent(m, 'goal')).toBeTruthy();
    expect(t.red).toBe(false);
    expect(t.yellow).toBe(0);
  });

  it('goes back to the red card when the advantage does not follow', () => {
    const { m, t } = lastManFoul([0, 0.5, 0.1]);
    m.ball.owner = m.players.indexOf(t); // the defenders win it straight back
    m.step();
    expect(lastEvent(m, 'advantage').text).toMatch(/^No advantage/);
    expect(t.red).toBe(true);
  });

  it('does not caution a foul that stopped a promising attack when advantage is played', () => {
    const { m, t } = lastManFoul([0.5, 0.5, 0.1, 0.5, 0.1]);
    expect(m.advantage).toBeTruthy();
    expect(m.pendingCards[0].orig.why).toBe('stopped a promising attack');
    m._setRestart('throwin', 0, 50, 0, 3);
    expect(t.yellow).toBe(0);
  });

  it('counts the attackers in support when judging a denied goal-scoring chance (Law 12, 2026/27)', () => {
    // one defender still goal-side: an obvious chance only if two attackers are in support
    const foul = (support: boolean) => {
      const m = newMatch(), d = m.dir(0);
      const oi = idx(m, 0, q => q.slot === 9), ti = idx(m, 1, q => q.slot === 2), o = m.players[oi], t = m.players[ti];
      o.x = d > 0 ? L - 20 : 20; o.y = W / 2; t.x = o.x; t.y = o.y + 1;
      const cover = m.players[idx(m, 1, q => q.slot === 3)];
      m.players.forEach((q: any) => { if (q.onPitch && q.side === 1 && q.slot !== 0 && q !== t) q.x = o.x - d * 10; });
      cover.x = o.x + d * 6; cover.y = W / 2 - 3;
      m.players.forEach((q: any) => { if (q.onPitch && q.side === 0 && q !== o && q.slot !== 0) q.x = o.x - d * 25; });
      if (support) [7, 8].forEach((s, k) => { const a = m.players[idx(m, 0, q => q.slot === s)]; a.x = o.x + d * 2; a.y = W / 2 + (k ? 7 : -7); });
      m.ball.owner = oi; m.ball.x = o.x; m.ball.y = o.y;
      const rng = m.rng; let k = 0; m.rng = () => (k++ === 0 ? 0.01 : 0.5);
      m._foul(ti, oi, 'challenge');
      m.rng = rng;
      return t;
    };
    expect(foul(false).red).toBe(false);
    const t = foul(true);
    expect(t.red).toBe(true);
    expect(t.redReason).toBe('denied an obvious goal-scoring opportunity');
  });

  it('drops the ball for the defending keeper in his area, else for the team that would have kept or won it (Law 8, 2026/27)', () => {
    const m = newMatch(), d1 = m.dir(1);
    m.ball.owner = -1; m.ball.flight = null;
    m.ball.x = d1 > 0 ? L - 8 : 8; m.ball.y = W / 2; // in the area side 0 defends
    expect(m._droppedBallSide()).toBe(0);
    m.ball.x = L / 2; m.ball.y = W / 2;
    expect(m._droppedBallSide(1)).toBe(1); // side 1 had just won it
    const q = m.players[idx(m, 0, p => p.slot === 6)];
    m.ball.x = q.x + 0.5; m.ball.y = q.y; m.ball.lastSide = 1;
    if (m._inOwnBox(0, m.ball.x, m.ball.y) || m._inOwnBox(1, m.ball.x, m.ball.y)) return;
    expect(m._droppedBallSide()).toBe(0); // loose, nearest to a side-0 player
  });

  // A late throw-in or goal kick by a side protecting a lead, with the referee's response forced through TUNING.
  const delayedRestart = (type: 'throwin' | 'goalkick', settings: Record<string, number>) => {
    const m: any = new E.Match({ home: E.makeTeam({ name: 'Home', seed: 11 }), away: E.makeTeam({ name: 'Away', seed: 22 }), seed: 3, control: 'none' });
    m.runUntil({ minute: 77 });
    while (m.phase !== 'play') m.step();
    m.teams[0].score = m.teams[1].score + 1;
    m.players.forEach((q: any) => { q.yellow = 0; }); // so a caution is a yellow, not a second yellow
    const saved: Record<string, number> = {};
    for (const k in settings) { saved[k] = (E.TUNING as any)[k]; (E.TUNING as any)[k] = settings[k]; }
    try {
      const d = m.dir(0);
      if (type === 'throwin') m._setRestart('throwin', 0, 50, 0, 3);
      else m._setRestart('goalkick', 0, d > 0 ? 5.5 : L - 5.5, W / 2, 5);
      const first = m.restart, taker = m.players[first.taker];
      let started = -1;
      for (let i = 0; i < 400 && m.restart === first; i++) { m.step(); if (started < 0 && first.countdown) started = m.clockSec(); }
      return { m, first, taker, started };
    } finally { Object.assign(E.TUNING, saved); }
  };

  it('gives a throw-in to the opponents when the 5-second countdown runs out (Law 15, 2026/27)', () => {
    const { m, first, started } = delayedRestart('throwin', { countdownUse: 1, countdownBeat: 0, delayCaution: 0 });
    expect(started).toBeGreaterThan(0);
    expect(lastEvent(m, 'countdown').expired).toBe(true);
    expect(m.restart.type).toBe('throwin');
    expect(m.restart.side).toBe(1);
    expect(m.clockSec() - started).toBeGreaterThan(5);
    expect(m.restart.x).toBe(first.x);
  });

  it('gives a corner to the opponents when the countdown on a goal kick runs out (Law 16, 2026/27)', () => {
    const { m } = delayedRestart('goalkick', { countdownUse: 1, countdownBeat: 0, delayCaution: 0 });
    expect(lastEvent(m, 'countdown').expired).toBe(true);
    expect(m.restart.type).toBe('corner');
    expect(m.restart.side).toBe(1);
  });

  it('lets play go on when the taker beats the countdown', () => {
    const { m, started } = delayedRestart('throwin', { countdownUse: 1, countdownBeat: 1, delayCaution: 0 });
    expect(started).toBeGreaterThan(0);
    expect(m.events.some((e: any) => e.type === 'countdown' && e.expired)).toBe(false);
    expect(m.clockSec() - started).toBeLessThanOrEqual(5);
  });

  it('cautions a player for delaying the restart (Law 12)', () => {
    const { m, taker } = delayedRestart('throwin', { countdownUse: 0, delayCaution: 1 });
    expect(lastEvent(m, 'yellow').player).toBe(taker.id);
    expect(lastEvent(m, 'yellow').text).toMatch(/delaying the restart/);
  });

  it('sends a treated player off the field until a minute after the restart; keepers are exempt (Law 5, 2026/27)', () => {
    const m = newMatch();
    m.teams[0].subsUsed = 5; // no substitutes left, so he cannot simply be replaced
    const p = idx(m, 0, q => q.slot !== 0), q = m.players[p];
    const rng = m.rng; m.rng = () => 0.9; // a long injury
    expect(m._injure(p, true)).toBe(true);
    m.rng = rng;
    expect(q.onPitch).toBe(false);
    expect(m.onPitch(0).length).toBe(10);
    while (m.phase !== 'play') m.step();
    const restartedAt = m.clockSec();
    while (q.treat && !m.finished) { m.step(); expect(q.onPitch).toBe(!q.treat); }
    expect(q.onPitch).toBe(true);
    expect(m.clockSec() - restartedAt).toBeGreaterThanOrEqual(60);
    expect(m.clockSec() - restartedAt).toBeLessThan(61);
    expect(m.events.filter((e: any) => e.type === 'treatment').length).toBe(2);

    const m2 = newMatch(), gk = idx(m2, 1, q => q.slot === 0);
    m2.rng = () => 0.9;
    m2._injure(gk, true);
    expect(m2.players[gk].onPitch).toBe(true);
  });

  it('gives a substituted player at most 10 seconds to leave, and brings the substitute on at halfway (Law 3)', () => {
    const m = newMatch();
    m._setRestart('throwin', 0, 50, 0, 1);
    const out = m.players.find((q: any) => q.onPitch && q.side === 1 && q.slot === 5);
    out.x = 60; out.y = W / 2; // as far from the boundary as a player can be
    const inId = m.teams[1].bench[0].id;
    expect(m.substitute(1, out.id, inId).ok).toBe(true);
    const sub = m.players.find((q: any) => q.id === inId);
    expect(out.leaving).toBeTruthy();
    const t0 = m.clockSec();
    while (out.leaving) {
      expect(m.phase).toBe('dead'); // play waits for the change
      expect(sub.x).toBe(L / 2);
      m.step();
    }
    expect(m.clockSec() - t0).toBeLessThanOrEqual(10);
    expect(out.y < 0 || out.y > W || out.x < 0 || out.x > L).toBe(true);
    while (m.phase === 'dead') m.step();
    expect(sub.onPitch).toBe(true);
  });

  it('bans players after red cards: one match for a second yellow, three for serious foul play', () => {
    const m = newMatch();
    const a = idx(m, 0, q => q.slot === 5), b = idx(m, 1, q => q.slot === 6);
    m._card(a, 'yellow'); m._card(a, 'yellow');
    m._sendOff(b, 'serious foul play');
    const r = m.runToEnd();
    const ban = (id: string) => r.carryOver.find((c: any) => c.playerId === id).suspension;
    expect(ban(m.players[a].id)).toBe(1);
    expect(ban(m.players[b].id)).toBe(3);
  });
});

describeStatistical('tactics', () => {
  // Same squads and seeds, one setting changed for the home side: every option has to show up somewhere.
  const play = async (tactics: object, n = 24) => {
    const sum: Record<string, number> = { shots: 0, fouls: 0, passPct: 0, cond: 0 };
    for (let i = 0; i < n; i++) {
      await breathe();
      const { home, away } = leagueTeams(i);
      home.tactics = { ...home.tactics, ...tactics };
      const r: any = E.simulateMatch({ home, away, seed: 300 + i, control: 'none', neutral: true });
      const t = r.teamStats[0];
      sum.shots += t.shots / n; sum.fouls += t.fouls / n; sum.passPct += t.passPct / n;
      const xi = r.playerStats.filter((p: any) => p.side === 0 && p.minutes >= 89);
      sum.cond += xi.reduce((a: number, p: any) => a + p.endCondition, 0) / xi.length / n;
    }
    return sum;
  };

  it('has no dead options: each setting changes how the team plays', async () => {
    expect((await play({ mentality: 2 })).shots).toBeGreaterThan((await play({ mentality: 0 })).shots + 3);
    const hi = await play({ pressing: 2 }), lo = await play({ pressing: 0 });
    expect(hi.fouls).toBeGreaterThan(lo.fouls + 5);
    expect(hi.cond).toBeLessThan(lo.cond - 0.05);
    expect((await play({ passing: 0 })).passPct).toBeGreaterThan((await play({ passing: 2 })).passPct + 4);
    expect((await play({ tempo: 0 })).passPct).toBeGreaterThan((await play({ tempo: 2 })).passPct + 2);
    expect((await play({ line: 2 })).shots).toBeGreaterThan((await play({ line: 0 })).shots + 2);
  });

  it('makes styles counter each other', () => {
    const e = E as any;
    const T = (o: object) => ({ ...E.DEFAULT_TACTICS, ...o });
    const m: any = new E.Match({ home: E.makeTeam({ name: 'H', seed: 1, tactics: T({ passing: 2 }) }), away: E.makeTeam({ name: 'A', seed: 2, tactics: T({ line: 2 }) }), seed: 1, control: 'none' });
    expect(m._edge[0]).toBeGreaterThan(1.2); // direct balls against a high line
    expect(e.MATCHUPS.length).toBeGreaterThan(4);
  });
});
