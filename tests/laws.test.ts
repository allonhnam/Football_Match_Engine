import { describe, it, expect } from 'vitest';
import * as E from '@/engine/engine';
import { leagueTeams } from '@/lib/league';

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
  it('takes every kick-off after a goal with all players in their own half (Law 8)', () => {
    let kickoffs = 0;
    const offenders: string[] = [];
    for (let i = 0; i < 12; i++) {
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
  }, 60_000);

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

  it('plays advantage and still shows the card at the next stoppage', () => {
    let advantages = 0, recalled = 0;
    for (let s = 1; s <= 12; s++) {
      const { home, away } = leagueTeams(s);
      const r: any = E.simulateMatch({ home, away, seed: s, control: 'none' });
      advantages += r.events.filter((e: any) => e.type === 'advantage' && !/^No advantage/.test(e.text)).length;
      recalled += r.events.filter((e: any) => e.type === 'advantage' && /^No advantage/.test(e.text)).length;
    }
    expect(advantages).toBeGreaterThan(12);
    expect(recalled).toBeGreaterThan(0);
    expect(recalled).toBeLessThan(advantages);
  }, 60_000);

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

describe('tactics', () => {
  // Same squads and seeds, one setting changed for the home side: every option has to show up somewhere.
  const play = (tactics: object, n = 24) => {
    const sum: Record<string, number> = { shots: 0, fouls: 0, passPct: 0, cond: 0 };
    for (let i = 0; i < n; i++) {
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

  it('has no dead options: each setting changes how the team plays', () => {
    expect(play({ mentality: 2 }).shots).toBeGreaterThan(play({ mentality: 0 }).shots + 3);
    const hi = play({ pressing: 2 }), lo = play({ pressing: 0 });
    expect(hi.fouls).toBeGreaterThan(lo.fouls + 5);
    expect(hi.cond).toBeLessThan(lo.cond - 0.05);
    expect(play({ passing: 0 }).passPct).toBeGreaterThan(play({ passing: 2 }).passPct + 4);
    expect(play({ tempo: 0 }).passPct).toBeGreaterThan(play({ tempo: 2 }).passPct + 2);
    expect(play({ line: 2 }).shots).toBeGreaterThan(play({ line: 0 }).shots + 2);
  }, 120_000);

  it('makes styles counter each other', () => {
    const e = E as any;
    const T = (o: object) => ({ ...E.DEFAULT_TACTICS, ...o });
    const m: any = new E.Match({ home: E.makeTeam({ name: 'H', seed: 1, tactics: T({ passing: 2 }) }), away: E.makeTeam({ name: 'A', seed: 2, tactics: T({ line: 2 }) }), seed: 1, control: 'none' });
    expect(m._edge[0]).toBeGreaterThan(1.2); // direct balls against a high line
    expect(e.MATCHUPS.length).toBeGreaterThan(4);
  });
});
