import { describe, it, expect } from 'vitest';
import * as E from '@/engine/engine';
import { LEAGUES, realTeam, setAttr, matchKits, colourDistance } from '@/lib/util';
import { breathe } from './breathe';
import { describeStatistical } from './statistical';

const clubs = LEAGUES.flatMap(l => l.teams.map(t => ({ league: l.code, ...t })));
const team = (name: string, formation = '4-3-3') => {
  const c = clubs.find(x => x.name === name)!;
  return realTeam(c.league, c.name, { formation }) as any;
};
const PITCH_GREEN = '#1F5E3A';

describe('real squads', () => {
  it('covers the five leagues with every club in each', () => {
    expect(LEAGUES.map(l => l.code).sort()).toEqual(['D1', 'E0', 'F1', 'I1', 'SP1']);
    for (const l of LEAGUES) expect(l.teams.length).toBeGreaterThanOrEqual(18);
  });

  it('gives every club 20 named players with ratings from 1 to 20 and a flag for every nationality', () => {
    for (const c of clubs) {
      const t = team(c.name);
      expect(t.players).toHaveLength(20);
      expect(new Set(t.players.map((p: any) => p.id)).size).toBe(20);
      expect(t.players.filter((p: any) => p.role === 'GK').length).toBeGreaterThanOrEqual(2);
      for (const p of t.players) {
        expect(p.name.trim().length).toBeGreaterThan(1);
        for (const k of E.ATTRS) expect(Number.isInteger(p.attrs[k]) && p.attrs[k] >= 1 && p.attrs[k] <= 20).toBe(true);
        if (p.nation) expect(p.flag).toMatch(/^[a-z]{2}(-[a-z]{3})?$/);
      }
    }
  });

  it('picks a legal lineup for every club in every formation', () => {
    for (const c of clubs) for (const f of Object.keys(E.FORMATIONS)) {
      expect(E.validateLineup(team(c.name, f)), `${c.name} ${f}`).toEqual([]);
    }
  });

  it('plays the edited player: changing an attribute changes the match', () => {
    const home = team('Arsenal'), away = team('Liverpool');
    const fp = (h: any) => { const r: any = E.simulateMatch({ home: h, away, seed: 3, control: 'none' }); return JSON.stringify([r.score, r.events.map((e: any) => [e.tick, e.type])]); };
    // pace is used every tick (a finishing edit only shows if that player happens to shoot)
    const striker = home.players.find((p: any) => p.id === home.xi[10]);
    const edited = setAttr(home, striker.id, 'pace', 1);
    expect(edited.players.find((p: any) => p.id === striker.id).attrs.pace).toBe(1);
    expect(home.players.find((p: any) => p.id === striker.id).attrs.pace).not.toBe(1); // the original is untouched
    expect(fp(edited)).not.toBe(fp(home));
  });

  it('keeps edited ratings between 1 and 20', () => {
    const t = team('Arsenal'), id = t.players[0].id;
    expect(setAttr(t, id, 'pace', 0).players[0].attrs.pace).toBe(1);
    expect(setAttr(t, id, 'pace', 25).players[0].attrs.pace).toBe(20);
  });
});

describe('kits', () => {
  it('never sends out two sides that look alike, or a side that vanishes into the pitch', () => {
    for (const a of clubs) for (const b of clubs) {
      if (a === b) continue;
      const k = matchKits(a, b);
      expect(colourDistance(k.home.color, k.away.color), `${a.name} v ${b.name}`).toBeGreaterThanOrEqual(150);
      expect(colourDistance(k.home.color, PITCH_GREEN), a.name).toBeGreaterThanOrEqual(125);
      expect(colourDistance(k.away.color, PITCH_GREEN), b.name).toBeGreaterThanOrEqual(125);
    }
  });

  it('lets the home side keep its colours and changes the away side only on a clash', () => {
    const c = (n: string) => clubs.find(x => x.name === n)!;
    const clash = matchKits(c('Arsenal'), c('Liverpool'));
    expect(clash.home.color).toBe(c('Arsenal').color);
    expect(clash.away.color).not.toBe(c('Liverpool').color);
    const fine = matchKits(c('Arsenal'), c('Chelsea'));
    expect(fine.away.color).toBe(c('Chelsea').color);
  });
});

describeStatistical('real squads realism', () => {
  it('keeps league matches between real squads near real goal and shot numbers', async () => {
    let goals = 0, shots = 0, n = 0;
    for (let i = 0; i < 60; i++) {
      await breathe();
      const l = LEAGUES[i % LEAGUES.length], ts = l.teams;
      const a = ts[(i * 7) % ts.length], b = ts[(i * 11 + 3) % ts.length];
      if (a === b) continue;
      const r: any = E.simulateMatch({ home: realTeam(l.code, a.name), away: realTeam(l.code, b.name), seed: 500 + i, control: 'none' });
      goals += r.score[0] + r.score[1]; shots += r.teamStats[0].shots + r.teamStats[1].shots; n++;
    }
    // real top-five leagues: about 2.8 goals and 25 shots a match
    expect(goals / n).toBeGreaterThan(2.2);
    expect(goals / n).toBeLessThan(3.4);
    expect(shots / n).toBeGreaterThan(19);
    expect(shots / n).toBeLessThan(30);
  });
});
