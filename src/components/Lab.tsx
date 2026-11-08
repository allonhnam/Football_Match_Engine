'use client';
/* eslint-disable */
import * as React from 'react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as E from '@/engine/engine';
import { clone, fx, pct, lastName, club, hexSeed, store, ovr, ATTR_LABEL, TACTIC_META, SPEEDS, BANNER_TYPES, RESTART_LABEL, posLabel, textOn, cssVar, defaultTeams, rebuildSquad } from '@/lib/util';
import { I, Icon, Btn, Seg, Card, Badge, CondBar, CardIcon, Progress, PageHead, Tabs, Empty } from '@/components/ui';
import { runBatch } from '@/lib/batch';

export const REF = [
  { k: 'goals', label: 'Goals / match', real: 2.7, lo: 2.45, hi: 3.0, fmt: v => fx(v, 2), per: r => r.score[0] + r.score[1], bins: [0, 1, 2, 3, 4, 5, 6] },
  { k: 'home', label: 'Home win rate', real: 0.44, lo: 0.38, hi: 0.5, fmt: v => fx(v * 100, 1) + '%', rate: r => r.score[0] > r.score[1] },
  { k: 'shots', label: 'Shots / match', real: 24.7, lo: 22, hi: 27.5, fmt: v => fx(v, 1), per: r => r.ts[0].shots + r.ts[1].shots, bins: [14, 18, 22, 26, 30, 34] },
  { k: 'cards', label: 'Cards / match', real: 3.92, lo: 3.3, hi: 4.7, fmt: v => fx(v, 2), per: r => r.ts[0].yellows + r.ts[1].yellows + r.ts[0].reds + r.ts[1].reds, bins: [0, 2, 3, 4, 5, 6, 8] },
  { k: 'xgshot', label: 'xG / shot', real: 0.109, lo: 0.09, hi: 0.125, fmt: v => fx(v, 3), ratio: [r => r.ts[0].xg + r.ts[1].xg, r => r.ts[0].shots + r.ts[1].shots] },
  { k: 'draw', label: 'Draw rate', real: 0.252, lo: 0.2, hi: 0.31, fmt: v => fx(v * 100, 1) + '%', rate: r => r.score[0] === r.score[1] },
  { k: 'zero', label: '0–0 draws', real: 0.075, lo: 0.05, hi: 0.11, fmt: v => fx(v * 100, 1) + '%', rate: r => r.score[0] + r.score[1] === 0 },
  { k: 'ontarget', label: 'Shots on target', real: 0.34, lo: 0.31, hi: 0.37, fmt: v => pct(v), ratio: [r => r.ts[0].onTarget + r.ts[1].onTarget, r => r.ts[0].shots + r.ts[1].shots] },
  { k: 'corners', label: 'Corners / match', real: 9.8, lo: 8.5, hi: 11, fmt: v => fx(v, 1), per: r => r.ts[0].corners + r.ts[1].corners, bins: [4, 6, 8, 10, 12, 14] },
  { k: 'fouls', label: 'Fouls / match', real: 22, lo: 19, hi: 25, fmt: v => fx(v, 1), per: r => r.ts[0].fouls + r.ts[1].fouls, bins: [12, 16, 20, 24, 28, 32] },
  { k: 'offsides', label: 'Offsides / match', real: 4.0, lo: 3.2, hi: 4.8, fmt: v => fx(v, 1), per: r => r.ts[0].offsides + r.ts[1].offsides, bins: [0, 2, 3, 4, 5, 6, 8] },
  { k: 'pass', label: 'Pass completion', real: 0.82, lo: 0.78, hi: 0.86, fmt: v => pct(v), ratio: [r => r.ts[0].passesOk + r.ts[1].passesOk, r => r.ts[0].passes + r.ts[1].passes] },
];
export function Lab() {
  const [tab, setTab] = useState('realism'), [n, setN] = useState(500), [gap, setGap] = useState(0), [prog, setProg] = useState(0);
  const [res, setRes] = useState(null), [dim, setDim] = useState('pressing'), [bal, setBal] = useState(null), [perf, setPerf] = useState(null), [det, setDet] = useState(null);
  const teamsFor = (i, g) => { const sw = i % 2; return { home: E.makeTeam({ name: 'Lab Home', seed: sw ? 202 : 101, strength: 12 + Math.ceil(g / 2) }), away: E.makeTeam({ name: 'Lab Away', seed: sw ? 101 : 202, strength: 12 - Math.floor(g / 2) }) }; };
  const hash = r => { let h = 0; const s = JSON.stringify([r.score, r.events.map(e => [e.tick, e.type, e.player])]); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16).toUpperCase(); };
  useEffect(() => { const t = setTimeout(() => { const cfg = { ...teamsFor(0, 0), seed: 4242 }; const a = E.simulateMatch(cfg), b = E.simulateMatch(cfg); const m = new E.Match(cfg); m.runUntil({ minute: 37 }); const c = E.Match.load(m.save()).runToEnd(); setDet({ ok: hash(a) === hash(b) && hash(a) === hash(c), h: hash(a) }); }, 300); return () => clearTimeout(t); }, []);
  const realism = async () => {
    setRes(null); setProg(0.01);
    const out = (await runBatch(Array.from({ length: n }, (_, i) => ({ ...teamsFor(i, gap), seed: 1 + i, control: 'none' })), setProg)).filter(r => r && !r.errors);
    const tiles = REF.map(t => {
      let v, hist;
      if (t.per) { const vals = out.map(t.per); v = vals.reduce((a, b) => a + b, 0) / vals.length; hist = t.bins.map((b, i) => vals.filter(x => x >= b && (i === t.bins.length - 1 || x < t.bins[i + 1])).length / vals.length); }
      else if (t.rate) { v = out.filter(t.rate).length / out.length; const k = 8, sz = Math.floor(out.length / k); hist = Array.from({ length: k }, (_, i) => { const sl = out.slice(i * sz, (i + 1) * sz); return sl.filter(t.rate).length / (sl.length || 1); }); }
      else { v = out.reduce((s, r) => s + t.ratio[0](r), 0) / out.reduce((s, r) => s + t.ratio[1](r), 0); const k = 8, sz = Math.floor(out.length / k); hist = Array.from({ length: k }, (_, i) => { const sl = out.slice(i * sz, (i + 1) * sz); return sl.reduce((s, r) => s + t.ratio[0](r), 0) / (sl.reduce((s, r) => s + t.ratio[1](r), 0) || 1); }); }
      return { ...t, v, hist, pass: v >= t.lo && v <= t.hi };
    });
    const byBlock = Array(6).fill(0); out.forEach(r => r.goalTimes.forEach(t => byBlock[Math.min(5, Math.floor(t / 900))]++));
    setRes({ n: out.length, tiles, byBlock: byBlock.map(v => v / Math.max(1, byBlock.reduce((a, b) => a + b, 0))), inj: out.reduce((s, r) => s + r.injuries, 0) / out.length, gap }); setProg(0);
  };
  const balance = async () => {
    setBal(null); setProg(0.01); const per = Math.max(60, Math.floor(n / 3)); const jobs = [], opt = [];
    [0, 1, 2].forEach(o => { for (let i = 0; i < per; i++) { const t = teamsFor(i, gap); t.home.tactics = { ...t.home.tactics, [dim]: o }; jobs.push({ ...t, seed: 7000 + i, control: 'none', neutral: true }); opt.push(o); } });
    const out = await runBatch(jobs, setProg);
    const rows = [0, 1, 2].map(o => { const rs = out.filter((r, i) => opt[i] === o && r && !r.errors); const w = rs.filter(r => r.score[0] > r.score[1]).length / rs.length, d = rs.filter(r => r.score[0] === r.score[1]).length / rs.length; const avg = f => rs.reduce((s, r) => s + f(r), 0) / rs.length; return { o, w, d, l: 1 - w - d, gf: avg(r => r.score[0]), ga: avg(r => r.score[1]), xg: avg(r => r.ts[0].xg), pos: avg(r => r.ts[0].pos), fouls: avg(r => r.ts[0].fouls) }; });
    setBal({ dim, rows, per }); setProg(0);
  };
  const perfRun = async () => {
    setPerf(null); setProg(0.01); const t = teamsFor(0, 0); const k = 12; let ms = 0;
    for (let i = 0; i < k; i++) { const t0 = performance.now(); E.simulateMatch({ ...t, seed: 300 + i, control: 'none' }); ms += performance.now() - t0; setProg((i + 1) / (k + 4)); await new Promise(r => setTimeout(r, 0)); }
    const t0 = performance.now(); await runBatch(Array.from({ length: 48 }, (_, i) => ({ ...t, seed: 900 + i, control: 'none' }))); const par = performance.now() - t0;
    const a = E.simulateMatch({ ...t, seed: 4242 }), b = E.simulateMatch({ ...t, seed: 4242 }); const m = new E.Match({ ...t, seed: 4242 }); m.runUntil({ minute: 37 }); const c = E.Match.load(m.save()).runToEnd();
    setPerf({ ms: ms / k, mps: 1000 / (ms / k), par: 48 / (par / 1000), season: 380 / (48 / (par / 1000)), h1: hash(a), h2: hash(b), h3: hash(c), events: (a as any).events.length }); setProg(0);
  };
  const run = tab === 'realism' ? realism : tab === 'balance' ? balance : perfRun;
  return (
    <div className="glow-bg min-h-[calc(100vh-56px)]">
      <div className="gutter mx-auto max-w-[1320px] py-8 flex flex-col gap-6">
        <PageHead eyebrow="Engine calibration" title="Engine Lab" sub="Test realism, tactical balance and simulation performance without leaving the browser. Batches run in background workers; real-football values are approximate top-league references."
          right={<div className={`rounded-md border px-4 py-3 flex items-center gap-3 ${det ? (det.ok ? 'border-good/50 bg-good/10' : 'border-bad/50 bg-bad/10') : 'border-line'}`}><span className={det && det.ok ? 'text-good' : 'text-dim'}><Icon n="check" s={18} /></span><div><div className="eyebrow !text-[9.5px]">Determinism check</div><div className={`text-[12px] font-bold tracking-[.1em] ${det ? (det.ok ? 'text-good' : 'text-bad') : 'text-dim'}`}>{det ? (det.ok ? 'SEEDS MATCH' : 'MISMATCH') : 'CHECKING…'}</div></div></div>} />
        <Tabs value={tab} onChange={setTab} items={[['realism', 'Realism'], ['balance', 'Balance'], ['perf', 'Performance']]} />
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
          <div className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-5">
            <div className="eyebrow">Run configuration</div>
            {tab !== 'perf' && <div><div className="eyebrow !text-[9.5px] mb-1.5">Matches</div><Seg id="lab-n" value={[200, 500, 2000].indexOf(n)} options={['200', '500', '2,000']} onChange={i => setN([200, 500, 2000][i])} size="sm" /></div>}
            {tab !== 'perf' && <div><div className="flex justify-between"><span className="eyebrow !text-[9.5px]">Squad strength gap</span><span className="font-mono text-[11px]">{gap === 0 ? 'Equal' : `Home +${gap}`}</span></div><input id="lab-gap" type="range" min="0" max="6" value={gap} onChange={e => setGap(+e.target.value)} className="w-full mt-1.5" /></div>}
            {tab === 'balance' && <div><div className="eyebrow !text-[9.5px] mb-1.5">Tactic to test</div><select id="lab-dim" value={dim} onChange={e => setDim(e.target.value)} className="w-full h-9 rounded-md border border-line bg-bg px-2 text-[12.5px]">{E.TACTIC_KEYS.map(k => <option key={k} value={k}>{TACTIC_META[k].label}</option>)}</select></div>}
            <Btn kind="primary" className="w-full h-10" disabled={prog > 0} onClick={run}>{prog > 0 ? 'Running…' : `Run ${tab === 'perf' ? 'performance' : tab} test`}</Btn>
            {prog > 0 && <Progress v={prog} />}
            {tab === 'realism' && res && <div className="text-[11.5px] text-dim">Goals by 15-minute block<div className="flex items-end gap-1 h-16 mt-2">{res.byBlock.map((v, i) => <div key={i} className="flex-1 bg-accent/70 rounded-t-[2px]" style={{ height: `${v / 0.3 * 100}%` }} title={pct(v)} />)}</div><div className="flex justify-between font-mono text-[9.5px] mt-1"><span>0'</span><span>45'</span><span>90'</span></div><div className="mt-3">Injuries {fx(res.inj, 2)} per match · {res.n} matches</div></div>}
          </div>
          <div className="min-w-0">
            {tab === 'realism' && (!res ? <Empty text="Run the realism test to simulate a batch of matches and compare every number with real football." /> :
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{res.tiles.map(t => { const mx = Math.max(...t.hist, 0.0001); return (
                <div key={t.k} className="rounded-lg border border-line bg-surface p-4">
                  <div className="flex items-center justify-between"><span className="text-[12.5px] font-semibold">{t.label}</span><span className={`text-[9.5px] font-bold tracking-[.12em] rounded-[3px] px-1.5 py-0.5 border ${t.pass ? 'text-good border-good/50' : 'text-warn border-warn/50'}`}>{t.pass ? 'PASS' : 'CHECK'}</span></div>
                  <div className="grid grid-cols-2 mt-3"><div><div className="font-display font-bold text-[26px] tnum leading-none">{t.fmt(t.v)}</div><div className="eyebrow !text-[9px] mt-1">Engine</div></div><div><div className="font-display font-bold text-[26px] tnum leading-none text-dim">{t.fmt(t.real)}</div><div className="eyebrow !text-[9px] mt-1">Real</div></div></div>
                  <div className="flex items-end gap-1 h-16 mt-3">{t.hist.map((v, i) => <div key={i} className="flex-1 rounded-t-[2px]" style={{ height: `${Math.max(4, v / mx * 100)}%`, background: 'rgb(var(--c-accent) / .55)' }} />)}</div>
                  <div className="text-[10.5px] text-dim mt-1.5">{t.per ? 'Distribution per match' : 'Spread across batches'} · range {t.fmt(t.lo)}–{t.fmt(t.hi)}</div>
                </div>); })}</div>)}
            {tab === 'balance' && (!bal ? <Empty text="Pick a tactic and run. Each option plays the same balanced opponent at a neutral venue, so differences come from the tactic alone." /> :
              <div className="rounded-lg border border-line bg-surface p-5">
                <div className="eyebrow">{bal.per} matches per option · neutral venue</div><h2 className="font-display font-bold text-[26px] mt-1">{TACTIC_META[bal.dim].label}: does every option matter?</h2>
                <div className="flex flex-col gap-4 mt-4">{bal.rows.map(r => <div key={r.o} className="grid gap-2 md:grid-cols-[110px_1fr_310px] items-center">
                  <b className="font-display font-bold text-[20px] uppercase">{TACTIC_META[bal.dim].opts[r.o]}</b>
                  <div className="flex h-8 rounded overflow-hidden text-[11.5px] font-bold"><div className="grid place-items-center bg-accent text-accentink" style={{ width: pct(r.w) }}>W {pct(r.w)}</div><div className="grid place-items-center bg-surface2" style={{ width: pct(r.d) }}>D {pct(r.d)}</div><div className="grid place-items-center bg-bad text-white" style={{ width: pct(r.l) }}>L {pct(r.l)}</div></div>
                  <div className="text-[11.5px] text-dim tnum">GF {fx(r.gf, 2)} · GA {fx(r.ga, 2)} · xG {fx(r.xg, 2)} · poss {Math.round(r.pos)}% · fouls {fx(r.fouls, 1)}{r.w > 0.55 && <span className="text-warn font-bold"> · too strong</span>}</div>
                </div>)}</div>
                <p className="text-[12px] text-dim mt-4">Healthy options trade one thing for another. No option should win more than about 55% against the field, and each should move at least one number. With {bal.per} matches per row, gaps under about 8 points are noise.</p>
              </div>)}
            {tab === 'perf' && (!perf ? <Empty text="Run the performance test to time single-thread simulation and worker throughput, and to check that seeds and save/load reproduce matches exactly." /> :
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[['Per match, one thread', `${fx(perf.ms, 0)} ms`, `${fx(perf.mps, 1)} matches / s`], ['Worker pool throughput', `${fx(perf.par, 1)} / s`, 'background, UI stays responsive'], ['A 380-match season', `${fx(perf.season, 0)} s`, 'at worker throughput'], ['Same seed twice', perf.h1 === perf.h2 ? 'Identical' : 'Different', `hash ${perf.h1} · ${perf.events} events`, perf.h1 === perf.h2], ['Save at 37′, load, finish', perf.h1 === perf.h3 ? 'Identical' : 'Different', `hash ${perf.h3}`, perf.h1 === perf.h3], ['Hard tick cap', 'On', 'runToEnd stops after 60,000 ticks; never hangs', true]].map(([l, v, s, g]) => <div key={String(l)} className="rounded-lg border border-line bg-surface p-4"><div className="text-[12.5px] font-semibold">{l}</div><div className={`font-display font-bold text-[30px] leading-tight mt-2 ${g === true ? 'text-good' : g === false ? 'text-bad' : ''}`}>{v}</div><div className="text-[10.5px] text-dim font-mono mt-1">{s}</div></div>)}
              </div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

