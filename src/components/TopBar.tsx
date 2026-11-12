'use client';
import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hexSeed } from '@/lib/util';
import { Icon, Seg, Btn } from '@/components/ui';
import { useApp } from '@/components/AppProvider';

// The app logo.
function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M2 20L6 4h3L5 20z" fill="var(--accent)" /><path d="M8 20l4-16h3l-4 16z" fill="var(--accent)" /><path d="M14 20l4-12h3l-4 12z" fill="var(--accent)" />
    </svg>
  );
}

// The navigation bar with the match seed, theme switch and settings.
export function TopBar() {
  const app = useApp();
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const seed = app.session ? app.session.config.seed : app.seed;
  const copySeed = async () => {
    try { await navigator.clipboard.writeText(String(seed)); } catch { }
    setCopied(true); setTimeout(() => setCopied(false), 1300);
  };
  const tabs: [string, React.ReactNode, boolean?][] = [
    ['/', 'Matchday'],
    ['/tactics', <>Squad<span className="hidden lg:inline"> &amp; tactics</span></>],
    ['/report', 'Report', !app.report],
    ['/lab', <><span className="hidden lg:inline">Engine </span>Lab</>],
  ];
  return (
    <header className="sticky z-40 border-b border-line bg-bg/95 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="gutter flex items-center gap-3 md:gap-5 h-14">
        <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="Match Engine home">
          <Logo /><span className="hidden sm:inline font-display font-bold text-[13px] leading-[.9] tracking-wide text-left">MATCH<br />ENGINE</span>
        </Link>
        <nav className="flex-1 min-w-0 overflow-x-auto no-sb self-stretch">
          <ul className="flex gap-4 md:gap-6 h-full">
            {tabs.map(([href, label, disabled]) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <li key={href} className="h-full">
                  {disabled
                    ? <span className="relative h-full flex items-center whitespace-nowrap text-[12px] font-semibold uppercase tracking-[.12em] opacity-30">{label}</span>
                    : <Link href={href} className={`relative h-full flex items-center whitespace-nowrap text-[12px] font-semibold uppercase tracking-[.12em] transition ${active ? 'text-ink' : 'text-dim hover:text-ink'}`}>
                        <span>{label}</span>{href === '/' && app.session && pathname !== '/' && <span className="ml-2 text-accent">●</span>}
                        {active && <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-accent" />}
                      </Link>}
                </li>
              );
            })}
          </ul>
        </nav>
        <button onClick={copySeed} title="Copy deterministic match seed" className="hidden sm:flex items-center gap-2 h-8 rounded-md border border-line px-3 text-[10.5px] tracking-[.12em] text-dim hover:text-ink">
          <span>SEED</span><b className="font-mono text-ink tracking-normal text-[11.5px]">{copied ? 'COPIED' : hexSeed(seed)}</b>
        </button>
        <button onClick={() => app.setTheme(app.theme === 'dark' ? 'light' : 'dark')} className="hidden sm:grid h-8 w-8 place-items-center rounded-md border border-line text-dim hover:text-ink" aria-label="Toggle theme" title="Toggle theme">
          <Icon n={app.theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button onClick={() => app.setShowSettings(true)} className="h-8 w-8 shrink-0 grid place-items-center rounded-md border border-line text-dim hover:text-ink" aria-label="Settings" title="Settings">
          <Icon n="gear" />
        </button>
      </div>
    </header>
  );
}

// The settings panel: live-match options, theme and saved history.
export function SettingsPanel() {
  const { settings, setSettings, theme, setTheme, showSettings, setShowSettings, clearHistory, endMatch, session } = useApp();
  if (!showSettings) return null;
  const close = () => setShowSettings(false);
  const toggle = (k: string, label: string, desc: string) => (
    <label className="flex items-start gap-3 py-2.5 border-b border-line cursor-pointer">
      <input id={`set-${k}`} type="checkbox" checked={settings[k]} onChange={e => setSettings((s: any) => ({ ...s, [k]: e.target.checked }))} className="mt-0.5 accent-[var(--accent)]" />
      <span><span className="block text-[13px] font-medium">{label}</span><span className="block text-[12px] text-dim">{desc}</span></span>
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={close}>
      <div className="absolute right-4 top-16 w-[340px] max-w-[calc(100vw-32px)] rounded-lg border border-line bg-surface p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><span className="eyebrow">Settings</span><button onClick={close} className="text-dim hover:text-ink" aria-label="Close"><Icon n="x" s={14} /></button></div>
        <div className="py-2.5 border-b border-line"><div className="text-[13px] font-medium mb-1.5">Theme</div><Seg id="set-theme" value={theme === 'dark' ? 0 : 1} options={['Dark', 'Light']} onChange={(i: number) => setTheme(i ? 'light' : 'dark')} size="sm" /></div>
        {toggle('insights', 'Live insights', 'A short tactical read on the pitch every 7 minutes')}
        {toggle('banners', 'Event banners', 'Goal, card and substitution banners over the pitch')}
        {toggle('htPause', 'Pause at half-time', 'Stop at the break so you can make changes')}
        <div className="flex flex-col gap-2 mt-3">
          {session && <Btn onClick={() => { endMatch(); close(); }}>End match and return to setup</Btn>}
          <Btn kind="quiet" onClick={() => { clearHistory(); close(); }}>Clear saved matches</Btn>
        </div>
      </div>
    </div>
  );
}
