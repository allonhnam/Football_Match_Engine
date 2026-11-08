'use client';
/* eslint-disable */
import * as React from 'react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as E from '@/engine/engine';
import { clone, fx, pct, lastName, club, hexSeed, store, ovr, ATTR_LABEL, TACTIC_META, SPEEDS, BANNER_TYPES, RESTART_LABEL, posLabel, textOn, cssVar, defaultTeams, rebuildSquad } from '@/lib/util';
import { I, Icon, Btn, Seg, Card, Badge, CondBar, CardIcon, Progress, PageHead, Tabs, Empty } from '@/components/ui';
import { drawPitch } from '@/lib/pitch';
import { liveStats, eventTitle, DOT, buildInsight, whyItMatters } from '@/lib/liveHelpers';
import { Momentum, StatRows } from '@/components/LiveParts';
import { ManagerPanel } from '@/components/ManagerPanel';
export function LiveMatch({ session, control, settings, onFinished, onNewMatch }: any) {
  const active = true; // the route unmounts this view when the user leaves it
  const mRef = useRef(null), canvasRef = useRef(null);
  const [, setVersion] = useState(0); const bump = useCallback(() => setVersion(v => v + 1), []);
  const [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(0), [tab, setTab] = useState('events');
  const [opts, setOpts] = useState(() => ({ names: window.innerWidth >= 640, shape: false, follow: false }));
  const [keyOnly, setKeyOnly] = useState(true), [banner, setBanner] = useState(null), [overlay, setOverlay] = useState(() => (session.match.finished ? 'fulltime' : session.match.phase === 'halftime' ? 'halftime' : session.match.tick > 0 ? null : 'prematch'));
  const [insight, setInsight] = useState(null), [picked, setPicked] = useState('xg'), [open, setOpen] = useState(null), [help, setHelp] = useState(false);
  const [health, setHealth] = useState({ fps: 60, us: 0 });
  const st = useRef({ acc: 0, lastEv: session.match.events.length, flash: 0, cam: { cx: null, cy: null }, stepT: 0, stepN: 0, frames: 0, fpsT: 0, lastInsight: -1 });
  const playingRef = useRef(playing), speedRef = useRef(speed), optsRef = useRef(opts), settingsRef = useRef(settings);
  playingRef.current = playing; speedRef.current = speed; optsRef.current = opts; settingsRef.current = settings;
  useEffect(() => { if (!active) setPlaying(false); }, [active]);
  if (!mRef.current) mRef.current = session.match; // owned by the app so it survives route changes
  const m = mRef.current, replay = session.mode === 'replay', cmds = session.commands || [];

  const stepOnce = () => {
    if (replay) while (session.ui.cmdPtr < cmds.length && cmds[session.ui.cmdPtr].tick <= m.tick) { const c = cmds[session.ui.cmdPtr++]; if (c.kind === 'sub') m.substitute(c.side, c.outId, c.inId, true); else if (c.kind === 'tactics') m.setTactics(c.side, c.tactics, true); else if (c.kind === 'formation') m.setFormation(c.side, c.formation, true); else if (c.kind === 'cancel') m.cancelPending(c.side, c.idx); }
    const t0 = performance.now(); m.step(); st.current.stepT += performance.now() - t0; st.current.stepN++;
  };
  const handleEvents = quiet => {
    const evs = m.events;
    for (let i = st.current.lastEv; i < evs.length; i++) {
      const e = evs[i];
      if (BANNER_TYPES[e.type] && !quiet && settingsRef.current.banners) setBanner({ ...e, id: i, until: performance.now() + (speedRef.current >= 2 ? 1500 : 3400) });
      if (e.type === 'goal') st.current.flash = quiet ? 0 : 1;
      if (e.type === 'halftime' && settingsRef.current.htPause) { setPlaying(false); setOverlay('halftime'); }
      if (e.type === 'fulltime' || e.type === 'abandoned') { setPlaying(false); setOverlay('fulltime'); }
    }
    st.current.lastEv = evs.length;
    const mi = Math.floor(m.clockSec() / 60);
    if (mi >= 7 && mi % 7 === 0 && st.current.lastInsight !== mi) { st.current.lastInsight = mi; setInsight(buildInsight(m, m.clockSec())); }
    if (m.finished && !session.ui.finishedSent) { session.ui.finishedSent = true; onFinished(m, replay); }
  };
  useEffect(() => {
    let raf, last = performance.now(), uiT = 0;
    const colors = () => ({ pa: cssVar('--pitch-a'), pb: cssVar('--pitch-b'), line: cssVar('--pitch-line'), accent: cssVar('--accent'), bad: cssVar('--bad'), chip: cssVar('--chip') });
    let col = colors(); const obs = new MutationObserver(() => { col = colors(); }); obs.observe(document.documentElement, { attributes: true });
    const frame = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now; const mm = mRef.current;
      if (playingRef.current && mm && !mm.finished && mm.phase !== 'halftime') {
        st.current.acc += dt * SPEEDS[speedRef.current].gps / 0.25; let n = 0;
        while (st.current.acc >= 1 && n < 400) { stepOnce(); st.current.acc -= 1; n++; if (mm.phase === 'halftime' || mm.finished) { st.current.acc = 0; break; } }
        if (n) handleEvents(speedRef.current >= 3);
        if (mm.phase === 'halftime' && !settingsRef.current.htPause) { stepOnce(); handleEvents(true); }
      }
      const cv = canvasRef.current;
      if (cv && mm && cv.clientWidth) {
        const ctx = cv.getContext('2d'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
        if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (st.current.flash > 0) st.current.flash = Math.max(0, st.current.flash - dt * 0.9);
        drawPitch(ctx, w, h, mm, playingRef.current ? Math.min(1, st.current.acc) : 1, optsRef.current, col, st.current.flash, st.current.cam);
      }
      st.current.frames++; st.current.fpsT += dt; uiT += dt;
      if (uiT > 0.25) { if (st.current.fpsT > 1) { setHealth({ fps: Math.round(st.current.frames / st.current.fpsT), us: st.current.stepN ? (st.current.stepT / st.current.stepN) * 1000 : 0 }); st.current.frames = 0; st.current.fpsT = 0; st.current.stepT = 0; st.current.stepN = 0; } uiT = 0; if (playingRef.current) setVersion(v => v + 1); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); obs.disconnect(); };
  }, []);
  useEffect(() => { if (banner) { const h = setTimeout(() => setBanner(b => (b && b.id === banner.id ? null : b)), Math.max(300, banner.until - performance.now())); return () => clearTimeout(h); } }, [banner]);

  const nextKey = () => { setOverlay(null); if (m.phase === 'halftime') stepOnce(); let g = 0; const start = m.events.length; while (!m.finished && g++ < 30000) { stepOnce(); if (m.phase === 'halftime') break; let hit = false; for (let k = start; k < m.events.length; k++) if (m.events[k].key) { hit = true; break; } if (hit) break; } st.current.acc = 0; handleEvents(false); setPlaying(false); bump(); };
  const skipEnd = () => { setOverlay(null); let g = 0; while (!m.finished && g++ < 60000) stepOnce(); handleEvents(true); bump(); };
  const startSecond = () => { setOverlay(null); stepOnce(); handleEvents(false); setPlaying(true); };
  const kick = () => { setOverlay(null); setPlaying(true); };
  useEffect(() => {
    const onKey = e => {
      if (!active || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
      if (e.code === 'Space') { e.preventDefault(); if (overlay === 'prematch') kick(); else if (overlay === 'halftime') startSecond(); else if (!m.finished) setPlaying(p => !p); }
      else if (['1', '2', '3', '4'].includes(e.key)) setSpeed(+e.key - 1);
      else if (/^[nN]$/.test(e.key)) nextKey(); else if (/^[eE]$/.test(e.key)) skipEnd(); else if (/^[mM]$/.test(e.key)) setTab('manager');
      else if (/^[fF]$/.test(e.key)) setOpts(o => ({ ...o, follow: !o.follow }));
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const ts = liveStats(m), [h, a] = m.teams;
  const evList = m.events.filter(e => e.type !== 'kickoff' || e.half === 2 || e.tick <= 1).filter(e => !keyOnly || e.key || e.type === 'kickoff' || e.type === 'tactic' || (e.type === 'shot' && e.xg > 0.15)).slice().reverse();
  const reds = s => m.players.filter(q => q.side === s && q.red).length;
  const restart = m.phase === 'dead' && m.restart && !overlay ? RESTART_LABEL[m.restart.type] : null;
  const half = m.finished ? 'FULL TIME' : m.phase === 'halftime' ? 'HALF-TIME' : m.half === 1 ? '1ST HALF' : '2ND HALF';
  const ratings = tab === 'players' ? new Map<string, any>(m.result().playerStats.map(p => [p.id, p] as [string, any])) : null;
  const teamHead = (t, s, right = false) => (
    <div className={`flex items-center gap-3 min-w-0 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <Badge color={t.color} label={t.short} size={38} />
      <div className="min-w-0 hidden sm:block"><div className={`flex items-center gap-2 ${right ? 'justify-end' : ''}`}><span className="font-display font-bold uppercase text-[19px] leading-none truncate">{t.name}</span>{Array.from({ length: reds(s) }).map((_, i) => <CardIcon key={i} red />)}</div><div className="text-[10.5px] text-dim tracking-[.12em] mt-1">{s === 0 ? 'HOME' : 'AWAY'} · {t.formation.replace(/-/g, '–')}</div></div>
    </div>);
  const card = (eyebrow, title, body, color = undefined) => (
    <div className="slidein absolute left-2 bottom-2 sm:left-4 sm:bottom-4 max-w-[min(420px,calc(100%-16px))] rounded-md overflow-hidden flex" style={{ background: 'var(--chip)' }}>
      <div className="w-[3px] shrink-0" style={{ background: color || 'var(--accent)' }} />
      <div className="px-3 py-2 sm:px-4 sm:py-3"><div className="text-[9.5px] sm:text-[10px] tracking-[.14em] font-bold" style={{ color: color || 'var(--accent)' }}>{eyebrow}</div><div className="text-white font-semibold text-[13px] sm:text-[15px] leading-tight mt-0.5 sm:mt-1">{title}</div>{body && <div className="hidden sm:block text-white/60 text-[11.5px] mt-1">{body}</div>}</div>
    </div>);
  const bannerColor = b => b.type === 'goal' ? m.teams[b.side].color : b.type === 'yellow' ? 'rgb(var(--c-yellow))' : b.type === 'red' || b.type === 'injury' ? 'var(--bad)' : 'var(--accent)';
  const bannerParts = b => { const [, sub] = eventTitle(b, m); const parts = sub.split(' · '); return b.type === 'goal' ? [parts[0], `${parts.slice(1).join(' · ')} · ${h.short} ${b.score?.[0]}–${b.score?.[1]} ${a.short}`] : [sub, null]; };
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] lg:h-[calc(100vh-56px)]">
      <div className="flex flex-col gap-3 p-3 md:p-4 min-w-0 min-h-0">
        <div className="rounded-xl border border-line bg-surface px-3 sm:px-4 py-2.5 sm:py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {teamHead(h, 0)}
          <div className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-4">
            <span className="hidden md:flex items-center gap-1.5 text-[10.5px] tracking-[.12em] text-dim">{replay ? <span className="text-accent font-bold">REPLAY</span> : <><span className={`w-1.5 h-1.5 rounded-full ${playing ? 'bg-accent livedot' : 'bg-dim'}`} />{playing ? 'LIVE' : m.finished ? 'FT' : 'PAUSED'}</>} · {half}</span>
            <span key={h.score + '-' + a.score} className="font-display font-bold text-[40px] leading-none tnum pop">{h.score}<span className="text-dim mx-2">–</span>{a.score}</span>
            <span className="flex items-center gap-1.5"><span className="font-display font-bold text-[19px] tnum">{m.clockLabel()}</span>{m.added[m.half - 1] > 0 && <span className="text-[10.5px] font-bold text-accent border border-accent/60 rounded-[3px] px-1">+{m.added[m.half - 1]}</span>}</span>
          </div>
          {teamHead(a, 1, true)}
        </div>
        <div className="relative w-full aspect-[113/76] lg:aspect-auto lg:flex-1 lg:min-h-[320px] rounded-lg overflow-hidden border border-line" style={{ background: 'var(--pitch-a)' }}>
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-label="Live 2D match view" />
          {restart && <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-[3px] text-white text-[10.5px] px-2.5 py-1 font-bold tracking-[.14em] uppercase" style={{ background: 'var(--chip)' }}>{restart}</div>}
          {banner ? <div key={banner.id}>{card(`${{ goal: 'GOAL', yellow: 'YELLOW CARD', red: 'RED CARD', sub: 'SUBSTITUTION', injury: 'INJURY', penalty: 'PENALTY' }[banner.type]} · ${banner.minute}`, bannerParts(banner)[0], bannerParts(banner)[1], bannerColor(banner))}</div>
            : insight && settings.insights && !overlay ? <div key={insight.at}>{card(`LIVE INSIGHT · ${insight.range}`, insight.title, insight.body)}</div> : null}
          {overlay && (
            <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px] p-2 sm:p-4 overflow-y-auto">
              <div className="rounded-lg bg-surface border border-line p-4 sm:p-6 w-[min(440px,100%)] text-center shadow-2xl">
                {overlay === 'prematch' && <><div className="eyebrow-accent">{replay ? 'Replay · same seed, same decisions' : 'Ready for kick-off'}</div><div className="font-display font-bold text-[34px] mt-1 uppercase">{h.short} v {a.short}</div><p className="text-dim text-[12.5px] mt-1">Seed {hexSeed(session.config.seed)} · {session.config.neutral ? 'neutral venue' : `at ${h.name}`}</p>
                  <div className="flex gap-2 justify-center mt-5"><Btn kind="primary" size="lg" onClick={kick}>{replay ? 'Play replay' : 'Kick off'} <Icon n="play" s={14} /></Btn><Btn size="lg" onClick={onNewMatch}>Back to setup</Btn></div>
                  <p className="text-[11px] text-dim mt-4 font-mono">SPACE play · 1–4 speed · N next event · E skip · F follow ball · M manager</p></>}
                {overlay === 'halftime' && <><div className="eyebrow-accent">Half-time</div><div className="font-display font-bold text-[48px] tnum leading-none mt-2">{h.score} – {a.score}</div>
                  <div className="grid grid-cols-3 text-[12px] gap-y-1.5 mt-4">{[[fx(ts[0].xg, 2), 'xG', fx(ts[1].xg, 2)], [ts[0].shots, 'Shots', ts[1].shots], [ts[0].possessionPct + '%', 'Possession', ts[1].possessionPct + '%']].map(([x, l, y]) => <React.Fragment key={l}><b className="tnum">{x}</b><span className="text-dim">{l}</span><b className="tnum">{y}</b></React.Fragment>)}</div>
                  <div className="flex gap-2 justify-center mt-5">{!replay && control !== 'none' && <Btn onClick={() => setTab('manager')}>Make changes</Btn>}<Btn kind="primary" onClick={startSecond}>Start second half</Btn></div></>}
                {overlay === 'fulltime' && <><div className="eyebrow-accent">{m.abandoned ? 'Abandoned' : 'Full time'}</div><div className="font-display font-bold text-[52px] tnum leading-none mt-2">{h.score} – {a.score}</div>
                  {m.abandoned && <p className="text-bad text-[12.5px] mt-1">{m.abandoned.reason} ({m.abandoned.minute}′)</p>}<p className="text-dim text-[12.5px] mt-3">{m.explain().verdict}</p>
                  <div className="flex gap-2 justify-center mt-5"><Btn kind="primary" onClick={() => onFinished(m, replay, true)}>Match report</Btn><Btn onClick={onNewMatch}>New match</Btn></div></>}
              </div>
            </div>)}
        </div>
        <div className="rounded-lg border border-line bg-surface px-3 pt-2 pb-1">
          <div className="flex justify-between items-center gap-2"><span className="eyebrow">Momentum</span><span className="text-[10.5px] text-dim truncate">xG and final-third pressure per minute · <span style={{ color: h.color }}>{h.short} up</span> · <span style={{ color: a.color }}>{a.short} down</span></span></div>
          <Momentum m={m} />
          <div className="flex justify-between text-[10px] font-mono text-dim -mt-0.5"><span>0'</span><span>45'</span><span>90'</span></div>
        </div>
        <div className="relative rounded-lg border border-line bg-surface px-2.5 py-2 flex flex-wrap items-center gap-2">
          <button disabled={m.finished || overlay === 'prematch' || overlay === 'halftime'} onClick={() => setPlaying(p => !p)} className="h-9 w-9 grid place-items-center rounded-md bg-accent text-accentink disabled:opacity-40" aria-label={playing ? 'Pause' : 'Play'}><Icon n={playing ? 'pause' : 'play'} /></button>
          <button disabled={m.finished} onClick={nextKey} className="h-9 w-9 grid place-items-center rounded-md border border-line text-dim hover:text-ink disabled:opacity-40" title="Next key event (N)" aria-label="Next key event"><Icon n="next" s={14} /></button>
          <button disabled={m.finished} onClick={skipEnd} className="h-9 w-9 grid place-items-center rounded-md border border-line text-dim hover:text-ink disabled:opacity-40" title="Skip to full time (E)" aria-label="Skip to full time"><Icon n="skip" s={14} /></button>
          <div className="flex-1 min-w-[168px] sm:flex-none sm:w-44 sm:ml-1"><Seg id="speed" value={speed} options={SPEEDS.map(s => s.k)} onChange={setSpeed} size="sm" /></div>
          <span className="eyebrow hidden xl:inline">Match speed</span>
          <div className="flex-1" />
          {[['follow', 'cam', opts.follow ? 'Follow ball' : 'Full pitch'], ['names', 'tag', 'Names'], ['shape', 'shape', 'Shape']].map(([k, ic, l]) => <button key={k} onClick={() => setOpts(o => ({ ...o, [k]: !o[k] }))} aria-pressed={opts[k]} className={`h-9 px-2.5 flex items-center gap-1.5 rounded-md text-[10.5px] font-bold tracking-[.12em] uppercase ${opts[k] ? 'text-accent bg-accent/10 border border-accent/40' : 'text-dim hover:text-ink border border-transparent'}`}><Icon n={ic} s={14} /><span className="hidden sm:inline">{l}</span></button>)}
          <button onClick={() => setHelp(v => !v)} className="hidden sm:grid h-9 w-9 place-items-center rounded-md border border-line text-dim hover:text-ink font-bold" aria-label="Keyboard shortcuts">?</button>
          {help && <div className="absolute right-2 bottom-12 z-10 rounded-md border border-line bg-surface p-3 shadow-2xl text-[12px] w-60">{[['Space', 'Play / pause'], ['1–4', 'Speed 1×, 2×, 4×, 16×'], ['N', 'Next key event'], ['E', 'Skip to full time'], ['F', 'Follow ball camera'], ['M', 'Open manager']].map(([k, l]) => <div key={k} className="flex justify-between py-0.5"><kbd className="font-mono text-accent">{k}</kbd><span className="text-dim">{l}</span></div>)}<div className="text-[11px] text-dim mt-2">1× shows 12 seconds of play per second.</div></div>}
        </div>
      </div>
      <aside className="border-t lg:border-t-0 lg:border-l border-line bg-surface flex flex-col min-h-[480px] lg:min-h-0">
        <div role="tablist" className="grid grid-cols-4 border-b border-line">
          {[['events', 'Events'], ['stats', 'Stats'], ['players', 'Players'], ['manager', 'Manager']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`relative h-11 text-[12.5px] ${tab === k ? 'text-ink font-semibold' : 'text-dim hover:text-ink'}`}>{l}{k === 'manager' && (m.teams[0].pending.length + m.teams[1].pending.length) > 0 && <span className="ml-1 text-accent">•</span>}{tab === k && <span className="absolute left-3 right-3 bottom-0 h-0.5 bg-accent" />}</button>)}
        </div>
        <div className="flex-1 overflow-y-auto scroll-thin">
          {tab === 'events' && <>
            <div className="px-4 py-3 border-b border-line flex items-start justify-between gap-2"><div><div className="eyebrow">Match feed</div><div className="text-[12.5px] mt-0.5">Live commentary and key moments</div></div><label className="flex items-center gap-1.5 text-[11px] text-dim mt-1 cursor-pointer"><input id="key-only" type="checkbox" checked={keyOnly} onChange={e => setKeyOnly(e.target.checked)} className="accent-[var(--accent)]" />Key only</label></div>
            {evList.length === 0 && <p className="text-dim text-[12.5px] py-10 text-center">Nothing yet. Kick off to start the feed.</p>}
            <ul>{evList.slice(0, 250).map((e, i) => { const [tt, sub] = eventTitle(e, m), id = e.tick + '-' + e.type + '-' + (e.player || ''), isOpen = open === id; return (
              <li key={id + i} className={`border-b border-line ${i === 0 && playing ? 'shadow-[inset_2px_0_0_var(--accent)]' : ''}`}>
                <button onClick={() => setOpen(isOpen ? null : id)} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface2/40">
                  <span className="font-mono text-[11px] text-dim w-9 shrink-0 pt-0.5 tnum">{e.minute}</span>
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${DOT[e.type] || 'border border-dim'}`} style={(e.type === 'sub' || e.type === 'tactic') && e.side != null ? { background: m.teams[e.side].color, border: 0 } : {}} />
                  <span className="flex-1 min-w-0"><span className="block text-[12.5px] font-semibold">{tt}</span><span className="block text-[11.5px] text-dim leading-snug">{sub}</span></span>
                  <Icon n="chev" s={14} className={`text-dim mt-1 transition ${isOpen ? 'rotate-90' : ''}`} />
                </button>
                {isOpen && <div className="px-4 pb-3 pl-[64px] flex items-center gap-3"><svg viewBox="0 0 105 68" className="w-28 h-auto rounded-sm shrink-0" style={{ background: 'var(--pitch-a)' }}><rect x="0.5" y="0.5" width="104" height="67" fill="none" stroke="rgba(255,255,255,.6)" /><line x1="52.5" x2="52.5" y1="0" y2="68" stroke="rgba(255,255,255,.6)" /><rect x="0.5" y="13.84" width="16.5" height="40.32" fill="none" stroke="rgba(255,255,255,.6)" /><rect x="88" y="13.84" width="16.5" height="40.32" fill="none" stroke="rgba(255,255,255,.6)" /><circle cx={e.x} cy={e.y} r="3" fill={e.side != null ? m.teams[e.side].color : '#fff'} stroke="#000" strokeWidth=".8" /></svg><div className="text-[11px] text-dim leading-relaxed">{e.text}{e.xg != null && <><br />Chance quality {fx(e.xg, 2)} xG</>}<br />Clock {fx(e.t / 60, 1)} min · tick {e.tick}</div></div>}
              </li>); })}</ul>
          </>}
          {tab === 'stats' && <div className="px-4 py-3">
            <div className="eyebrow">Match analysis</div><div className="text-[12.5px] mt-0.5 mb-3">Tap a stat to see the moments behind it</div>
            <div className="flex justify-between text-[10.5px] font-bold tracking-[.12em] text-dim pb-1 border-b border-line"><span>{h.short}</span><span>TEAM STATS</span><span>{a.short}</span></div>
            <StatRows ts={ts} teams={m.teams} onPick={setPicked} picked={picked} />
            <div className="mt-4 rounded-md border border-line bg-bg/60 p-3 border-l-[3px] border-l-accent"><div className="eyebrow-accent">Why it matters</div><div className="font-semibold text-[13px] mt-1">{{ possessionPct: 'Possession', xg: 'Expected goals', shots: 'Shots', onTarget: 'On target', passes: 'Passes', passPct: 'Pass accuracy', f3Entries: 'Final third entries', boxEntries: 'Box entries', fouls: 'Fouls', cards: 'Cards' }[picked] || 'This stat'}</div><p className="text-[12px] text-dim mt-1 leading-relaxed">{whyItMatters(picked, m, ts)}</p></div>
          </div>}
          {tab === 'players' && <div className="px-4 py-3">
            <div className="eyebrow">On the pitch</div><div className="text-[12.5px] mt-0.5 mb-2">Ratings update after every involvement</div>
            {[0, 1].map(s => <div key={s} className="mt-3">
              <div className="flex items-center justify-between py-1.5 border-b border-line"><b className="text-[12.5px]">{m.teams[s].name}</b><span className="text-[11px] text-dim font-mono">{m.teams[s].formation.replace(/-/g, '–')}</span></div>
              {m.players.filter(q => q.side === s && (q.onPitch || q.st.onAt != null)).sort((x, y) => (y.onPitch - x.onPitch) || x.slot - y.slot).map(q => { const r = ratings && ratings.get(q.id); const status = q.red ? 'Sent off' : q.injured ? 'Injured' : q.subOff ? 'Substituted' : q.st.goals ? `${q.st.goals} goal${q.st.goals > 1 ? 's' : ''}` : q.st.assists ? `${q.st.assists} assist${q.st.assists > 1 ? 's' : ''}` : 'Playing'; const kc = q.slot === 0 ? (s === 0 ? '#FFD23C' : '#3DDC97') : m.teams[s].color; return (
                <div key={q.id} className={`flex items-center gap-2.5 py-1.5 border-b border-line/60 ${q.onPitch ? '' : 'opacity-45'}`}>
                  <span className="w-6 h-6 grid place-items-center rounded-full text-[10.5px] font-bold shrink-0" style={{ background: kc, color: textOn(kc) }}>{q.p.num}</span>
                  <span className="flex-1 min-w-0"><span className="block text-[12.5px] truncate">{q.p.name}</span><span className={`block text-[10.5px] ${status === 'Playing' ? 'text-dim' : q.red || q.injured ? 'text-bad' : 'text-accent'}`}>{posLabel(m.teams[s].formation, q.slot)} · {status}</span></span>
                  {q.yellow > 0 && <CardIcon n={q.yellow} />}<CondBar v={q.cond} w="w-10" />
                  <span className={`w-9 text-center rounded-[3px] text-[12px] font-bold tnum py-0.5 ${r && r.rating >= 7.5 ? 'bg-accent text-accentink' : 'bg-surface2'}`}>{r ? fx(r.rating, 1) : '–'}</span>
                </div>); })}
            </div>)}
          </div>}
          {tab === 'manager' && <ManagerPanel m={m} control={control} bump={bump} readOnly={replay} />}
        </div>
        <div className="h-9 border-t border-line px-4 flex items-center justify-between text-[10px] font-mono tracking-[.1em] text-dim">
          <span className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${health.fps > 30 ? 'bg-good' : 'bg-warn'}`} />ENGINE {health.fps > 30 ? 'HEALTHY' : 'BUSY'}</span><span>{health.fps} FPS</span><span>STEP {health.us ? fx(health.us, 0) : '–'} µs</span>
        </div>
      </aside>
    </div>
  );
}

