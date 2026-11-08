import * as E from '@/engine/engine';
import { fx, pct, club } from '@/lib/util';


export function liveStats(m) {
  const pos = m.teams[0].stats.possession + m.teams[1].stats.possession || 1;
  return m.teams.map(t => ({ ...t.stats, possessionPct: Math.round(100 * t.stats.possession / pos), passPct: t.stats.passes ? Math.round(100 * t.stats.passesOk / t.stats.passes) : 0, cards: t.stats.yellows + t.stats.reds }));
}
export function eventTitle(e, m) {
  const T = e.side != null ? club(m.teams[e.side]) : '';
  const P = id => { const q = m.players.find(x => x.id === id); if (q) return q.p.name; for (const t of m.teams) { const b = (t.sheet.players || []).find(p => p.id === id); if (b) return b.name; } return ''; };
  switch (e.type) {
    case 'goal': return [`Goal · ${T}`, `${P(e.player)}${e.assist ? ' · Assisted by ' + P(e.assist) : ''} · ${fx(e.xg, 2)} xG`];
    case 'yellow': return [`Yellow card · ${T}`, e.text.replace('Yellow card: ', '')];
    case 'red': return [`Red card · ${T}`, e.text.replace('RED CARD: ', '')];
    case 'sub': return [`Substitution · ${T}`, `${P(e.player)} on, ${P(e.off)} off`];
    case 'injury': return [`Injury · ${T}`, e.text];
    case 'shot': return [`${e.result === 'saved' ? 'Save' : e.result === 'blocked' ? 'Blocked shot' : 'Off target'} · ${T}`, e.text];
    case 'penalty': return [`Penalty · ${T}`, e.text];
    case 'corner': return [`Corner · ${T}`, e.text];
    case 'offside': return [`Offside · ${T}`, e.text];
    case 'foul': return [`Foul · ${T}`, e.text];
    case 'tactic': return [`Tactical change · ${T}`, e.text.replace(m.teams[e.side].name + ' ', '')];
    case 'halftime': return ['Half-time', e.text.replace('Half-time: ', '')];
    case 'fulltime': return ['Full time', e.text.replace('Full time: ', '')];
    case 'addedtime': return ['Added time', e.text];
    case 'abandoned': return ['Match abandoned', e.text];
    case 'kickoff': return e.half === 2 ? ['Second half', `${m.teams[e.side].name} get us underway.`] : ['Kick-off', `${m.teams[0].name} v ${m.teams[1].name}`];
    default: return [e.type, e.text];
  }
}
export const DOT = { goal: 'bg-accent', yellow: 'bg-card', red: 'bg-bad', injury: 'bg-bad', penalty: 'bg-accent' };
export function buildInsight(m, now) {
  const mi = Math.floor(now / 60), from = Math.max(0, mi - 7);
  const sum = (arr, s) => { let v = 0; for (let k = from; k < Math.min(arr.length, mi + 1); k++) v += (arr[k] || [0, 0])[s]; return v; };
  const ev = m.events.filter(e => e.t >= from * 60 && (e.type === 'shot' || e.type === 'goal'));
  const c = [0, 1].map(s => ({ s, box: sum(m.boxMin, s), f3: sum(m.f3Min, s), poss: sum(m.possMin, s), shots: ev.filter(e => e.side === s).length, xg: ev.filter(e => e.side === s).reduce((a, e) => a + (e.xg || 0), 0) }));
  const possTot = c[0].poss + c[1].poss || 1;
  const range = `${from}–${mi}'`;
  const cands = [];
  for (const k of c) {
    const o = c[1 - k.s], name = club(m.teams[k.s]);
    if (k.shots >= 3 && k.xg >= 0.4) cands.push({ w: k.xg * 3 + k.shots * 0.2, title: `${name} are turning pressure into chances`, body: `${k.shots} shots worth ${fx(k.xg, 2)} xG since ${from}'` });
    if (k.box >= o.box + 2 && k.box >= 3) cands.push({ w: (k.box - o.box) * 0.6, title: `${name} are finding space centrally`, body: `${k.box} entries into the box in the last ${mi - from} minutes` });
    if (k.poss / possTot > 0.62) cands.push({ w: (k.poss / possTot - 0.5) * 8, title: `${name} are controlling the ball`, body: `${pct(k.poss / possTot)} possession since ${from}'` });
    const ps = m.onPitch(k.s).filter(q => q.slot !== 0); const avg = ps.reduce((a, q) => a + q.cond, 0) / (ps.length || 1);
    if (avg < 0.72) cands.push({ w: (0.75 - avg) * 12, title: `${name}'s legs are going`, body: `Outfield condition averages ${pct(avg)}; fresh legs would help` });
  }
  if (!cands.length) { const lead = c[0].f3 >= c[1].f3 ? 0 : 1; cands.push({ w: 0, title: 'An even spell', body: `${club(m.teams[lead])} edge final-third entries ${c[lead].f3}–${c[1 - lead].f3} since ${from}'` }); }
  cands.sort((a, b) => b.w - a.w);
  return { ...cands[0], range, at: mi };
}
export function whyItMatters(key, m, ts) {
  const shots = m.events.filter(e => e.type === 'shot' || e.type === 'goal');
  const lead = k => ts[0][k] >= ts[1][k] ? 0 : 1;
  switch (key) {
    case 'possessionPct': { const l = lead('possessionPct'); return `${club(m.teams[l])} have had ${ts[l].possessionPct}% of the ball. Possession only matters if it reaches the box: ${ts[l].boxEntries} box entries against ${ts[1 - l].boxEntries}.`; }
    case 'xg': { const l = lead('xg'); const best = shots.filter(e => e.side === l).sort((x, y) => y.xg - x.xg)[0]; return best ? `${club(m.teams[l])} lead on chance quality. Their best opening was ${(m.players.find(q => q.id === best.player) || { p: { name: '' } }).p.name}'s ${fx(best.xg, 2)} xG ${best.type === 'goal' ? 'finish' : 'effort'} at ${best.minute}.` : 'No shots yet.'; }
    case 'shots': case 'onTarget': { const l = lead('shots'); const good = shots.filter(e => e.side === l && (e.xg || 0) > 0.08).length; return `${club(m.teams[l])} have ${ts[l].shots} shots; ${good} came from good positions (above 0.08 xG). Volume without quality rarely wins matches.`; }
    case 'passes': case 'passPct': { const l = lead('passPct'); return `${club(m.teams[l])} complete ${ts[l].passPct}% of passes. Short passing raises accuracy; direct passing trades accuracy for faster attacks.`; }
    case 'f3Entries': case 'boxEntries': { const l = lead('boxEntries'); return `${club(m.teams[l])} have reached the box ${ts[l].boxEntries} times. Width and tempo change how often attacks get there.`; }
    case 'fouls': case 'cards': { const l = lead('fouls'); return `${club(m.teams[l])} commit more fouls (${ts[l].fouls}). High pressing wins the ball higher up but brings fouls and bookings.`; }
    default: return 'Compare this with the other stats to see what is driving the match.';
  }
}

