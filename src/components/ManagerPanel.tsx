'use client';
/* eslint-disable */
import * as React from 'react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as E from '@/engine/engine';
import { clone, fx, pct, lastName, club, hexSeed, store, ovr, ATTR_LABEL, TACTIC_META, SPEEDS, BANNER_TYPES, RESTART_LABEL, posLabel, textOn, cssVar, defaultTeams, rebuildSquad } from '@/lib/util';
import { I, Icon, Btn, Seg, Card, Badge, CondBar, CardIcon, Progress, PageHead, Tabs, Empty } from '@/components/ui';
export function Sec({ label, sub, children }: any) { return <div className="px-4 py-3.5 border-b border-line"><div className="flex items-baseline justify-between gap-2 mb-2"><span className="eyebrow">{label}</span>{sub && <span className="text-[11px] text-dim text-right">{sub}</span>}</div>{children}</div>; }
export function ManagerPanel({ m, control, bump, readOnly }: any) {
  const sides = control === 'both' ? [0, 1] : control === 'home' ? [0] : control === 'away' ? [1] : [];
  const [side, setSide] = useState(sides[0] ?? 0);
  const [outId, setOutId] = useState(null), [inId, setInId] = useState(null), [msg, setMsg] = useState(null);
  const tm = m.teams[side];
  const pendingT = tm.pending.find(c => c.kind === 'tactics');
  const [draft, setDraft] = useState({ ...tm.tactics });
  useEffect(() => { setDraft({ ...m.teams[side].tactics, ...(pendingT ? pendingT.tactics : {}) }); setOutId(null); setInId(null); }, [side]);
  if (readOnly) return <p className="text-dim text-[12.5px] py-10 text-center px-4">This is a replay. Manager decisions are re-applied from the recorded command log, so they cannot be changed.</p>;
  if (!sides.length) return <p className="text-dim text-[12.5px] py-10 text-center px-4">You are watching: both teams are run by the AI manager. Choose a side under “You manage” in match setup to make decisions.</p>;
  const onP = m.onPitch(side).slice().sort((a, b) => a.cond - b.cond);
  const queued = tm.pending.filter(c => c.kind === 'sub'), subsLeft = 5 - tm.subsUsed - queued.length;
  const doSub = () => { const r = m.substitute(side, outId, inId); setMsg(r.ok ? { ok: true, t: r.queued ? 'Queued. It happens at the next stoppage.' : 'Substitution made.' } : { ok: false, t: r.error }); if (r.ok) { setOutId(null); setInId(null); } bump(); };
  const changed = E.TACTIC_KEYS.some(k => draft[k] !== tm.tactics[k]);
  const applyT = d => { const r = m.setTactics(side, d); setDraft({ ...d }); setMsg({ ok: true, t: r.queued ? 'Tactics queued for the next stoppage.' : 'Tactics applied.' }); bump(); };
  const diff = tm.score - m.teams[1 - side].score, minute = m.minute();
  const sugg = [];
  const tired = onP.filter(q => q.slot !== 0 && q.cond < 0.66 && !queued.some(c => c.outId === q.id));
  if (tired[0] && subsLeft > 0) { const rep = tm.bench.find(p => p.role === tired[0].p.role && !queued.some(c => c.inId === p.id)) || tm.bench.find(p => p.role !== 'GK' && !queued.some(c => c.inId === p.id)); const pl = posLabel(tm.formation, tired[0].slot); if (rep) sugg.push({ title: `Fresh legs ${pl.startsWith('L') ? 'on the left' : pl.startsWith('R') ? 'on the right' : 'through the middle'}`, body: `#${tired[0].p.num} ${lastName(tired[0].p.name)} at ${pct(tired[0].cond)} condition → bring on #${rep.num} ${lastName(rep.name)}`, act: () => { const r = m.substitute(side, tired[0].id, rep.id); setMsg(r.ok ? { ok: true, t: 'Queued. It happens at the next stoppage.' } : { ok: false, t: r.error }); bump(); } }); }
  if (diff < 0 && minute > 60 && tm.tactics.mentality < 2) sugg.push({ title: 'Chase the game', body: 'Switch to Attacking and Fast tempo', act: () => applyT({ ...tm.tactics, mentality: 2, tempo: 2 }) });
  if (diff > 0 && minute > 75 && tm.tactics.mentality > 0) sugg.push({ title: 'Protect the lead', body: 'Drop to Cautious and a deeper line', act: () => applyT({ ...tm.tactics, mentality: 0, line: 0 }) });
  const booked = onP.find(q => q.yellow && q.p.role === 'DF');
  if (booked && tm.tactics.pressing === 2) sugg.push({ title: 'Booked defender', body: `#${booked.p.num} ${lastName(booked.p.name)} is on a yellow while you press high`, act: () => applyT({ ...tm.tactics, pressing: 1 }) });
  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-line"><div className="eyebrow">Touchline</div><div className="text-[12.5px] mt-0.5">Changes apply at the next stoppage</div></div>
      <Sec label="Managing">
        <div className="flex items-center justify-between gap-3"><div className="w-36"><Seg id="mgr-side" value={side} options={['Home', 'Away']} onChange={i => sides.includes(i) && setSide(i)} size="sm" /></div><span className="text-[11px] text-dim truncate">{tm.name}</span></div>
        <div className="mt-3 rounded-md border border-line bg-bg/60 px-3 py-2.5 flex items-center justify-between">
          <div><div className="text-[12.5px] font-semibold">Subs {tm.subsUsed + queued.length} of 5</div><div className="text-[11px] text-dim">Windows {tm.windowsUsed} of 3 used · half-time is free</div></div>
          <div className="flex gap-1">{Array.from({ length: 5 }).map((_, i) => <span key={i} className={`w-1.5 h-5 rounded-sm ${i < tm.subsUsed ? 'bg-accent' : i < tm.subsUsed + queued.length ? 'bg-accent/50' : 'bg-surface2 border border-line'}`} />)}</div>
        </div>
      </Sec>
      {sugg.length > 0 && <Sec label="Quick suggestion" sub="Based on match state">
        <div className="flex flex-col gap-2">{sugg.slice(0, 2).map((s, i) => <div key={i} className="rounded-md border border-accent/50 bg-accent/[.06] px-3 py-2.5 flex items-center gap-3"><Icon n="up" s={14} className="text-accent shrink-0" /><div className="flex-1 min-w-0"><div className="text-[12.5px] font-semibold">{s.title}</div><div className="text-[11px] text-dim">{s.body}</div></div><button onClick={s.act} className="text-[11px] font-bold tracking-[.1em] text-accent hover:underline">ADD</button></div>)}</div>
      </Sec>}
      <Sec label="Mentality" sub={TACTIC_META.mentality.sub}><Seg id="mgr-mentality" value={draft.mentality} pendingFrom={tm.tactics.mentality} options={TACTIC_META.mentality.opts} onChange={i => setDraft(d => ({ ...d, mentality: i }))} size="sm" /></Sec>
      <Sec label="Pressing intensity" sub={TACTIC_META.pressing.sub}>
        <div className="flex items-center gap-2"><span className="text-[10px] text-dim tracking-wider">LOW</span><input id="mgr-pressing" type="range" min="0" max="2" step="1" value={draft.pressing} onChange={e => setDraft(d => ({ ...d, pressing: +e.target.value }))} className="flex-1" /><span className="text-[10px] text-dim tracking-wider">HIGH</span></div>
        <div className={`text-[11px] mt-1 ${draft.pressing !== tm.tactics.pressing ? 'text-accent' : 'text-dim'}`}>{TACTIC_META.pressing.opts[draft.pressing]}: {TACTIC_META.pressing.hints[draft.pressing]}</div>
      </Sec>
      <Sec label="Defensive line" sub={`Currently holding a ${TACTIC_META.line.opts[tm.tactics.line].toLowerCase()} line`}><Seg id="mgr-line" value={draft.line} pendingFrom={tm.tactics.line} options={TACTIC_META.line.opts} onChange={i => setDraft(d => ({ ...d, line: i }))} size="sm" /></Sec>
      <Sec label="Shape & tempo">
        <div className="flex flex-col gap-2">{['width', 'tempo', 'passing'].map(k => <div key={k} className="grid grid-cols-[64px_1fr] items-center gap-2"><span className="text-[11px] text-dim">{TACTIC_META[k].label}</span><Seg id={`mgr-${k}`} value={draft[k]} pendingFrom={tm.tactics[k]} options={TACTIC_META[k].opts} onChange={i => setDraft(d => ({ ...d, [k]: i }))} size="sm" /></div>)}</div>
        <div className="flex gap-2 mt-3"><Btn kind="primary" className="flex-1" disabled={!changed} onClick={() => applyT(draft)}>Apply tactics</Btn><Btn disabled={!changed} onClick={() => setDraft({ ...tm.tactics })}>Discard</Btn></div>
      </Sec>
      <Sec label="Substitution" sub={`${subsLeft} left`}>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-line max-h-52 overflow-y-auto scroll-thin"><div className="text-[10px] text-dim px-2 pt-1.5 tracking-wider">OFF · LOWEST CONDITION</div>
            {onP.map(q => <button key={q.id} onClick={() => setOutId(q.id)} disabled={queued.some(c => c.outId === q.id)} className={`w-full flex items-center gap-1.5 px-2 py-1 text-left text-[11.5px] disabled:opacity-40 ${outId === q.id ? 'bg-surface2 shadow-[inset_2px_0_0_var(--bad)]' : 'hover:bg-surface2'}`}><span className="font-mono w-5 text-dim">{q.p.num}</span><span className="flex-1 truncate">{lastName(q.p.name)}{q.injured && <span className="text-bad"> +</span>}</span>{q.yellow > 0 && <CardIcon />}<CondBar v={q.cond} w="w-7" /></button>)}</div>
          <div className="rounded-md border border-line max-h-52 overflow-y-auto scroll-thin"><div className="text-[10px] text-dim px-2 pt-1.5 tracking-wider">ON · BENCH</div>
            {tm.bench.map(p => <button key={p.id} onClick={() => setInId(p.id)} disabled={queued.some(c => c.inId === p.id)} className={`w-full flex items-center gap-1.5 px-2 py-1 text-left text-[11.5px] disabled:opacity-40 ${inId === p.id ? 'bg-surface2 shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-surface2'}`}><span className="font-mono w-5 text-dim">{p.num}</span><span className="flex-1 truncate">{lastName(p.name)}</span><span className="text-[10px] text-dim">{p.role}</span><b className="font-display text-[13px]">{ovr(p)}</b></button>)}
            {tm.bench.length === 0 && <div className="text-[11.5px] text-dim p-2">Bench is empty.</div>}</div>
        </div>
        <Btn kind="primary" className="w-full mt-2" disabled={!outId || !inId || m.finished} onClick={doSub}>Make substitution</Btn>
        {queued.length > 0 && <div className="mt-2 flex flex-col gap-1">{queued.map((c, i) => { const o = m.players.find(q => q.id === c.outId), nn = tm.bench.find(p => p.id === c.inId); return <div key={i} className="flex items-center gap-2 rounded-md border border-dashed border-accent/60 px-2 py-1 text-[11.5px]"><span className="text-accent">▲ {nn && lastName(nn.name)}</span><span className="text-bad">▼ {o && lastName(o.p.name)}</span><span className="flex-1 text-right text-dim">waiting for stoppage</span><button className="text-dim hover:text-bad" onClick={() => { m.cancelPending(side, tm.pending.indexOf(c)); bump(); }} aria-label="Cancel"><Icon n="x" s={12} /></button></div>; })}</div>}
      </Sec>
      <Sec label="Formation" sub={tm.formation}><div className="grid grid-cols-5 gap-1">{Object.keys(E.FORMATIONS).map(f => <button key={f} onClick={() => { const r = m.setFormation(side, f); setMsg({ ok: r.ok, t: r.ok ? `${f} ${r.queued ? 'queued for the next stoppage' : 'applied'}.` : r.error }); bump(); }} className={`rounded-md border h-8 font-display font-bold text-[14px] ${tm.formation === f ? 'border-accent text-accent' : 'border-line hover:bg-surface2'}`}>{f}</button>)}</div></Sec>
      {msg && <div className={`px-4 py-2 text-[12px] ${msg.ok ? 'text-accent' : 'text-bad'}`}>{msg.t}</div>}
      <details className="px-4 py-3"><summary className="cursor-pointer eyebrow">API calls this match ({m.commands.length})</summary>
        <pre className="mt-2 text-[10.5px] font-mono text-dim overflow-x-auto scroll-thin whitespace-pre">{m.commands.length ? m.commands.map(c => `tick ${c.tick}: ${c.kind === 'sub' ? `substitute(${c.side}, '${c.outId}', '${c.inId}')` : c.kind === 'tactics' ? `setTactics(${c.side}, ${JSON.stringify(c.tactics)})` : c.kind === 'formation' ? `setFormation(${c.side}, '${c.formation}')` : `cancelPending(${c.side}, ${c.idx})`}`).join('\n') : 'None yet. Every change is logged and replays exactly.'}</pre></details>
    </div>
  );
}

