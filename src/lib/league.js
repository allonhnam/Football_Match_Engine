import { makeRng, makeTeam } from '../engine/engine.js';

// Matchup number `i` for calibration.
const SPREAD = 1.01;

// A fresh pair of squads for matchup i, with quality varying like a real league.
export function leagueTeams(i, gap = 0) {
  const rng = makeRng(90210 + i * 31);
  const quality = () => Math.min(17, Math.max(7, 12 + SPREAD * (rng() + rng() + rng() - 1.5)));
  return {
    home: makeTeam({ name: 'Home', seed: 1000 + 2 * i, strength: quality() + gap / 2 }),
    away: makeTeam({ name: 'Away', seed: 1001 + 2 * i, strength: quality() - gap / 2 }),
  };
}
