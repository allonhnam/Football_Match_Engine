'use client';
import * as React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as E from '@/engine/engine';
import { clone, store, defaultTeams, matchKits } from '@/lib/util';

export type Settings = { insights: boolean; banners: boolean; htPause: boolean };

type Ctx = any;
const AppContext = createContext<Ctx>(null);
export const useApp = () => useContext(AppContext) as Ctx;

/**
 * Holds everything that must survive moving between routes: the two team sheets,
 * the match in progress (so the live view can be left and re-entered), the last report,
 * saved matches and the user's settings.
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');
  const [teams, setTeams] = useState<any>(defaultTeams);
  const [seed, setSeed] = useState(0x7c4a91);
  const [venue, setVenue] = useState('home');
  const [control, setControl] = useState('home');
  const [competition, setCompetition] = useState<'league' | 'cup'>('league');
  const [boardSide, setBoardSide] = useState('home');
  const [session, setSession] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [settings, setSettings] = useState<Settings>({ insights: true, banners: true, htPause: true });
  const [showSettings, setShowSettings] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Browser-only state is read after mount so server and client markup match.
  useEffect(() => {
    setThemeState(store.get('me-theme', 'dark'));
    setHistory(store.get('me-history', []));
    setSettings(s => ({ ...s, ...store.get('me-settings', {}) }));
    setLoaded(true);
  }, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => { if (loaded) store.set('me-settings', settings); }, [settings, loaded]);

  const setTheme = (t: 'dark' | 'light') => { setThemeState(t); store.set('me-theme', t); };

  // Kits are settled at kick-off so the two sides (and the pitch) never look alike.
  const config = () => ({ ...matchKits(clone(teams.home), clone(teams.away)), seed, control: control as any, neutral: venue === 'neutral', knockout: competition === 'cup' || undefined });
  const saveHistory = (cfg: any, R: any, commands: any[]) => {
    const h = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), date: Date.now(), score: R.score,
      names: [cfg.home.name, cfg.away.name], shorts: [cfg.home.short, cfg.away.short],
      colors: [cfg.home.color, cfg.away.color], crests: [cfg.home.crest, cfg.away.crest], config: cfg, commands, engineVersion: R.engineVersion,
    };
    setHistory(prev => { const next = [h, ...prev].slice(0, 8); store.set('me-history', next); return next; });
  };
  const clearHistory = () => { setHistory([]); store.set('me-history', []); };

  const startSession = (cfg: any, mode: 'live' | 'replay', commands: any[]) => {
    setSession({ key: Date.now(), config: cfg, mode, commands, match: new E.Match(cfg), ui: { cmdPtr: 0, finishedSent: false } });
    router.push('/');
  };
  const kickoff = () => startSession(config(), 'live', []);
  const replay = (cfg: any, commands: any[]) => startSession(cfg, 'replay', commands);
  const simulate = () => {
    const cfg = config();
    const R = new E.Match(cfg).runToEnd();
    saveHistory(cfg, R, []);
    setReport({ R, teams: [cfg.home, cfg.away], config: cfg, commands: [] });
    router.push('/report');
  };
  const onFinished = (m: any, isReplay: boolean, openReport?: boolean) => {
    if (!openReport) {
      const R = m.result();
      if (!isReplay) saveHistory(m.config, R, m.commands.slice());
      setReport({ R, teams: [m.config.home, m.config.away], config: m.config, commands: m.commands.slice(), replay: isReplay });
      return;
    }
    router.push('/report');
  };
  const endMatch = () => { setSession(null); router.push('/'); };
  const editTactics = (side: string) => { setBoardSide(side); router.push('/tactics'); };

  const value = {
    theme, setTheme, teams, setTeams, seed, setSeed, venue, setVenue, control, setControl, competition, setCompetition,
    boardSide, setBoardSide, session, report, history, settings, setSettings, showSettings, setShowSettings,
    kickoff, replay, simulate, onFinished, endMatch, editTactics, clearHistory,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
