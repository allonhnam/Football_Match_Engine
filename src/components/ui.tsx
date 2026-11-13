'use client';
import * as React from 'react';
import { pct, textOn, crestUrl } from '@/lib/util';

export const I = {
  play: <path d="M7 5l12 7-12 7z" fill="currentColor" />, pause: <g fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></g>,
  next: <g fill="currentColor"><path d="M5 5l10 7-10 7z" /><rect x="16" y="5" width="3" height="14" rx="1" /></g>, skip: <g fill="currentColor"><path d="M3 5l9 7-9 7z" /><path d="M12 5l9 7-9 7z" /></g>,
  cam: <g fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8 7l1.5-3h5L16 7" /></g>,
  tag: <g fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 12h10" /></g>,
  shape: <g fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 18l5-8 5 5 6-10" /><circle cx="4" cy="18" r="1.5" /><circle cx="9" cy="10" r="1.5" /><circle cx="14" cy="15" r="1.5" /><circle cx="20" cy="5" r="1.5" /></g>,
  sun: <g fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></g>,
  moon: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  gear: <g fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></g>,
  chev: <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" />, check: <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" />, copy: <g fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></g>,
  back: <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" />, x: <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />,
};
// An icon from the built-in set.
export const Icon = ({ n, s = 16, className = '' }: any) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" className={className}>{I[n]}</svg>;
// A button in one of the app's styles.
export function Btn({ children, kind = 'ghost', className = '', size = 'md', ...p }: any) {
  const k = {
    primary: 'bg-accent text-accentink hover:brightness-110 font-bold uppercase tracking-[.08em]',
    ghost: 'border border-line text-ink hover:bg-surface2 font-medium',
    quiet: 'text-dim hover:text-ink hover:bg-surface2 font-medium',
    accent: 'border border-accent text-accent hover:bg-accent/10 font-bold uppercase tracking-[.08em]',
  }[kind];
  const sz = size === 'lg' ? 'h-11 px-6 text-[12.5px]' : size === 'sm' ? 'h-7 px-2.5 text-[11.5px]' : 'h-9 px-4 text-[12px]';
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed ${sz} ${k} ${className}`}>{children}</button>;
}
// A segmented control for picking one of a few options.
export function Seg({ value, options, onChange, pendingFrom, size = 'md', id, upper }: any) {
  return (
    <div role="radiogroup" id={id} className="grid rounded-md border border-line bg-bg/60 p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o, i) => {
        const on = value === i, changed = pendingFrom != null && pendingFrom !== value && on;
        return <button key={o} role="radio" aria-checked={on} onClick={() => onChange(i)}
          className={`rounded-[5px] ${size === 'sm' ? 'h-7 text-[11.5px]' : 'h-8 text-[12px]'} px-2 truncate transition ${upper ? 'uppercase tracking-[.06em] font-semibold' : ''} ${on ? 'bg-surface2 text-ink font-semibold shadow-[inset_0_0_0_1px_var(--line)]' : 'text-dim hover:text-ink'} ${changed ? '!shadow-[inset_0_0_0_1.5px_var(--accent)] !text-accent' : ''}`}>{o}</button>;
      })}
    </div>
  );
}
// A card with an optional title.
export function Card({ title, eyebrow, right, children, className = '', pad = 'p-4' }: any) {
  return (
    <section className={`min-w-0 rounded-lg border border-line bg-surface ${className}`}>
      {(title || eyebrow || right) && <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">{eyebrow && <div className="eyebrow">{eyebrow}</div>}{title && <h2 className="font-semibold text-[14px] mt-0.5 truncate">{title}</h2>}</div>{right}
      </header>}
      <div className={pad}>{children}</div>
    </section>
  );
}
// A club badge: the real crest, or a coloured badge with the club's code.
export function Badge({ color, label, size = 36, crest }: any) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [crest]);
  if (crest && !failed) return <img src={crestUrl(crest)} alt={label} title={label} width={size} height={size} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="shrink-0 object-contain" style={{ width: size, height: size }} />;
  return <ColourBadge color={color} label={label} size={size} />;
}
// A round badge in the club's colour with its code.
function ColourBadge({ color, label, size = 36 }: any) { return <span className="inline-grid place-items-center rounded-full font-display font-bold shrink-0 border-2 border-black/30" style={{ width: size, height: size, background: color, color: textOn(color), fontSize: size * 0.34, letterSpacing: '.02em' }}>{label}</span>; }
// A small bar showing a player's condition.
export function CondBar({ v, w = 'w-14' }: any) { const c = v > 0.75 ? 'bg-good' : v > 0.58 ? 'bg-warn' : 'bg-bad'; return <span className={`inline-block h-1 rounded-full bg-surface2 ${w} overflow-hidden align-middle`}><span className={`block h-full ${c}`} style={{ width: pct(Math.max(0, Math.min(1, v))) }} /></span>; }
// Yellow or red card icons.
export function CardIcon({ red, n = 1 }: any) { return <span className="inline-flex gap-0.5 align-middle">{Array.from({ length: n }).map((_, i) => <span key={i} className={`inline-block w-[7px] h-[10px] rounded-[1.5px] ${red ? 'bg-bad' : 'bg-card'}`} />)}</span>; }
// A thin progress bar.
export function Progress({ v }: any) { return <div className="h-1 rounded-full bg-surface2 overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: pct(v) }} /></div>; }
// A page heading with an optional subtitle and actions.
export function PageHead({ eyebrow, title, sub, right }: any) {
  return <div className="flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><div className="eyebrow-accent">{eyebrow}</div><h1 className="font-display font-bold text-[44px] md:text-[54px] leading-[.95] mt-2">{title}</h1>{sub && <p className="text-dim mt-2.5 max-w-[68ch] text-[13.5px]">{sub}</p>}</div>{right}</div>;
}
// A row of tabs.
export function Tabs({ value, onChange, items }: any) {
  return <div role="tablist" className="flex gap-6 border-b border-line">{items.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={`relative pb-2.5 text-[13px] ${value === k ? 'text-ink font-semibold' : 'text-dim hover:text-ink'}`}>{l}{value === k && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-accent" />}</button>)}</div>;
}

// A placeholder shown when there is nothing to list.
export function Empty({ text }: any) { return <div className="rounded-lg border border-dashed border-line p-12 text-center text-dim text-[13px]">{text}</div>; }

// A national flag.
export function Flag({ code, title, h = 12 }: { code?: string | null; title?: string; h?: number }) {
  if (!code) return null;
  return <span className={`fi fi-${code} shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,.25)]`} title={title} aria-label={title} role="img" style={{ width: h * 4 / 3, height: h, lineHeight: h + 'px', backgroundSize: 'cover' }} />;
}

// What every short label in the app stands for, shown when the label is hovered or focused.
export const GLOSSARY: Record<string, string> = {
  Rtg: 'Match rating, out of 10', Min: 'Minutes played', Mins: 'Minutes played', G: 'Goals', A: 'Assists', Ast: 'Assists',
  xG: 'Expected goals: how many goals the chances were worth', 'Pass%': 'Passes completed', Tkl: 'Tackles won',
  km: 'Distance run, in kilometres', Cond: 'Condition at the end: 100% is fully fresh', Apps: 'Appearances',
  Yel: 'Yellow cards', Red: 'Red cards', Inj: 'Injuries', 'Out inj': 'Matches missed through injury', Banned: 'Matches missed through suspension',
  Pos: 'Position: GK goalkeeper, DF defender, MF midfielder, FW forward', P: 'Played', W: 'Won', D: 'Drawn', L: 'Lost',
  GF: 'Goals for', GA: 'Goals against', GD: 'Goal difference', Pts: 'Points: 3 for a win, 1 for a draw',
  'Avg rating': 'Average match rating, out of 10', Real: 'Where the club really finished in 2025/26, and its real points',
  H: 'Home wins', XI: 'Starting eleven', OVR: 'Overall rating for his position',
  GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward',
  CB: 'Centre-back', LB: 'Left-back', RB: 'Right-back', LWB: 'Left wing-back', RWB: 'Right wing-back',
  DM: 'Defensive midfielder', CM: 'Central midfielder', AM: 'Attacking midfielder', LM: 'Left midfielder', RM: 'Right midfielder',
  LW: 'Left winger', RW: 'Right winger', ST: 'Striker',
};

// A short label that explains itself on hover or focus.
export function Abbr({ children, t, up = false }: { children: React.ReactNode; t?: string; up?: boolean }) {
  const text = t || (typeof children === 'string' ? GLOSSARY[children] : undefined);
  if (!text) return <>{children}</>;
  return (
    <span tabIndex={0} aria-label={`${typeof children === 'string' ? children + ': ' : ''}${text}`} className="relative group/abbr inline-block cursor-help underline decoration-dotted decoration-1 underline-offset-[3px] outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-[2px]">
      {children}
      <span role="tooltip" className={`pointer-events-none absolute z-50 left-1/2 -translate-x-1/2 ${up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} w-max max-w-[220px] whitespace-normal rounded-md border border-line bg-surface2 px-2 py-1 text-left text-[11px] font-medium normal-case tracking-normal text-ink shadow-lg opacity-0 transition-opacity duration-100 group-hover/abbr:opacity-100 group-focus/abbr:opacity-100`}>{text}</span>
    </span>
  );
}
