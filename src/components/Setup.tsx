'use client';
/* eslint-disable */
import * as React from 'react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as E from '@/engine/engine';
import { clone, fx, pct, lastName, club, hexSeed, store, ovr, ATTR_LABEL, TACTIC_META, SPEEDS, BANNER_TYPES, RESTART_LABEL, posLabel, textOn, cssVar, defaultTeams, rebuildSquad } from '@/lib/util';
import { I, Icon, Btn, Seg, Card, Badge, CondBar, CardIcon, Progress, PageHead, Tabs, Empty } from '@/components/ui';
import { runBatch } from '@/lib/batch';

export function Setup({ teams, setTeams, seed, setSeed, venue, setVenue, control, setControl, onKickoff, onSimulate, history, onReplay, onEditTactics }: any) {
  const errs = { home: E.validateLineup(teams.home), away: E.validateLineup(teams.away) };
  const ok = !errs.home.length && !errs.away.length;
  const [busy, setBusy] = useState(false);
  const upd = (side, patch) => setTeams(t => ({ ...t, [side]: { ...t[side], ...patch } }));
  const teamCard = side => {
    const t = teams[side];
    const xi = t.xi.map(id => t.players.find(p => p.id === id)).filter(Boolean);
    const avg = xi.length ? xi.reduce((s, p) => s + ovr(p), 0) / xi.length : 0;
    return (
      <div key={side} className="flex-1 min-w-0 rounded-lg border border-line bg-surface p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <label className="relative cursor-pointer" title="Kit colour"><Badge color={t.color} label={t.short} size={48} /><input id={`kit-${side}`} type="color" value={t.color} onChange={e => upd(side, { color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={`${t.name} kit colour`} /></label>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">{side === 'home' ? 'Home' : 'Away'} · {t.formation}</div>
            <input id={`name-${side}`} value={t.name} onChange={e => upd(side, { name: e.target.value || ' ', short: (e.target.value || 'XXX').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() })} className="w-full bg-transparent font-display font-bold uppercase text-[26px] leading-tight outline-none border-b border-transparent focus:border-line" />
          </div>
        </div>
        <div className="grid grid-cols-3 border border-line rounded-md divide-x divide-line">
          {[[fx(avg, 1), 'XI rating'], [t.formation, 'Formation'], [TACTIC_META.mentality.opts[t.tactics.mentality], 'Mentality']].map(([v, l]) => <div key={l} className="py-2.5 px-3"><div className="font-display font-bold text-[22px] tnum leading-none">{v}</div><div className="eyebrow mt-1 !text-[9.5px]">{l}</div></div>)}
        </div>
        <div>
          <div className="flex justify-between"><span className="eyebrow">Squad strength</span><span className="font-mono text-[12px] tnum">{t.strength}</span></div>
          <input id={`str-${side}`} type="range" min="6" max="18" value={t.strength} onChange={e => setTeams(tt => ({ ...tt, [side]: rebuildSquad(tt[side], { strength: +e.target.value }) }))} className="w-full mt-1" />
        </div>
        <div className="flex flex-wrap gap-2"><Btn onClick={() => onEditTactics(side)}>Edit squad & tactics</Btn><Btn kind="quiet" onClick={() => setTeams(tt => ({ ...tt, [side]: rebuildSquad(tt[side], { seed: Math.floor(Math.random() * 1e6) }) }))}>New random squad</Btn></div>
        {errs[side].length > 0 && <ul className="rounded-md border border-bad/40 bg-bad/10 p-2.5 text-[12px] text-bad space-y-0.5">{errs[side].map((e, i) => <li key={i}>• {e.message}</li>)}</ul>}
      </div>
    );
  };
  return (
    <div className="glow-bg min-h-[calc(100vh-56px)]">
      <div className="gutter mx-auto max-w-[1280px] py-8 flex flex-col gap-6">
        <PageHead eyebrow="Match setup" title="Matchday" sub="Pick two squads and a seed, then kick off live or simulate instantly. The same seed and the same manager decisions always produce the same match." />
        <div className="flex flex-col md:flex-row items-stretch gap-3">{teamCard('home')}<div className="grid place-items-center"><span className="font-display font-bold text-dim text-[20px] px-1">VS</span></div>{teamCard('away')}</div>
        <div className="rounded-lg border border-line bg-surface p-4 grid gap-4 lg:grid-cols-[0.9fr_1fr_1.3fr_auto] items-end">
          <div><div className="eyebrow mb-1.5">Seed</div><div className="flex gap-2"><input id="seed" type="number" value={seed} onChange={e => setSeed(Math.max(0, Math.floor(+e.target.value || 0)))} className="w-full h-9 rounded-md border border-line bg-bg px-3 font-mono tnum outline-none focus:border-accent" /><Btn onClick={() => setSeed(Math.floor(Math.random() * 16777215))} title="Random seed">Random</Btn></div></div>
          <div><div className="eyebrow mb-1.5">Venue</div><Seg id="venue" value={venue === 'home' ? 0 : 1} options={['Home ground', 'Neutral']} onChange={i => setVenue(i ? 'neutral' : 'home')} /></div>
          <div><div className="eyebrow mb-1.5">You manage</div><Seg id="control" value={['home', 'away', 'both', 'none'].indexOf(control)} options={['Home', 'Away', 'Both', 'Watch']} onChange={i => setControl(['home', 'away', 'both', 'none'][i])} /></div>
          <div className="flex gap-2 flex-wrap"><Btn kind="primary" size="lg" disabled={!ok} onClick={onKickoff}>Kick off <Icon n="play" s={14} /></Btn><Btn size="lg" disabled={!ok || busy} onClick={async () => { setBusy(true); await new Promise(r => setTimeout(r, 20)); onSimulate(); setBusy(false); }}>{busy ? 'Simulating…' : 'Simulate instantly'}</Btn></div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Card eyebrow="Saved in this browser" title="Recent matches">
            {history.length === 0 ? <p className="text-dim text-[12.5px] py-6 text-center">No matches yet. Every match you play or simulate appears here with its seed and command log, ready to replay exactly.</p> :
              <ul className="divide-y divide-line">{history.map(h => (
                <li key={h.id} className="flex items-center gap-3 py-2.5">
                  <Badge color={h.colors[0]} label={h.shorts[0]} size={26} /><span className="font-display font-bold text-[20px] tnum w-12 text-center">{h.score[0]}–{h.score[1]}</span><Badge color={h.colors[1]} label={h.shorts[1]} size={26} />
                  <div className="min-w-0 flex-1"><div className="truncate text-[12.5px]">{h.names[0]} v {h.names[1]}</div><div className="text-dim font-mono text-[10.5px]">SEED {hexSeed(h.config.seed)} · {h.commands.length} command{h.commands.length === 1 ? '' : 's'} · {new Date(h.date).toLocaleString()}</div></div>
                  <Btn size="sm" onClick={() => onReplay(h)}>Replay</Btn>
                </li>))}</ul>}
          </Card>
          <Card eyebrow="For game developers" title="Use the engine in code">
            <pre className="text-[11px] leading-[1.6] font-mono bg-bg border border-line rounded-md p-3 overflow-x-auto scroll-thin text-dim">{`import { Match, makeTeam, validateLineup } from '@/engine/engine';

const home = makeTeam({ name: 'Northbridge FC', seed: 11 });
const away = makeTeam({ name: 'Harbour City', seed: 22 });
validateLineup(home);          // → [] or typed errors

const m = new Match({ home, away, seed: ${seed} });
m.runUntil({ minute: 60 });    // or { event: 'goal' }
m.substitute(0, outId, inId);  // applied at next stoppage
m.setTactics(0, { pressing: 2 });
const save = m.save();         // inputs + command log
const res = m.runToEnd();      // score, events, stats,
                               // carryOver, explanation`}</pre>
            <p className="text-dim text-[12px] mt-2">Every control in this app calls exactly these functions.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

