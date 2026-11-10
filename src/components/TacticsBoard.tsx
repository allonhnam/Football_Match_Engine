'use client';
/* eslint-disable */
import * as React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import * as E from '@/engine/engine';
import { fx, pct, lastName, ovr, ATTR_LABEL, TACTIC_META, posLabel, textOn, setAttr, realAttrs, ageOf, pickXI } from '@/lib/util';
import { I, Icon, Btn, Seg, Card, Badge, Progress, PageHead, Flag, Abbr, GLOSSARY } from '@/components/ui';
import { runBatch } from '@/lib/batch';

const ROLE_NAME = { GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward' };

// Edit one player's ten attributes (1 to 20). Every change goes straight into the team sheet the engine plays.
function PlayerEditor({ p, team, onSet, onReset, onClose }: any) {
  const base = realAttrs(team.league, team.name, p.id);
  const changed = base && E.ATTRS.some(k => base[k] !== p.attrs[k]);
  const age = ageOf(p.born);
  return (
    <div className="rounded-md border border-accent/50 bg-bg p-3">
      <div className="flex items-start gap-2">
        <Flag code={p.flag} title={p.nation} h={18} />
        <div className="min-w-0 flex-1">
          <b className="block text-[13.5px] leading-tight truncate">{p.name}</b>
          <span className="block text-[10.5px] text-dim uppercase tracking-wide">#{p.num} · {ROLE_NAME[p.role]}{p.side !== 'C' ? ' · ' + p.side : ''}{p.nation ? ' · ' + p.nation : ''}</span>
          {(age != null || p.height || p.foot) && <span className="block text-[10.5px] text-dim">{[age != null && `${age} yrs`, p.height && `${p.height} cm`, p.foot && `${p.foot} foot`].filter(Boolean).join(' · ')}</span>}
        </div>
        <span className="font-display font-bold text-[22px] tnum leading-none" title="Overall for his position">{ovr(p)}</span>
        <button onClick={onClose} aria-label="Close editor" className="text-dim hover:text-ink -mr-1"><Icon n="x" s={14} /></button>
      </div>
      <div className="flex flex-col gap-1.5 mt-3">
        {E.ATTRS.map(k => (
          <div key={k} className="flex items-center gap-2 text-[11.5px]">
            <label htmlFor={`attr-${p.id}-${k}`} className={`w-[74px] ${base && base[k] !== p.attrs[k] ? 'text-accent' : 'text-dim'}`}>{ATTR_LABEL[k]}</label>
            <button onClick={() => onSet(k, p.attrs[k] - 1)} disabled={p.attrs[k] <= 1} aria-label={`Lower ${ATTR_LABEL[k]}`} className="w-5 h-5 rounded border border-line text-dim hover:text-ink disabled:opacity-30 leading-none">−</button>
            <input id={`attr-${p.id}-${k}`} type="range" min="1" max="20" value={p.attrs[k]} onChange={e => onSet(k, +e.target.value)} className="flex-1 min-w-0" />
            <button onClick={() => onSet(k, p.attrs[k] + 1)} disabled={p.attrs[k] >= 20} aria-label={`Raise ${ATTR_LABEL[k]}`} className="w-5 h-5 rounded border border-line text-dim hover:text-ink disabled:opacity-30 leading-none">+</button>
            <span className="font-mono w-5 text-right tnum">{p.attrs[k]}</span>
          </div>))}
      </div>
      <div className="flex items-center justify-between gap-2 mt-3">
        <span className="text-[10.5px] text-dim">{base ? 'Ratings derived from position, age, height and market value.' : 'Generated player.'}</span>
        {changed && <Btn size="sm" onClick={() => onReset(base)}>Reset</Btn>}
      </div>
    </div>
  );
}

// A formation slot's caption, as one string (a title with several text children does not hydrate cleanly).
const slotTitle = (pos: string, p: any) => `${pos}${GLOSSARY[pos] ? ` · ${GLOSSARY[pos]}` : ''}${p ? `: ${p.name}` : ': empty, click to pick a player'}`;

export function TacticsBoard({ teams, setTeams, side, setSide }: any) {
  const t = teams[side];
  const [sel, setSel] = useState(null), [sort, setSort] = useState('role'), [hover, setHover] = useState(null), [editId, setEditId] = useState(null);
  const errs = E.validateLineup(t);
  const byId = useMemo(() => new Map<string, any>(t.players.map(p => [p.id, p] as [string, any])), [t]);
  const slots = E.FORMATIONS[t.formation];
  const setTeam = fn => setTeams(tt => ({ ...tt, [side]: fn(tt[side]) }));
  const place = (slotIdx, pid) => setTeam(tm => { const xi = tm.xi.slice(), bench = tm.bench.slice(); const cur = xi[slotIdx]; const j = xi.indexOf(pid), b = bench.indexOf(pid); if (j >= 0) xi[j] = cur; else if (b >= 0) bench[b] = cur; xi[slotIdx] = pid; return { ...tm, xi, bench: bench.filter(Boolean) }; });
  const toBench = pid => setTeam(tm => (tm.bench.includes(pid) || tm.xi.includes(pid) || tm.bench.length >= 9) ? tm : { ...tm, bench: [...tm.bench, pid] });
  const toggleUnavailable = pid => setTeam(tm => ({ ...tm, players: tm.players.map(p => p.id === pid ? { ...p, unavailable: p.unavailable ? null : 'suspended' } : p) }));
  const setFormation = f => setTeam(tm => { const pick = pickXI(tm, f); return { ...tm, formation: f, xi: pick.xi, bench: pick.bench }; });
  const autoPick = () => setTeam(tm => { const pick = pickXI(tm, tm.formation); return { ...tm, xi: pick.xi, bench: pick.bench }; });
  const roleOrder = { GK: 0, DF: 1, MF: 2, FW: 3 };
  const list = t.players.slice().sort((a, b) => sort === 'role' ? roleOrder[a.role] - roleOrder[b.role] || ovr(b) - ovr(a) : sort === 'rating' ? ovr(b) - ovr(a) : a.condition - b.condition);
  const editP = editId ? byId.get(editId) : null;
  const status = p => t.xi.includes(p.id) ? 'XI' : t.bench.includes(p.id) ? 'Bench' : 'Reserve';
  const [pred, setPred] = useState(null), [predP, setPredP] = useState(0); const runId = useRef(0);
  useEffect(() => {
    if (errs.length) { setPred(null); return; }
    const id = ++runId.current;
    const h = setTimeout(async () => {
      setPredP(0.01); const N = 40;
      const res = await runBatch(Array.from({ length: N }, (_, i) => ({ home: teams.home, away: teams.away, seed: 9000 + i, control: 'none' })), p => { if (runId.current === id) setPredP(p); });
      if (runId.current !== id) return;
      const me = side === 'home' ? 0 : 1; let w = 0, d = 0, l = 0, xf = 0, xa = 0;
      res.forEach(r => { if (!r || r.errors) return; const a = r.score[me], b = r.score[1 - me]; if (a > b) w++; else if (a < b) l++; else d++; xf += r.ts[me].xg; xa += r.ts[1 - me].xg; });
      setPred({ w: w / N, d: d / N, l: l / N, xf: xf / N, xa: xa / N, n: N }); setPredP(0);
    }, 500);
    return () => clearTimeout(h);
  }, [teams, side]);
  const BW = 340, BH = BW * 105 / 68, pad = 12;
  const sx = v => pad + v * (BW - 2 * pad), sy = v => pad + v * (BH - 2 * pad);
  const slotPos = s => ({ x: sx(s[2]), y: sy(1 - (s[0] === 'GK' ? 0.035 : 0.12 + s[1] * 0.72)) });
  const opp = teams[side === 'home' ? 'away' : 'home'];
  return (
    <div className="glow-bg min-h-[calc(100vh-56px)]">
      <div className="gutter mx-auto max-w-[1440px] py-8 flex flex-col gap-5">
        <PageHead eyebrow={`Squad & tactics · ${side}`} title={<span className="flex items-center gap-3"><Badge color={t.color} label={t.short} size={44} crest={t.crest} />{t.name}</span>}
          right={<div className="flex gap-2 items-center flex-wrap"><div className="w-56"><Seg id="board-side" value={side === 'home' ? 0 : 1} options={[teams.home.short + ' · home', teams.away.short + ' · away']} onChange={i => { setSide(i ? 'away' : 'home'); setSel(null); setEditId(null); }} /></div><Btn onClick={autoPick}>Auto-pick best XI</Btn></div>} />
        <div className={`rounded-md px-4 py-2.5 text-[12.5px] flex flex-wrap gap-x-4 gap-y-1 items-center border ${errs.length ? 'border-bad/50 bg-bad/10' : 'border-good/40 bg-good/10'}`}>
          {errs.length ? <><b className="text-bad">{errs.length} issue{errs.length > 1 ? 's' : ''} · kick-off is disabled</b>{errs.map((e, i) => <span key={i} className="text-bad">• {e.message}</span>)}</> : <b className="text-good flex items-center gap-1.5"><Icon n="check" s={14} />Lineup is legal: 11 starters, one goalkeeper, {t.bench.length} on the bench</b>}
        </div>
        <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)_340px]">
          <Card eyebrow={`${t.players.length} players`} title="Squad" right={<select id="squad-sort" value={sort} onChange={e => setSort(e.target.value)} className="h-8 rounded-md border border-line bg-bg px-2 text-[12px]"><option value="role">By position</option><option value="rating">By rating</option><option value="cond">By condition</option></select>}>
            <p className="text-dim text-[11.5px] mb-2">Drag a player onto a shirt, or click a shirt then a player. Click a player to edit his attributes.</p>
            <ul className="flex flex-col max-h-[380px] lg:max-h-[640px] overflow-y-auto scroll-thin pr-1 divide-y divide-line">
              {list.map(p => { const st = status(p); return (
                <li key={p.id} draggable={!p.unavailable} onDragStart={e => e.dataTransfer.setData('text/plain', p.id)} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => { if (sel != null && !p.unavailable) { place(sel, p.id); setSel(null); } else setEditId(editId === p.id ? null : p.id); }}
                  className={`group flex items-center gap-2 px-1.5 py-1.5 cursor-pointer hover:bg-surface2 ${editId === p.id ? 'bg-surface2' : ''} ${p.unavailable ? 'opacity-45' : ''}`}>
                  <span className="w-7 h-7 grid place-items-center rounded-full text-[11px] font-bold shrink-0" style={st === 'XI' ? { background: t.color, color: textOn(t.color) } : { border: '1px solid var(--line)' }}>{p.num}</span>
                  <span className="flex-1 min-w-0"><span className="flex items-center gap-1.5 text-[12.5px] font-medium"><Flag code={p.flag} title={p.nation} h={10} /><span className="truncate">{p.name}</span></span><span className="block text-[10.5px] text-dim uppercase tracking-wide"><Abbr>{p.role}</Abbr>{p.side !== 'C' ? <> · <Abbr t={p.side === 'L' ? 'Plays on the left' : 'Plays on the right'}>{p.side}</Abbr></> : ''} · {p.unavailable ? <span className="text-bad">{p.unavailable}</span> : st}</span></span>
                  <span className="font-display font-bold text-[17px] tnum w-6 text-right">{ovr(p)}</span>
                  <button onClick={e => { e.stopPropagation(); setEditId(editId === p.id ? null : p.id); }} title="Edit attributes" aria-label={`Edit ${p.name}`} className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[11px] text-dim hover:text-accent w-5">✎</button>
                  <button onClick={e => { e.stopPropagation(); toggleUnavailable(p.id); }} title={p.unavailable ? 'Mark available' : 'Mark suspended (tests validation)'} className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[11px] text-dim hover:text-bad w-5">{p.unavailable ? '↺' : '⊘'}</button>
                </li>); })}
            </ul>
          </Card>
          <section className="order-first lg:order-none rounded-lg border border-line bg-surface p-4 flex flex-col items-center gap-3 min-w-0">
            <div className="flex w-full items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2"><span className="eyebrow">Formation</span><select id="formation" value={t.formation} onChange={e => setFormation(e.target.value)} className="h-9 rounded-md border border-line bg-bg px-2 font-display font-bold text-[18px]">{Object.keys(E.FORMATIONS).map(f => <option key={f}>{f}</option>)}</select></div>
              <div className="text-[11px] text-dim flex gap-3 flex-wrap uppercase tracking-wide">{[['good', 'Natural'], ['warn', 'Adequate'], ['bad', 'Poor fit']].map(([c, l]) => <span key={l}><span className={`inline-block w-2.5 h-2.5 rounded-full border-2 border-${c} align-middle mr-1`} />{l}</span>)}</div>
            </div>
            <div className="w-full max-w-[370px]">
              <svg viewBox={`0 0 ${BW} ${BH}`} className="w-full h-auto rounded-md" role="img" aria-label={`${t.formation} formation board`}>
                <rect width={BW} height={BH} fill="var(--pitch-a)" />
                {Array.from({ length: 14 }).map((_, i) => i % 2 ? <rect key={i} x="0" y={i * BH / 14} width={BW} height={BH / 14} fill="var(--pitch-b)" /> : null)}
                <g fill="none" stroke="var(--pitch-line)" strokeWidth="1.4">
                  <rect x={pad} y={pad} width={BW - 2 * pad} height={BH - 2 * pad} /><line x1={pad} y1={BH / 2} x2={BW - pad} y2={BH / 2} /><circle cx={BW / 2} cy={BH / 2} r={9.15 / 68 * (BW - 2 * pad)} />
                  {[0, 1].map(e => { const w = 40.32 / 68 * (BW - 2 * pad), dpt = 16.5 / 105 * (BH - 2 * pad), w2 = 18.32 / 68 * (BW - 2 * pad), d2 = 5.5 / 105 * (BH - 2 * pad); return <g key={e}><rect x={BW / 2 - w / 2} y={e ? BH - pad - dpt : pad} width={w} height={dpt} /><rect x={BW / 2 - w2 / 2} y={e ? BH - pad - d2 : pad} width={w2} height={d2} /></g>; })}
                </g>
                <text x={BW / 2} y={pad + 20} textAnchor="middle" fontSize="9" letterSpacing="1.5" fill="rgba(255,255,255,.55)" fontFamily="JetBrains Mono">ATTACK ↑</text>
                {slots.map((s, i) => {
                  const p = byId.get(t.xi[i]), { x, y } = slotPos(s), fit = p ? E.positionFit(p, t.formation, i) : 0;
                  const ring = !p ? 'rgba(255,255,255,.5)' : p.unavailable ? 'var(--bad)' : fit >= 0.95 ? 'var(--good)' : fit >= 0.7 ? 'var(--warn)' : 'var(--bad)';
                  const fill = p ? (s[0] === 'GK' ? '#FFD23C' : t.color) : 'rgba(0,0,0,.3)';
                  return (
                    <g key={i} style={{ cursor: 'pointer' }} onClick={() => setSel(sel === i ? null : i)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) place(i, id); setSel(null); }}>
                      <title>{slotTitle(posLabel(t.formation, i), p)}</title>
                      {sel === i && <circle cx={x} cy={y} r="22" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 3" />}
                      <circle cx={x} cy={y} r="15" fill={fill} stroke={ring} strokeWidth="3" />
                      <text x={x} y={y + 4.5} textAnchor="middle" fontSize="12" fontWeight="700" fill={p ? textOn(fill) : '#fff'} fontFamily="Inter">{p ? p.num : '+'}</text>
                      <rect x={x - 26} y={y + 19} width="52" height="14" rx="3" fill="var(--chip)" />
                      <text x={x} y={y + 29.5} textAnchor="middle" fontSize="9" fill="#fff" fontFamily="Inter" fontWeight="500">{p ? lastName(p.name).slice(0, 10) : posLabel(t.formation, i)}</text>
                    </g>);
                })}
              </svg>
            </div>
            <div className="w-full">
              <div className="eyebrow mb-1.5">Bench · {t.bench.length}/9</div>
              <div className="flex flex-wrap gap-1.5">
                {t.bench.map(id => { const p = byId.get(id); if (!p) return null; return <span key={id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', id)} onClick={() => { if (sel != null) { place(sel, id); setSel(null); } }} className="cursor-grab rounded-md border border-line bg-bg px-2 py-1 text-[11.5px]"><b className="font-mono mr-1">{p.num}</b>{lastName(p.name)} <span className="text-dim">{p.role}</span></span>; })}
                {t.players.filter(p => status(p) === 'Reserve' && !p.unavailable).slice(0, 3).map(p => <button key={p.id} onClick={() => toBench(p.id)} className="rounded-md border border-dashed border-line px-2 py-1 text-[11.5px] text-dim hover:text-ink">+ {lastName(p.name)}</button>)}
              </div>
            </div>
            <div className="w-full rounded-md border border-accent/40 bg-accent/[.06] p-3 border-l-[3px] border-l-accent">
              <div className="flex items-center justify-between gap-2"><span className="eyebrow-accent">Predicted v {opp.name}</span><span className="text-[10.5px] text-dim font-mono">{pred ? `${pred.n} SIMULATIONS` : errs.length ? 'FIX LINEUP FIRST' : 'RUNNING…'}</span></div>
              {predP > 0 && <div className="mt-2"><Progress v={predP} /></div>}
              {pred && <div className="mt-2">
                <div className="flex h-7 rounded overflow-hidden text-[11.5px] font-bold"><div className="grid place-items-center bg-accent text-accentink" style={{ width: pct(pred.w) }}>{pred.w > 0.12 && `W ${pct(pred.w)}`}</div><div className="grid place-items-center bg-surface2" style={{ width: pct(pred.d) }}>{pred.d > 0.12 && `D ${pct(pred.d)}`}</div><div className="grid place-items-center bg-bad text-white" style={{ width: pct(pred.l) }}>{pred.l > 0.12 && `L ${pct(pred.l)}`}</div></div>
                <div className="text-[12px] text-dim mt-1.5">Expected goals <b className="text-ink tnum">{fx(pred.xf, 2)}</b> for, <b className="text-ink tnum">{fx(pred.xa, 2)}</b> against. Change anything and it reruns.</div>
              </div>}
            </div>
          </section>
          <div className="flex flex-col gap-4 min-w-0">
          {editP && <PlayerEditor p={editP} team={t} onClose={() => setEditId(null)}
            onSet={(k, v) => setTeam(tm => setAttr(tm, editP.id, k, v))}
            onReset={base => setTeam(tm => ({ ...tm, players: tm.players.map(q => q.id === editP.id ? { ...q, attrs: { ...base } } : q) }))} />}
          <Card eyebrow="Team instructions" title="Tactics">
            <div className="flex flex-col gap-4">
              {E.TACTIC_KEYS.map(k => <div key={k}>
                <div className="flex justify-between items-baseline mb-1.5 gap-2"><span className="eyebrow">{TACTIC_META[k].label}</span><span className="text-[11px] text-dim text-right">{TACTIC_META[k].hints[t.tactics[k]]}</span></div>
                <Seg id={`tac-${k}`} value={t.tactics[k]} options={TACTIC_META[k].opts} onChange={i => setTeam(tm => ({ ...tm, tactics: { ...tm.tactics, [k]: i } }))} size="sm" />
              </div>)}
            </div>
            {hover && hover.id !== editId && <div className="mt-4 rounded-md border border-line bg-bg p-3">
              <div className="flex items-center justify-between"><b className="text-[12.5px] flex items-center gap-1.5"><Flag code={hover.flag} title={hover.nation} h={10} />{hover.name}</b><span className="font-display font-bold text-[18px]">{ovr(hover)}</span></div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">{E.ATTRS.filter(k => hover.role === 'GK' || k !== 'keeping').map(k => <div key={k} className="flex items-center gap-2 text-[11px]"><span className="w-[72px] text-dim">{ATTR_LABEL[k]}</span><span className="flex-1 h-1 rounded bg-surface2"><span className="block h-1 rounded bg-accent" style={{ width: pct(hover.attrs[k] / 20) }} /></span><span className="font-mono w-5 text-right tnum">{hover.attrs[k]}</span></div>)}</div>
            </div>}
          </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

