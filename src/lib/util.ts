import * as E from '@/engine/engine';
import TEAM_DATA from '@/data/teams.json';

export const clone = o => JSON.parse(JSON.stringify(o));
export const fx = (v, d = 1) => Number(v || 0).toFixed(d);
export const pct = v => Math.round((v || 0) * 100) + '%';
export const lastName = n => (n.split(' ').slice(1).join(' ') || n);
export const club = t => t.name.replace(/\s+(FC|CF|AFC|SC)$/i, '').trim();
export const hexSeed = s => (s >>> 0).toString(16).toUpperCase().padStart(6, '0').slice(-6);
export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
export const ovr = p => Math.round(E.roleRating(p));
export const ATTR_LABEL = { pace: 'Pace', stamina: 'Stamina', passing: 'Passing', vision: 'Vision', dribbling: 'Dribbling', shooting: 'Finishing', heading: 'Heading', tackling: 'Tackling', positioning: 'Positioning', keeping: 'Goalkeeping' };
export const TACTIC_META = {
  mentality: { label: 'Mentality', sub: 'Changes chance creation and risk', opts: ['Cautious', 'Balanced', 'Attacking'], hints: ['Deeper block, fewer counters conceded', 'Balanced risk', 'More shots, more counters conceded'] },
  pressing: { label: 'Pressing intensity', sub: 'Higher pressure increases fatigue', opts: ['Low', 'Mid', 'High'], hints: ['Saves legs, gives up territory', 'Presses in our half', 'More turnovers, faster fatigue, more fouls'] },
  line: { label: 'Defensive line', sub: 'How high the back line holds', opts: ['Deep', 'Medium', 'High'], hints: ['Space in front, fewer balls in behind', 'Holding a medium line', 'Compact, wins offsides, exposed to pace'] },
  width: { label: 'Width', sub: 'Where attacks are built', opts: ['Narrow', 'Normal', 'Wide'], hints: ['Central overloads, fewer crosses', 'Standard', 'More crosses, stretched defence'] },
  tempo: { label: 'Tempo', sub: 'How quickly the ball moves', opts: ['Slow', 'Normal', 'Fast'], hints: ['Control, less fatigue', 'Standard', 'More attacks, less control'] },
  passing: { label: 'Passing', sub: 'Pass length and risk', opts: ['Short', 'Mixed', 'Direct'], hints: ['Safe and short', 'Mixed', 'Long balls, more risk, more reward'] },
};
export const SPEEDS = [{ k: '1×', gps: 12 }, { k: '2×', gps: 24 }, { k: '4×', gps: 48 }, { k: '16×', gps: 192 }];
export const BANNER_TYPES = { goal: 1, yellow: 1, red: 1, sub: 1, injury: 1, penalty: 1, disallowed: 1, shootoutkick: 1 };
export const RESTART_LABEL = { kickoff: 'Kick-off', freekick: 'Free kick', corner: 'Corner', throwin: 'Throw-in', goalkick: 'Goal kick', penalty: 'Penalty', dropball: 'Dropped ball' };
export function posLabel(formation, slot) {
  const s = E.FORMATIONS[formation][slot]; if (!s) return '';
  const [role, sx, sy] = s;
  if (role === 'GK') return 'GK';
  const side = sy < 0.25 ? 'L' : sy > 0.75 ? 'R' : 'C';
  if (role === 'DF') return side === 'C' ? 'CB' : side + (sx > 0.06 ? 'WB' : 'B');
  if (role === 'MF') { if (side !== 'C') return sx > 0.6 ? side + 'W' : side + 'M'; return sx < 0.36 ? 'DM' : sx > 0.6 ? 'AM' : 'CM'; }
  return side === 'C' ? 'ST' : side + 'W';
}
export function textOn(hex) { const c = (hex || '#000').replace('#', ''); const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0B0F0E' : '#FFFFFF'; }
export function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
// Real clubs and their real squads, from the latest season of each league (built by `npm run build-teams`).
const DATA: any = TEAM_DATA;
export const LEAGUES: { code: string; name: string; season: string; teams: any[] }[] = DATA.leagues;
// A club's squad seed is fixed by its name, so picking the same club always gives the same squad.
const nameSeed = (n: string) => { let h = 7; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 1000000; };
// Squad numbers are not in the data: keepers wear 1 and 13, everyone else 2 to 21 in squad order (skipping 13).
function realPlayers(t: any) {
  let gk = 0, n = 2;
  return t.players.map(([id, name, role, side, flag, nation, born, height, foot, attrs]: any[]) => {
    let num: number;
    if (role === 'GK') num = gk++ ? 13 : 1;
    else { if (n === 13) n++; num = n++; }
    return {
      id: 'tm' + id, name, num, role, side, condition: 1, unavailable: null,
      attrs: Object.fromEntries(DATA.attrs.map((k: string, i: number) => [k, attrs[i]])),
      flag, nation, born, height, foot,
    };
  });
}
// How different two colours look ("redmean" weighted RGB distance, 0 to about 765).
export function colourDistance(a: string, b: string) {
  const rgb = (h: string) => { const c = (h || '#000').replace('#', ''); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) || 0); };
  const [x, y] = [rgb(a), rgb(b)], rm = (x[0] + y[0]) / 2, dr = x[0] - y[0], dg = x[1] - y[1], db = x[2] - y[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}
const PITCH_GREEN = '#1F5E3A', NEAR_PITCH = 125, NEAR_KIT = 150;
// Kits for a match, as a referee would rule: the home side keeps its first colour unless it vanishes into the pitch;
// the away side changes to its second colour (then white, then black) when it is too close to the home kit or the
// pitch. The kit not worn becomes the second colour.
export function matchKits(home: any, away: any) {
  const pick = (t: any, avoid: string[]) => {
    const tries = [t.color, t.color2, '#FFFFFF', '#111111'].filter(Boolean);
    const ok = (c: string) => colourDistance(c, PITCH_GREEN) >= NEAR_PITCH && avoid.every(a => colourDistance(c, a) >= NEAR_KIT);
    const score = (c: string) => Math.min(colourDistance(c, PITCH_GREEN) / NEAR_PITCH, ...avoid.map(a => colourDistance(c, a) / NEAR_KIT));
    const c = tries.find(ok) || tries.slice().sort((p, q) => score(q) - score(p))[0];
    return c === t.color ? t : { ...t, color: c, color2: t.color };
  };
  const h = pick(home, []);
  return { home: h, away: pick(away, [h.color]) };
}
// Club crests are the clubs' trademarks, so they are not stored here: the browser loads them from transfermarkt.
export const crestUrl = (id: number | string) => `https://tmssl.akamaized.net/images/wappen/head/${id}.png`;
// The best XI and bench. For a real club it also prefers a player who plays on the slot's side (a natural full-back
// or winger out wide, a central player in the middle), since real squads say which side each player plays on. Other
// teams use the engine's own pick, the one the engine is calibrated with.
export function pickXI(team: any, formation: string) {
  if (!team.league) return E.autoPick(team.players, formation as any);
  const used = new Set<string>(), xi: string[] = [];
  const side = (sy: number) => sy < 0.3 ? 'L' : sy > 0.7 ? 'R' : 'C';
  E.FORMATIONS[formation].forEach((slot: any, i: number) => {
    const ss = side(slot[2]);
    let best: any = null, bs = -Infinity;
    for (const p of team.players) {
      if (used.has(p.id) || p.unavailable) continue;
      const bonus = ss === 'C' ? (p.side === 'C' ? 2 : 0) : p.side === ss ? 5 : 0;
      const sc = E.positionFit(p, formation as any, i) * 100 + E.roleRating(p) + bonus;
      if (sc > bs) { bs = sc; best = p; }
    }
    if (best) { used.add(best.id); xi.push(best.id); }
  });
  return { xi, bench: team.players.filter((p: any) => !used.has(p.id) && !p.unavailable).slice(0, 9).map((p: any) => p.id) };
}
export function realTeam(league: string, name: string, keep: any = {}) {
  const l = LEAGUES.find(x => x.code === league), t = l && l.teams.find(x => x.name === name);
  if (!t) return null;
  const team: any = { ...E.makeTeam({ name: t.name, short: t.short, seed: nameSeed(t.name), strength: t.strength, color: t.color, color2: t.color2, players: realPlayers(t), formation: keep.formation || '4-3-3', tactics: keep.tactics }), league, crest: t.crest };
  return { ...team, ...pickXI(team, team.formation) };
}
// The built-in attributes of a real player, for "reset" after editing (null for generated players).
export function realAttrs(league: string | undefined, club: string, id: string) {
  const t = LEAGUES.find(x => x.code === league)?.teams.find(x => x.name === club);
  const row = t && t.players.find((r: any[]) => 'tm' + r[0] === id);
  return row ? Object.fromEntries(DATA.attrs.map((k: string, i: number) => [k, row[9][i]])) : null;
}
// Age in whole years today, from a "YYYY-MM-DD" birth date.
export const ageOf = (born?: string | null) => born ? Math.floor((Date.now() - Date.parse(born)) / (365.25 * 864e5)) : null;
// A copy of the team with one player's attribute set (1 to 20).
export function setAttr(team: any, id: string, key: string, value: number) {
  const v = Math.max(1, Math.min(20, Math.round(value)));
  return { ...team, players: team.players.map((p: any) => p.id === id ? { ...p, attrs: { ...p.attrs, [key]: v } } : p) };
}
export function defaultTeams() {
  const l = LEAGUES[0];
  return {
    home: realTeam(l.code, l.teams[0].name, { formation: '4-3-3' }) as any,
    away: realTeam(l.code, l.teams[1].name, { formation: '4-2-3-1' }) as any,
  };
}
// A real squad keeps its players when the strength slider moves (every attribute shifts by the same amount, keeping
// the lineup); a new random squad replaces them with generated players, so the team is no longer the real club.
export function rebuildSquad(team, patch) {
  if (team.league && patch.seed == null && patch.strength != null) {
    const d = patch.strength - team.strength;
    const players = team.players.map(p => ({ ...p, attrs: Object.fromEntries(Object.entries(p.attrs).map(([k, v]: any) => [k, k === 'keeping' && p.role !== 'GK' ? v : Math.max(1, Math.min(20, Math.round(v + d)))])) }));
    return { ...team, strength: patch.strength, players };
  }
  return { ...E.makeTeam({ name: team.name, short: team.short, color: team.color, color2: team.color2, seed: patch.seed ?? team.seed, strength: patch.strength ?? team.strength, formation: team.formation, tactics: team.tactics }), league: patch.seed != null ? undefined : team.league, crest: patch.seed != null ? undefined : team.crest };
}
