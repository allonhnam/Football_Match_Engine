'use client';
/* eslint-disable */
import * as React from 'react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as E from '@/engine/engine';
import { clone, fx, pct, lastName, club, hexSeed, store, ovr, ATTR_LABEL, TACTIC_META, SPEEDS, BANNER_TYPES, RESTART_LABEL, posLabel, textOn, cssVar, defaultTeams, rebuildSquad } from '@/lib/util';
import { I, Icon, Btn, Seg, Card, Badge, CondBar, CardIcon, Progress, PageHead, Tabs, Empty, Flag } from '@/components/ui';
import { runBatch } from '@/lib/batch';
import { StatRows } from '@/components/LiveParts';

export function XgRace({ R, teams }: any) {
  const tl = R.xgTimeline, end = Math.max(95 * 60, tl[tl.length - 1][0]);
  const maxX = Math.max(1, ...tl.map(p => Math.max(p[1], p[2]))) * 1.15;
  const W = 640, H = 240, L = 36, Rm = 14, T = 14, B = 26;
  const X = t => L + t / end * (W - L - Rm), Y = v => H - B - v / maxX * (H - T - B);
  const path = k => tl.reduce((d, p, i) => i === 0 ? `M${X(p[0])} ${Y(p[k])}` : `${d} H${X(p[0])} V${Y(p[k])}`, '') + ` H${X(end)}`;
  const xgAt = (t, k) => { let v = 0; for (const p of tl) if (p[0] <= t) v = p[k]; return v; };
  const ticks = []; for (let v = 0; v <= maxX; v += maxX > 3 ? 1 : 0.5) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Cumulative expected goals">
      {ticks.map(v => <g key={v}><line x1={L} x2={W - Rm} y1={Y(v)} y2={Y(v)} stroke="var(--line)" /><text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize="10.5" fill="var(--dim)" fontFamily="JetBrains Mono">{v.toFixed(1)}</text></g>)}
      {[0, 15, 30, 45, 60, 75, 90].map(mn => <text key={mn} x={X(mn * 60)} y={H - 7} textAnchor="middle" fontSize="10.5" fill="var(--dim)" fontFamily="JetBrains Mono">{mn}′</text>)}
      {R.events.filter(e => e.type === 'red' || e.type === 'sub' || e.type === 'tactic').map((e, i) => <line key={i} x1={X(e.t)} x2={X(e.t)} y1={T} y2={H - B} stroke={e.type === 'red' ? 'var(--bad)' : 'var(--dim)'} strokeDasharray="3 3" opacity={e.type === 'red' ? 0.9 : 0.35} />)}
      <path d={path(2)} fill="none" stroke={teams[1].color} strokeWidth="2.5" /><path d={path(1)} fill="none" stroke={teams[0].color} strokeWidth="2.5" />
      {R.events.filter(e => e.type === 'goal').map((e, i) => <circle key={i} cx={X(e.t)} cy={Y(xgAt(e.t, e.side + 1))} r="5.5" fill={teams[e.side].color} stroke="var(--surface)" strokeWidth="2" />)}
      <text x={W - Rm} y={Y(tl[tl.length - 1][1]) - 7} textAnchor="end" fontSize="11.5" fontWeight="700" fill={teams[0].color}>{teams[0].short} {fx(tl[tl.length - 1][1], 2)}</text>
      <text x={W - Rm} y={Y(tl[tl.length - 1][2]) + 16} textAnchor="end" fontSize="11.5" fontWeight="700" fill={teams[1].color}>{teams[1].short} {fx(tl[tl.length - 1][2], 2)}</text>
    </svg>
  );
}
export function ShotMap({ R, side, teams }: any) {
  const shots = R.events.filter(e => (e.type === 'shot' || e.type === 'goal') && !e.ownGoal && e.side === side);
  const W = 340, H = 250, s = W / 68;
  const pos = e => { const d = (e.side === 0) === (e.half === 1) ? 1 : -1; const x = d > 0 ? e.x : 105 - e.x, y = d > 0 ? e.y : 68 - e.y; return { cx: (68 - y) * s, cy: (105 - x) * s + 6 }; };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-md" role="img" aria-label={`${teams[side].name} shot map`}>
      <rect width={W} height={H} fill="var(--pitch-a)" />
      <g fill="none" stroke="var(--pitch-line)" strokeWidth="1.2"><rect x={(34 - 20.16) * s} y="6" width={40.32 * s} height={16.5 * s} /><rect x={(34 - 9.16) * s} y="6" width={18.32 * s} height={5.5 * s} /><line x1="0" y1="6" x2={W} y2="6" /><rect x={(34 - 3.66) * s} y="1" width={7.32 * s} height="5" /><path d={`M${(34 - 7.31) * s} ${6 + 16.5 * s} A ${9.15 * s} ${9.15 * s} 0 0 0 ${(34 + 7.31) * s} ${6 + 16.5 * s}`} /></g>
      {shots.map((e, i) => { const { cx, cy } = pos(e); if (cy > H) return null; const goal = e.type === 'goal', on = goal || e.result === 'saved'; return <circle key={i} cx={cx} cy={cy} r={3 + (e.xg || 0) * 16} fill={goal ? teams[side].color : on ? 'rgba(255,255,255,.55)' : 'none'} stroke={goal ? '#0B0F0E' : '#fff'} strokeWidth="1.2"><title>{`${e.minute} ${e.text}`}</title></circle>; })}
    </svg>
  );
}
export function Report({ report, onReplay, onBack }: any) {
  const { R, teams, config } = report;
  const [sideMap, setSideMap] = useState(0), [sort, setSort] = useState({ k: 'rating', d: -1 });
  const [resim, setResim] = useState(null), [resP, setResP] = useState(0), [copied, setCopied] = useState(null);
  const ts = R.teamStats.map(t => ({ ...t, cards: t.yellows + t.reds }));
  const pname = id => (R.playerStats.find(p => p.id === id) || {}).name || '';
  const scorers = s => R.events.filter(e => e.type === 'goal' && e.side === s).map(e => `${lastName(pname(e.player))}${e.ownGoal ? ' (og)' : ''} ${e.minute}`).join(', ');
  const rows = R.playerStats.slice().sort((a, b) => { const va = a[sort.k], vb = b[sort.k]; return (typeof va === 'string' ? va.localeCompare(vb) : (va ?? -1) - (vb ?? -1)) * sort.d; });
  const th = (k, l, cls = '') => <th className={`py-2 px-1.5 font-semibold text-[10.5px] tracking-[.1em] uppercase text-dim cursor-pointer select-none whitespace-nowrap ${cls}`} onClick={() => setSort(s => ({ k, d: s.k === k ? -s.d : -1 }))}>{l}{sort.k === k ? (sort.d < 0 ? ' ↓' : ' ↑') : ''}</th>;
  const runResim = async () => { setResP(0.01); const N = 120; const res = await runBatch(Array.from({ length: N }, (_, i) => ({ ...config, seed: 50000 + i, control: 'none' })), setResP); let same = 0, w = 0, d = 0, l = 0; res.forEach(r => { if (!r || r.errors) return; if (r.score[0] === R.score[0] && r.score[1] === R.score[1]) same++; if (r.score[0] > r.score[1]) w++; else if (r.score[0] < r.score[1]) l++; else d++; }); setResim({ same: same / N, w: w / N, d: d / N, l: l / N, N }); setResP(0); };
  const json = JSON.stringify(R.carryOver, null, 2);
  const copy = async () => { try { await navigator.clipboard.writeText(json); setCopied('ok'); } catch (e) { setCopied('select'); } };
  return (
    <div className="glow-bg min-h-[calc(100vh-56px)]">
      <div className="gutter mx-auto max-w-[1280px] py-8 flex flex-col gap-5">
        <div className="eyebrow-accent">{R.abandoned ? 'Abandoned' : 'Full time'} · seed {hexSeed(config.seed)}{report.replay ? ' · replay' : ''}</div>
        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="flex items-center gap-3 min-w-0"><Badge color={teams[0].color} label={teams[0].short} size={48} /><div className="min-w-0 hidden sm:block"><div className="font-display font-bold uppercase text-[22px] md:text-[30px] leading-none truncate">{teams[0].name}</div><div className="text-[11.5px] text-dim mt-1 truncate">{scorers(0) || 'No goals'}</div></div></div>
            <div><div className="font-display font-bold text-[52px] md:text-[60px] leading-none tnum">{R.score[0]}<span className="text-dim mx-2">–</span>{R.score[1]}</div>
            {(R.extraTime || R.shootout) && <div className="text-center font-mono text-[12px] text-dim mt-1">{R.shootout ? `after extra time · ${R.shootout.score[0]}–${R.shootout.score[1]} on penalties` : 'after extra time'}</div>}</div>
            <div className="flex items-center gap-3 min-w-0 flex-row-reverse text-right"><Badge color={teams[1].color} label={teams[1].short} size={48} /><div className="min-w-0 hidden sm:block"><div className="font-display font-bold uppercase text-[22px] md:text-[30px] leading-none truncate">{teams[1].name}</div><div className="text-[11.5px] text-dim mt-1 truncate">{scorers(1) || 'No goals'}</div></div></div>
          </div>
          <div className="sm:hidden grid grid-cols-2 gap-3 mt-3 text-[11.5px] text-dim"><div><b className="text-ink block font-display uppercase text-[15px]">{teams[0].name}</b>{scorers(0) || 'No goals'}</div><div className="text-right"><b className="text-ink block font-display uppercase text-[15px]">{teams[1].name}</b>{scorers(1) || 'No goals'}</div></div>
          <div className="mt-5 pt-4 border-t border-line grid gap-4 lg:grid-cols-[1fr_auto] items-start">
            <div><div className="eyebrow">Why this result</div><p className="text-[15px] mt-1 max-w-[72ch]">{R.explanation.verdict}</p>{R.abandoned && <p className="text-bad text-[12.5px] mt-1">{R.abandoned.reason} ({R.abandoned.minute}′)</p>}</div>
            <div className="flex flex-col gap-2 min-w-[230px]"><Btn kind="primary" onClick={onReplay}>Watch replay <Icon n="play" s={13} /></Btn><Btn onClick={runResim} disabled={resP > 0}>{resP > 0 ? 'Simulating…' : 'Re-simulate 120×'}</Btn>{resP > 0 && <Progress v={resP} />}
              {resim && <div className="text-[12px] text-dim">This exact score happens in <b className="text-ink">{pct(resim.same)}</b> of {resim.N} replays with new seeds. {teams[0].short} win {pct(resim.w)}, draw {pct(resim.d)}, {teams[1].short} win {pct(resim.l)}.</div>}</div>
          </div>
        </section>
        {R.explanation.factors.length > 0 && <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${R.explanation.factors.length > 2 ? 220 : 300}px, 1fr))` }}>{R.explanation.factors.map((f, i) => <div key={i} className={`rounded-lg border p-4 border-l-[3px] ${i === 0 ? 'border-accent/50 bg-accent/[.06]' : 'border-line bg-surface'}`} style={{ borderLeftColor: teams[f.side].color }}><div className="eyebrow">{f.good === false ? 'Cost them' : 'Key factor'}</div><div className="font-semibold text-[13.5px] mt-1">{f.title}</div><div className="text-dim text-[12.5px]">{f.body}</div></div>)}</div>}
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card eyebrow="Cumulative expected goals" title="xG race" right={<span className="text-[10.5px] text-dim">dots = goals · dashed = changes</span>}><XgRace R={R} teams={teams} /></Card>
          <Card eyebrow="Size = xG · filled = on target" title="Shot map" right={<div className="w-28"><Seg id="shotmap-side" value={sideMap} options={[teams[0].short, teams[1].short]} onChange={setSideMap} size="sm" /></div>}><ShotMap R={R} side={sideMap} teams={teams} /></Card>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.45fr]">
          <Card eyebrow={`${teams[0].short} left · ${teams[1].short} right`} title="Team stats"><StatRows ts={ts} teams={teams} /></Card>
          <Card eyebrow="Click a column to sort" title="Player ratings">
            <div className="overflow-x-auto scroll-thin"><table className="w-full text-[12px] tnum"><thead><tr className="text-left border-b border-line">{th('name', 'Player')}{th('minutes', 'Min', 'text-right')}{th('rating', 'Rtg', 'text-right')}{th('goals', 'G', 'text-right')}{th('assists', 'A', 'text-right')}{th('xg', 'xG', 'text-right')}{th('passPct', 'Pass%', 'text-right')}{th('tackles', 'Tkl', 'text-right')}{th('distKm', 'km', 'text-right')}{th('endCondition', 'Cond', 'text-right')}</tr></thead>
              <tbody>{rows.map(p => <tr key={p.id} className="border-b border-line/60">
                <td className="py-1.5 px-1.5 whitespace-nowrap"><span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: teams[p.side].color }} /><span className="font-mono text-dim mr-1">{p.num}</span>{(() => { const sp = teams[p.side].players.find(q => q.id === p.id); return sp && sp.flag ? <span className="inline-block align-middle mr-1.5"><Flag code={sp.flag} title={sp.nation} h={10} /></span> : null; })()}{p.name}{p.yellow > 0 && <span className="ml-1"><CardIcon n={p.yellow} /></span>}{p.red && <span className="ml-1"><CardIcon red /></span>}{p.injury && <span className="text-bad ml-1">+</span>}</td>
                <td className="text-right px-1.5">{p.minutes}</td><td className="text-right px-1.5"><span className={`inline-block min-w-[34px] text-center rounded-[3px] px-1 font-bold ${p.rating >= 7.5 ? 'bg-accent text-accentink' : p.rating < 6 ? 'bg-bad/15 text-bad' : 'bg-surface2'}`}>{fx(p.rating, 1)}</span></td>
                <td className="text-right px-1.5">{p.goals || ''}</td><td className="text-right px-1.5">{p.assists || ''}</td><td className="text-right px-1.5">{p.xg ? fx(p.xg, 2) : ''}</td><td className="text-right px-1.5">{p.passPct ?? ''}</td><td className="text-right px-1.5">{p.tackles || ''}</td><td className="text-right px-1.5">{fx(p.distKm, 1)}</td><td className="text-right px-1.5">{pct(p.endCondition)}</td>
              </tr>)}</tbody></table></div>
          </Card>
        </div>
        <Card eyebrow="What the management game carries forward" title="Carry-over" right={<Btn size="sm" onClick={copy}><Icon n="copy" s={13} />{copied === 'ok' ? 'Copied' : 'Copy JSON'}</Btn>}>
          <div className="grid gap-4 md:grid-cols-3 text-[12.5px]">
            <div><div className="eyebrow mb-1.5">Injuries</div>{R.carryOver.filter(c => c.injury).map(c => <div key={c.playerId} className="py-0.5"><span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: teams[c.side].color }} />{c.name} · {c.injury.type} · about {c.injury.days} days</div>)}{!R.carryOver.some(c => c.injury) && <div className="text-dim">None</div>}</div>
            <div><div className="eyebrow mb-1.5">Cards and suspensions</div>{R.carryOver.filter(c => c.yellow || c.red).map(c => <div key={c.playerId} className="py-0.5"><span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: teams[c.side].color }} />{c.name} · {c.red ? 'red, suspended 1 match' : c.yellow + ' yellow'}</div>)}{!R.carryOver.some(c => c.yellow || c.red) && <div className="text-dim">None</div>}</div>
            <div><div className="eyebrow mb-1.5">Most tired (end condition)</div>{R.carryOver.slice().sort((a, b) => a.endCondition - b.endCondition).slice(0, 4).map(c => <div key={c.playerId} className="flex items-center gap-2 py-0.5"><span className="flex-1 truncate">{c.name}</span><CondBar v={c.endCondition} w="w-16" /><span className="font-mono text-[11px] w-8 text-right">{pct(c.endCondition)}</span></div>)}</div>
          </div>
          {copied === 'select' && <textarea id="carry-json" readOnly value={json} onFocus={e => e.target.select()} autoFocus className="mt-3 w-full h-40 font-mono text-[11px] rounded-md border border-line bg-bg p-2" />}
        </Card>
        <div><Btn onClick={onBack}><Icon n="back" s={13} />Back to match setup</Btn></div>
      </div>
    </div>
  );
}

