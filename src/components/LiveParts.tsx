'use client';
/* eslint-disable */
import * as React from 'react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as E from '@/engine/engine';
import { clone, fx, pct, lastName, club, hexSeed, store, ovr, ATTR_LABEL, TACTIC_META, SPEEDS, BANNER_TYPES, RESTART_LABEL, posLabel, textOn, cssVar, defaultTeams, rebuildSquad } from '@/lib/util';
import { I, Icon, Btn, Seg, Card, Badge, CondBar, CardIcon, Progress, PageHead, Tabs, Empty } from '@/components/ui';
export function Momentum({ m }: any) {
  const mom = m.momentum, n = Math.max(96, mom.length), W = 1000, H = 54, mid = H / 2, bw = W / n;
  const vals = mom.map((v, i) => { let a = 0, b = 0, c = 0; for (let k = Math.max(0, i - 2); k <= Math.min(mom.length - 1, i + 2); k++) { a += mom[k][0]; b += mom[k][1]; c++; } return [a / c, b / c]; });
  const mx = Math.max(0.12, ...vals.map(v => Math.max(v[0], v[1])));
  const pts = k => vals.map((v, i) => `${(i + 0.5) * bw},${k === 0 ? mid - v[0] / mx * (mid - 4) : mid + v[1] / mx * (mid - 4)}`).join(' ');
  const evs = m.events.filter(e => e.type === 'goal' || e.type === 'red' || e.type === 'yellow' || e.type === 'sub');
  const now = m.clockSec() / 60;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" preserveAspectRatio="none" role="img" aria-label="Momentum by minute">
      <line x1="0" x2={W} y1={mid} y2={mid} stroke="var(--line)" />
      {vals.length > 1 && <><polygon points={`${0.5 * bw},${mid} ${pts(0)} ${(vals.length - 0.5) * bw},${mid}`} fill={m.teams[0].color} opacity="0.32" /><polyline points={pts(0)} fill="none" stroke={m.teams[0].color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <polygon points={`${0.5 * bw},${mid} ${pts(1)} ${(vals.length - 0.5) * bw},${mid}`} fill={m.teams[1].color} opacity="0.32" /><polyline points={pts(1)} fill="none" stroke={m.teams[1].color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></>}
      {evs.map((e, i) => { const x = Math.min(W - 3, (e.t / 60) * bw), top = e.side === 0; return e.type === 'goal' ? <circle key={i} cx={x} cy={top ? 5 : H - 5} r="3.5" fill="var(--accent)" /> : <rect key={i} x={x - 6} y={top ? 3 : H - 6} width="12" height="3" rx="1.5" fill={e.type === 'sub' ? m.teams[e.side].color : e.type === 'red' ? 'var(--bad)' : 'rgb(var(--c-yellow))'} />; })}
      <line x1={Math.min(W, now * bw)} x2={Math.min(W, now * bw)} y1="0" y2={H} stroke="var(--ink)" strokeWidth="1.4" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
export function StatRows({ ts, teams, onPick, picked }: any) {
  const rows = [
    ['possessionPct', 'Possession', ts[0].possessionPct + '%', ts[1].possessionPct + '%', ts[0].possessionPct, ts[1].possessionPct],
    ['xg', 'Expected goals', fx(ts[0].xg, 2), fx(ts[1].xg, 2), ts[0].xg, ts[1].xg],
    ['shots', 'Shots', ts[0].shots, ts[1].shots], ['onTarget', 'On target', ts[0].onTarget, ts[1].onTarget],
    ['passes', 'Passes', ts[0].passes, ts[1].passes], ['passPct', 'Pass accuracy', ts[0].passPct + '%', ts[1].passPct + '%', ts[0].passPct, ts[1].passPct],
    ['f3Entries', 'Final third entries', ts[0].f3Entries, ts[1].f3Entries], ['boxEntries', 'Box entries', ts[0].boxEntries, ts[1].boxEntries],
    ['corners', 'Corners', ts[0].corners, ts[1].corners], ['fouls', 'Fouls', ts[0].fouls, ts[1].fouls], ['offsides', 'Offsides', ts[0].offsides, ts[1].offsides],
    ['cards', 'Cards', ts[0].yellows + ts[0].reds, ts[1].yellows + ts[1].reds], ['saves', 'Saves', ts[0].saves, ts[1].saves], ['tackles', 'Tackles & duels won', ts[0].tackles, ts[1].tackles],
  ];
  return (
    <div className="flex flex-col">
      {rows.map(([k, l, a, b, va = +a, vb = +b]) => { const tot = (va + vb) || 1; return (
        <button key={k} onClick={() => onPick && onPick(k)} className={`text-left py-2 border-b border-line/70 ${picked === k ? 'bg-surface2/60' : onPick ? 'hover:bg-surface2/40' : 'cursor-default'}`}>
          <div className="flex justify-between text-[12px] mb-1.5"><b className="tnum">{a}</b><span className={k === 'xg' ? 'text-ink font-semibold' : 'text-dim'}>{l}</span><b className="tnum">{b}</b></div>
          <div className="flex h-[3px]"><div className="flex-1 flex justify-end"><div style={{ width: pct(va / tot), background: teams[0].color }} /></div><div className="flex-1"><div className="h-full" style={{ width: pct(vb / tot), background: teams[1].color }} /></div></div>
        </button>); })}
    </div>
  );
}

