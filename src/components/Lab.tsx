'use client';
/* eslint-disable */
import * as React from 'react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as E from '@/engine/engine';
import { clone, fx, pct, lastName, club, hexSeed, store, ovr, ATTR_LABEL, TACTIC_META, SPEEDS, BANNER_TYPES, RESTART_LABEL, posLabel, textOn, cssVar, defaultTeams, rebuildSquad } from '@/lib/util';
import { I, Icon, Btn, Seg, Card, Badge, CondBar, CardIcon, Progress, PageHead, Tabs, Empty } from '@/components/ui';
import { runBatch } from '@/lib/batch';
import { leagueTeams } from '@/lib/league';
import reference from '@/data/reference.json';
import { COUNT_METRICS, RATE_METRICS, RATIO_METRICS, HALF_METRICS, SCORELINES, compareCount, compareRate, compareRatio, compareHalf, compareScorelines, histogram, lineFromEngine, compareFlow } from '@/lib/metrics';

const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pctFmt = (v) => fx(v * 100, 1) + '%';
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const TILE_ORDER = ['goals', 'homeWin', 'draw', 'zeroZero', 'margin', 'shots', 'onTargetPct', 'goalsPerShot', 'corners', 'fouls', 'cards'];
const HALF_TILES = ['secondHalfGoals', 'htLevel', 'leadHeld', 'leadLost'];

/** Compare a batch of simulated matches with the real-data reference. */
export function buildTiles(out) {
  const lines = out.map(r => lineFromEngine(r.score, r.ts, r.ht));
  const tiles: any[] = TILE_ORDER.map((k): any => {
    const cm = COUNT_METRICS.find(m => m.key === k);
    if (cm) {
      const real = reference.counts[k];
      const values = lines.map(cm.value);
      const c = compareCount(real, values);
      return { k, label: cm.label, kind: 'count', engine: c.mean, real: real.mean, tol: c.tol, ok: c.ok, tv: c.tv, hist: histogram(values, real.edges), realHist: real.hist, fmt: v => fx(v, cm.decimals) };
    }
    const rm = RATE_METRICS.find(m => m.key === k);
    if (rm) {
      const c = compareRate(reference.rates[k], lines.filter(rm.hit).length, lines.length);
      return { k, label: rm.label, kind: 'share', engine: c.mean, real: reference.rates[k], tol: c.tol, ok: c.ok, fmt: pctFmt };
    }
    const tm = RATIO_METRICS.find(m => m.key === k);
    const c = compareRatio(reference.ratios[k], lines.reduce((s, l) => s + tm.num(l), 0) / lines.reduce((s, l) => s + tm.den(l), 0));
    return { k, label: tm.label, kind: 'share', engine: c.mean, real: reference.ratios[k], tol: c.tol, ok: c.ok, fmt: k === 'goalsPerShot' ? v => fx(v, 3) : pctFmt };
  });
  // How matches unfold between half-time and full time.
  for (const k of HALF_TILES) {
    const hm = HALF_METRICS.find(m => m.key === k);
    const c = compareHalf(hm, reference.half[k], lines);
    tiles.push({ k, label: hm.label, kind: 'share', engine: c.mean, real: reference.half[k], tol: c.tol, ok: c.ok, fmt: pctFmt });
  }
  // The dataset has no offsides or passing data, so these two are checked against rough estimates and labelled as such.
  const est = reference.estimates;
  const offsides = mean(out.map(r => r.ts[0].offsides + r.ts[1].offsides));
  const passRate = out.reduce((s, r) => s + r.ts[0].passesOk + r.ts[1].passesOk, 0) / out.reduce((s, r) => s + r.ts[0].passes + r.ts[1].passes, 0);
  tiles.push(
    { k: 'offsides', label: 'Offsides / match', kind: 'estimate', engine: offsides, real: est.offsides.mean, lo: est.offsides.lo, hi: est.offsides.hi, ok: offsides >= est.offsides.lo && offsides <= est.offsides.hi, fmt: v => fx(v, 1) },
    { k: 'pass', label: 'Pass completion', kind: 'estimate', engine: passRate, real: est.passCompletion.mean, lo: est.passCompletion.lo, hi: est.passCompletion.hi, ok: passRate >= est.passCompletion.lo && passRate <= est.passCompletion.hi, fmt: pctFmt },
  );
  // How matches flow and who takes the shots, against published league averages (also estimates, not the dataset).
  const flows = out.map(r => r.flow).filter(Boolean);
  if (flows.length) for (const f of compareFlow(est, flows)) tiles.push({ k: f.key, label: f.label, kind: 'estimate', engine: f.engine, real: f.real, lo: f.lo, hi: f.hi, ok: f.ok, fmt: f.pct ? pctFmt : (v: number) => fx(v, f.decimals) });
  return tiles;
}

function Tile({ t }: any) {
  const isEst = t.kind === 'estimate';
  const lo = t.lo ?? t.real - t.tol, hi = t.hi ?? t.real + t.tol;
  const mx = t.hist ? Math.max(...t.hist, ...t.realHist, 0.0001) : 1;
  const top = Math.max(t.engine, t.real, hi) * 1.35 || 1;
  const at = (v) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold">{t.label}</span>
        <span className="flex items-center gap-1.5">
          {isEst && <span className="text-[9px] font-bold tracking-[.12em] text-dim">ESTIMATE</span>}
          <span className={`text-[9.5px] font-bold tracking-[.12em] rounded-[3px] px-1.5 py-0.5 border ${t.ok ? 'text-good border-good/50' : 'text-warn border-warn/50'}`}>{t.ok ? 'PASS' : 'CHECK'}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 mt-3">
        <div><div className="font-display font-bold text-[26px] tnum leading-none">{t.fmt(t.engine)}</div><div className="eyebrow !text-[9px] mt-1">Engine</div></div>
        <div><div className="font-display font-bold text-[26px] tnum leading-none text-dim">{isEst ? '~' : ''}{t.fmt(t.real)}</div><div className="eyebrow !text-[9px] mt-1">{isEst ? 'Estimate' : 'Real data'}</div></div>
      </div>
      {t.hist ? (
        <div className="flex items-end gap-1 h-16 mt-3">
          {t.hist.map((v, i) => (
            <div key={i} className="relative flex-1 h-full flex items-end">
              <div className="w-full rounded-t-[2px]" style={{ height: `${Math.max(3, (v / mx) * 100)}%`, background: 'rgb(var(--c-accent) / .55)' }} />
              <div className="absolute left-0 right-0 h-[2px] bg-ink/80" style={{ bottom: `${(t.realHist[i] / mx) * 100}%` }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="relative h-2 rounded-full bg-surface2 mt-5">
          <div className="absolute h-2 rounded-full bg-good/35" style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }} />
          <div className="absolute -top-1 w-0.5 h-4 bg-ink/60" style={{ left: at(t.real) }} title="Real" />
          <div className="absolute -top-1.5 w-1 h-5 rounded bg-accent" style={{ left: at(t.engine) }} title="Engine" />
        </div>
      )}
      <div className="text-[10.5px] text-dim mt-1.5">
        {t.kind === 'count' && `Shape gap ${fx(t.tv, 2)} · allowed ±${t.fmt(t.tol)}`}
        {t.kind === 'share' && `Allowed ±${t.fmt(t.tol)}`}
        {isEst && `Not in the dataset · expected ${t.fmt(t.lo)} to ${t.fmt(t.hi)}`}
      </div>
    </div>
  );
}
/** Every final score side by side with real football: how often each one happens. */
function Scorelines({ s }: any) {
  const real = reference.scorelines.hist, mx = Math.max(...s.hist, ...real, 0.0001);
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold">Final scores (home–away)</span>
        <span className={`text-[9.5px] font-bold tracking-[.12em] rounded-[3px] px-1.5 py-0.5 border ${s.ok ? 'text-good border-good/50' : 'text-warn border-warn/50'}`}>{s.ok ? 'PASS' : 'CHECK'}</span>
      </div>
      <div className="flex items-end gap-1 h-24 mt-3">
        {s.hist.map((v, i) => (
          <div key={i} className="relative flex-1 h-full flex items-end" title={`${SCORELINES[i]}: engine ${pct(v)}, real ${pct(real[i])}`}>
            <div className="w-full rounded-t-[2px]" style={{ height: `${Math.max(3, (v / mx) * 100)}%`, background: 'rgb(var(--c-accent) / .55)' }} />
            <div className="absolute left-0 right-0 h-[2px] bg-ink/80" style={{ bottom: `${(real[i] / mx) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1 font-mono text-[9px] text-dim">{SCORELINES.map(k => <span key={k} className="flex-1 text-center truncate">{k}</span>)}</div>
      <div className="text-[10.5px] text-dim mt-1.5">Shape gap {fx(s.tv, 3)} · allowed {fx(s.tol, 3)}</div>
    </div>
  );
}
const outcome = (s: number[]) => (s[0] > s[1] ? 'H' : s[0] < s[1] ? 'A' : 'D');
const OUTCOME_LABEL = { H: 'Home wins', D: 'Draws', A: 'Away wins' };

/** Home wins, draws and away wins as counts and shares, next to real football. */
function ResultsSummary({ matches }: any) {
  const n = matches.length, c = { H: 0, D: 0, A: 0 };
  let goals = 0;
  for (const m of matches) { c[outcome(m.score)]++; goals += m.score[0] + m.score[1]; }
  const real = { H: reference.rates.homeWin, D: reference.rates.draw, A: reference.rates.awayWin };
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold">Results of all {thousands(n)} matches</span>
        <span className="text-[11px] text-dim tnum">{thousands(goals)} goals · {fx(goals / (n || 1), 2)} per match (real {fx(reference.counts.goals.mean, 2)})</span>
      </div>
      <div className="flex h-8 rounded overflow-hidden text-[11.5px] font-bold mt-3">
        <div className="grid place-items-center bg-accent text-accentink" style={{ width: pct(c.H / n) }}>{c.H / n > 0.1 && `H ${pct(c.H / n)}`}</div>
        <div className="grid place-items-center bg-surface2" style={{ width: pct(c.D / n) }}>{c.D / n > 0.1 && `D ${pct(c.D / n)}`}</div>
        <div className="grid place-items-center bg-bad text-white" style={{ width: pct(c.A / n) }}>{c.A / n > 0.1 && `A ${pct(c.A / n)}`}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {(['H', 'D', 'A'] as const).map(k => (
          <div key={k}>
            <div className="eyebrow !text-[9px]">{OUTCOME_LABEL[k]}</div>
            <div className="font-display font-bold text-[24px] tnum leading-tight">{thousands(c[k])} <span className="text-[15px]">({pctFmt(c[k] / (n || 1))})</span></div>
            <div className="text-[10.5px] text-dim tnum">real {pctFmt(real[k])}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Every final score that came up, how often, and how often real football ends that way. */
function ScorelineTable({ matches, pick, onPick }: any) {
  const n = matches.length, counts = new Map<string, number>();
  for (const m of matches) { const k = `${m.score[0]}-${m.score[1]}`; counts.set(k, (counts.get(k) || 0) + 1); }
  const realShare = (k: string) => { const i = SCORELINES.indexOf(k); return i >= 0 && k !== 'other' ? reference.scorelines.hist[i] : null; };
  const rows = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold">Every scoreline ({rows.length} different)</span>
        {pick && <button onClick={() => onPick(null)} className="text-[11px] text-accent hover:underline">Show all matches</button>}
      </div>
      <p className="text-[10.5px] text-dim mt-1">Click a scoreline to list its matches below. Real shares are from {thousands(reference.n)} real matches; rarer scores are grouped there, so they show –.</p>
      <div className="grid gap-1.5 mt-3 grid-cols-[repeat(auto-fill,minmax(112px,1fr))]">
        {rows.map(([k, c]) => { const r = realShare(k); return (
          <button key={k} onClick={() => onPick(pick === k ? null : k)} title={`${k}: ${c} of ${n} matches`}
            className={`rounded-md border px-2 py-1.5 text-left ${pick === k ? 'border-accent bg-accent/10' : 'border-line bg-bg hover:border-dim'}`}>
            <div className="flex items-baseline justify-between gap-1"><b className="font-mono text-[13px]">{k.replace('-', '–')}</b><span className="font-mono text-[11px] tnum">{c}</span></div>
            <div className="text-[10px] text-dim tnum">{pctFmt(c / n)} · real {r == null ? '–' : pctFmt(r)}</div>
          </button>); })}
      </div>
    </div>
  );
}

/** Every simulated match, one row each, filterable by result, scoreline or option. */
function MatchList({ matches, pick, setPick, groups }: any) {
  const [res, setRes] = useState('all'), [grp, setGrp] = useState('all');
  const shown = matches.filter(m => (res === 'all' || outcome(m.score) === res) && (!pick || `${m.score[0]}-${m.score[1]}` === pick) && (grp === 'all' || m.group === grp));
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold">Every match · {thousands(shown.length)} of {thousands(matches.length)}{pick ? ` ending ${pick.replace('-', '–')}` : ''}</span>
        <div className="flex flex-wrap gap-2">
          {groups && <select id="lab-group" aria-label="Option" value={grp} onChange={e => setGrp(e.target.value)} className="h-8 rounded-md border border-line bg-bg px-2 text-[12px]"><option value="all">All options</option>{groups.map(g => <option key={g} value={g}>{g}</option>)}</select>}
          <select id="lab-result" aria-label="Result" value={res} onChange={e => setRes(e.target.value)} className="h-8 rounded-md border border-line bg-bg px-2 text-[12px]"><option value="all">All results</option><option value="H">Home wins</option><option value="D">Draws</option><option value="A">Away wins</option></select>
          {pick && <button onClick={() => setPick(null)} className="h-8 rounded-md border border-line px-2 text-[12px] text-dim hover:text-ink">Clear {pick.replace('-', '–')}</button>}
        </div>
      </div>
      <div className="mt-3 max-h-[420px] overflow-auto scroll-thin rounded-md border border-line">
        <table className="w-full text-[11.5px] tnum">
          <thead className="sticky top-0 bg-surface2 text-dim text-left"><tr>
            <th className="px-2 py-1.5 font-semibold">#</th>{groups && <th className="px-2 py-1.5 font-semibold">Option</th>}<th className="px-2 py-1.5 font-semibold">Seed</th><th className="px-2 py-1.5 font-semibold">Strength H v A</th>
            <th className="px-2 py-1.5 font-semibold">Half-time</th><th className="px-2 py-1.5 font-semibold">Full time</th><th className="px-2 py-1.5 font-semibold">Result</th><th className="px-2 py-1.5 font-semibold">Shots</th><th className="px-2 py-1.5 font-semibold">xG</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {shown.map(m => (
              <tr key={m.i} className="hover:bg-surface2/60">
                <td className="px-2 py-1 text-dim">{m.i + 1}</td>{groups && <td className="px-2 py-1">{m.group}</td>}<td className="px-2 py-1 font-mono text-dim">{m.seed}</td><td className="px-2 py-1">{fx(m.str[0], 1)} v {fx(m.str[1], 1)}</td>
                <td className="px-2 py-1 font-mono">{m.ht ? `${m.ht[0]}–${m.ht[1]}` : '–'}</td><td className="px-2 py-1 font-mono font-bold">{m.score[0]}–{m.score[1]}</td>
                <td className={`px-2 py-1 font-semibold ${outcome(m.score) === 'H' ? 'text-good' : outcome(m.score) === 'A' ? 'text-bad' : 'text-dim'}`}>{outcome(m.score) === 'H' ? 'Home' : outcome(m.score) === 'A' ? 'Away' : 'Draw'}</td>
                <td className="px-2 py-1">{m.shots[0]}–{m.shots[1]}</td><td className="px-2 py-1">{fx(m.xg[0], 2)}–{fx(m.xg[1], 2)}</td>
              </tr>))}
          </tbody>
        </table>
        {!shown.length && <div className="text-dim text-[12px] text-center py-6">No matches with that filter.</div>}
      </div>
    </div>
  );
}

// One row per simulated match, for the lists above.
const matchRow = (r: any, job: any, i: number, group?: string) => ({ i, group, seed: job.seed, str: [job.home.strength, job.away.strength], score: r.score, ht: r.ht, shots: [r.ts[0].shots, r.ts[1].shots], xg: [r.ts[0].xg, r.ts[1].xg] });

export function Lab() {
  const [tab, setTab] = useState('realism'), [n, setN] = useState(1000), [gap, setGap] = useState(0), [prog, setProg] = useState(0);
  const [res, setRes] = useState(null), [dim, setDim] = useState('pressing'), [bal, setBal] = useState(null), [perf, setPerf] = useState(null), [det, setDet] = useState(null);
  const [pick, setPick] = useState(null); // a scoreline picked in the table, to filter the match list
  const teamsFor = (i, g) => { const sw = i % 2; return { home: E.makeTeam({ name: 'Lab Home', seed: sw ? 202 : 101, strength: 12 + Math.ceil(g / 2) }), away: E.makeTeam({ name: 'Lab Away', seed: sw ? 101 : 202, strength: 12 - Math.floor(g / 2) }) }; };
  const hash = r => { let h = 0; const s = JSON.stringify([r.score, r.events.map(e => [e.tick, e.type, e.player])]); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16).toUpperCase(); };
  useEffect(() => { const t = setTimeout(() => { const cfg = { ...teamsFor(0, 0), seed: 4242 }; const a = E.simulateMatch(cfg), b = E.simulateMatch(cfg); const m = new E.Match(cfg); m.runUntil({ minute: 37 }); const c = E.Match.load(m.save()).runToEnd(); setDet({ ok: hash(a) === hash(b) && hash(a) === hash(c), h: hash(a) }); }, 300); return () => clearTimeout(t); }, []);
  const realism = async () => {
    setRes(null); setProg(0.01);
    // A fresh, varied pair of squads for every match, like the many teams of a real league.
    const jobs = Array.from({ length: n }, (_, i) => ({ ...leagueTeams(i, gap), seed: 1 + i, control: 'none' }));
    const raw = await runBatch(jobs, setProg);
    const matches = raw.map((r, i) => (r && !r.errors ? matchRow(r, jobs[i], i) : null)).filter(Boolean);
    const out = raw.filter(r => r && !r.errors);
    const tiles = buildTiles(out);
    const scorelines = compareScorelines(reference.scorelines.hist, out.map(r => lineFromEngine(r.score, r.ts, r.ht)));
    const byBlock = Array(6).fill(0); out.forEach(r => r.goalTimes.forEach(t => byBlock[Math.min(5, Math.floor(t / 900))]++));
    setRes({ n: out.length, tiles, scorelines, byBlock: byBlock.map(v => v / Math.max(1, byBlock.reduce((a, b) => a + b, 0))), inj: out.reduce((s, r) => s + r.injuries, 0) / out.length, gap, matches }); setPick(null); setProg(0);
  };
  const balance = async () => {
    setBal(null); setProg(0.01); const per = Math.max(60, Math.floor(n / 3)); const jobs = [], opt = [];
    [0, 1, 2].forEach(o => { for (let i = 0; i < per; i++) { const t = teamsFor(i, gap); t.home.tactics = { ...t.home.tactics, [dim]: o }; jobs.push({ ...t, seed: 7000 + i, control: 'none', neutral: true }); opt.push(o); } });
    const out = await runBatch(jobs, setProg);
    const rows = [0, 1, 2].map(o => { const rs = out.filter((r, i) => opt[i] === o && r && !r.errors); const nw = rs.filter(r => r.score[0] > r.score[1]).length, nd = rs.filter(r => r.score[0] === r.score[1]).length; const w = nw / rs.length, d = nd / rs.length; const avg = f => rs.reduce((s, r) => s + f(r), 0) / rs.length; return { o, n: rs.length, nw, nd, nl: rs.length - nw - nd, w, d, l: 1 - w - d, gf: avg(r => r.score[0]), ga: avg(r => r.score[1]), xg: avg(r => r.ts[0].xg), pos: avg(r => r.ts[0].pos), fouls: avg(r => r.ts[0].fouls) }; });
    const matches = out.map((r, i) => (r && !r.errors ? matchRow(r, jobs[i], i, TACTIC_META[dim].opts[opt[i]]) : null)).filter(Boolean);
    setBal({ dim, rows, per, matches }); setPick(null); setProg(0);
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
        <PageHead eyebrow="Engine calibration" title="Engine Lab" sub={`Test realism, tactical balance and simulation performance without leaving the browser. Realism is checked against ${thousands(reference.source.matches)} real matches from the top five European leagues (${reference.source.seasons.length} seasons, football-data.co.uk). Batches run in background workers.`}
          right={<div className={`rounded-md border px-4 py-3 flex items-center gap-3 ${det ? (det.ok ? 'border-good/50 bg-good/10' : 'border-bad/50 bg-bad/10') : 'border-line'}`}><span className={det && det.ok ? 'text-good' : 'text-dim'}><Icon n="check" s={18} /></span><div><div className="eyebrow !text-[9.5px]">Determinism check</div><div className={`text-[12px] font-bold tracking-[.1em] ${det ? (det.ok ? 'text-good' : 'text-bad') : 'text-dim'}`}>{det ? (det.ok ? 'SEEDS MATCH' : 'MISMATCH') : 'CHECKING…'}</div></div></div>} />
        <Tabs value={tab} onChange={setTab} items={[['realism', 'Realism'], ['balance', 'Balance'], ['perf', 'Performance']]} />
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
          <div className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-5">
            <div className="eyebrow">Run configuration</div>
            {tab !== 'perf' && <div><div className="eyebrow !text-[9.5px] mb-1.5">Matches</div><Seg id="lab-n" value={[200, 1000, 2000].indexOf(n)} options={['200', '1,000', '2,000']} onChange={i => setN([200, 1000, 2000][i])} size="sm" /></div>}
            {tab !== 'perf' && <div><div className="flex justify-between"><span className="eyebrow !text-[9.5px]">Squad strength gap</span><span className="font-mono text-[11px]">{gap === 0 ? 'Equal' : `Home +${gap}`}</span></div><input id="lab-gap" type="range" min="0" max="6" value={gap} onChange={e => setGap(+e.target.value)} className="w-full mt-1.5" /></div>}
            {tab === 'balance' && <div><div className="eyebrow !text-[9.5px] mb-1.5">Tactic to test</div><select id="lab-dim" value={dim} onChange={e => setDim(e.target.value)} className="w-full h-9 rounded-md border border-line bg-bg px-2 text-[12.5px]">{E.TACTIC_KEYS.map(k => <option key={k} value={k}>{TACTIC_META[k].label}</option>)}</select></div>}
            <Btn kind="primary" className="w-full h-10" disabled={prog > 0} onClick={run}>{prog > 0 ? 'Running…' : `Run ${tab === 'perf' ? 'performance' : tab} test`}</Btn>
            {prog > 0 && <Progress v={prog} />}
            {tab === 'realism' && res && <div className="text-[11.5px] text-dim">Goals by 15-minute block<div className="flex items-end gap-1 h-16 mt-2">{res.byBlock.map((v, i) => <div key={i} className="flex-1 bg-accent/70 rounded-t-[2px]" style={{ height: `${v / 0.3 * 100}%` }} title={pct(v)} />)}</div><div className="flex justify-between font-mono text-[9.5px] mt-1"><span>0'</span><span>45'</span><span>90'</span></div><div className="mt-3">Injuries {fx(res.inj, 2)} per match · {res.n} matches</div></div>}
          </div>
          <div className="min-w-0">
            {tab === 'realism' && (!res ? <Empty text="Run the realism test to simulate a batch of matches and compare every number with real football. Small batches are noisy: 1,000 matches or more give a fair verdict (the command-line check uses 3,000)." /> :
              <div className="flex flex-col gap-3">
                <ResultsSummary matches={res.matches} />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{res.tiles.map(t => <Tile key={t.k} t={t} />)}</div>
                <Scorelines s={res.scorelines} />
                <ScorelineTable matches={res.matches} pick={pick} onPick={setPick} />
                <MatchList matches={res.matches} pick={pick} setPick={setPick} />
                <p className="text-[11.5px] text-dim">Bars show how often the engine produced each value per match; the white line marks real football. "Allowed" is how far the engine's average may sit from the real one: 7% or 2.5 standard errors of the batch, whichever is larger. Shape gap is the total variation distance between the two distributions (0 identical, 1 unrelated).</p>
              </div>)}
            {tab === 'balance' && (!bal ? <Empty text="Pick a tactic and run. Each option plays the same balanced opponent at a neutral venue, so differences come from the tactic alone." /> :
              <div className="rounded-lg border border-line bg-surface p-5">
                <div className="eyebrow">{bal.per} matches per option · neutral venue</div><h2 className="font-display font-bold text-[26px] mt-1">{TACTIC_META[bal.dim].label}: does every option matter?</h2>
                <div className="flex flex-col gap-4 mt-4">{bal.rows.map(r => <div key={r.o} className="grid gap-2 md:grid-cols-[110px_1fr_310px] items-center">
                  <b className="font-display font-bold text-[20px] uppercase">{TACTIC_META[bal.dim].opts[r.o]}</b>
                  <div className="flex h-8 rounded overflow-hidden text-[11.5px] font-bold"><div className="grid place-items-center bg-accent text-accentink" style={{ width: pct(r.w) }}>W {pct(r.w)}</div><div className="grid place-items-center bg-surface2" style={{ width: pct(r.d) }}>D {pct(r.d)}</div><div className="grid place-items-center bg-bad text-white" style={{ width: pct(r.l) }}>L {pct(r.l)}</div></div>
                  <div className="text-[11.5px] text-dim tnum"><b className="text-ink">{r.nw} won · {r.nd} drawn · {r.nl} lost</b> of {r.n}<br />GF {fx(r.gf, 2)} · GA {fx(r.ga, 2)} · xG {fx(r.xg, 2)} · poss {Math.round(r.pos)}% · fouls {fx(r.fouls, 1)}{r.w > 0.55 && <span className="text-warn font-bold"> · too strong</span>}</div>
                </div>)}</div>
                <p className="text-[12px] text-dim mt-4">Healthy options trade one thing for another. No option should win more than about 55% against the field, and each should move at least one number. With {bal.per} matches per row, gaps under about 8 points are noise. The tested side is always the home team.</p>
                <div className="flex flex-col gap-3 mt-4">
                  <ScorelineTable matches={bal.matches} pick={pick} onPick={setPick} />
                  <MatchList matches={bal.matches} pick={pick} setPick={setPick} groups={TACTIC_META[bal.dim].opts} />
                </div>
              </div>)}
            {tab === 'perf' && (!perf ? <Empty text="Run the performance test to time single-thread simulation and worker throughput, and to check that seeds and save/load reproduce matches exactly." /> :
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[['Per match, one thread', `${fx(perf.ms, 0)} ms`, `${fx(perf.mps, 1)} matches / s`], ['Worker pool throughput', `${fx(perf.par, 1)} / s`, 'background, UI stays responsive'], ['A 380-match season', `${fx(perf.season, 0)} s`, 'at worker throughput'], ['Same seed twice', perf.h1 === perf.h2 ? 'Identical' : 'Different', `hash ${perf.h1} · ${perf.events} events`, perf.h1 === perf.h2], ['Save at 37′, load, finish', perf.h1 === perf.h3 ? 'Identical' : 'Different', `hash ${perf.h3}`, perf.h1 === perf.h3], ['Hard tick cap', 'On', 'runToEnd stops after 80,000 ticks; never hangs', true]].map(([l, v, s, g]) => <div key={String(l)} className="rounded-lg border border-line bg-surface p-4"><div className="text-[12.5px] font-semibold">{l}</div><div className={`font-display font-bold text-[30px] leading-tight mt-2 ${g === true ? 'text-good' : g === false ? 'text-bad' : ''}`}>{v}</div><div className="text-[10.5px] text-dim font-mono mt-1">{s}</div></div>)}
              </div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

