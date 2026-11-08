import type { TeamSheet } from '../engine/engine';

/** A fresh, varied pair of squads for calibration match number `i`; `gap` favours the home side when positive. */
export function leagueTeams(i: number, gap?: number): { home: TeamSheet; away: TeamSheet };
