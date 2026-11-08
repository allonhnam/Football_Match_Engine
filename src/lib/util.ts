import * as E from '@/engine/engine';

export const clone = o => JSON.parse(JSON.stringify(o));
export const fx = (v, d = 1) => Number(v || 0).toFixed(d);
export const pct = v => Math.round((v || 0) * 100) + '%';
export const lastName = n => (n.split(' ').slice(1).join(' ') || n);
export const club = t => t.name.split(' ')[0];
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
export const BANNER_TYPES = { goal: 1, yellow: 1, red: 1, sub: 1, injury: 1, penalty: 1, disallowed: 1 };
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
export function defaultTeams() {
  return {
    home: E.makeTeam({ name: 'Northbridge FC', short: 'NBR', seed: 11, strength: 13, color: '#C6F432', formation: '4-3-3' }),
    away: E.makeTeam({ name: 'Harbour City', short: 'HBR', seed: 22, strength: 12, color: '#6E8CFF', formation: '4-2-3-1' }),
  };
}
export function rebuildSquad(team, patch) { return E.makeTeam({ name: team.name, short: team.short, color: team.color, seed: patch.seed ?? team.seed, strength: patch.strength ?? team.strength, formation: team.formation, tactics: team.tactics }); }
