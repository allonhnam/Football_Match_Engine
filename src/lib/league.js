import { makeRng, makeTeam } from '../engine/engine.js';

/**
 * Matchup number `i` for calibration. Every match gets a fresh pair of squads, and team quality varies the way it
 * does across a real league (a bell curve around 12 with a spread of about 0.64 points), so the engine is checked on the
 * mix of matches real data contains rather than on one pair of identical teams.
 *
 * `gap` shifts quality towards the home side (positive) or away side (negative).
 */
// Spread of squad quality (the standard deviation is half this, about 0.64 points). Calibrated so that how
// predictable engine matches are matches bookmaker odds for real matches (npm run calibrate, "Predictability").
const SPREAD = 0.96;

export function leagueTeams(i, gap = 0) {
  const rng = makeRng(90210 + i * 31);
  const quality = () => Math.min(17, Math.max(7, 12 + SPREAD * (rng() + rng() + rng() - 1.5)));
  return {
    home: makeTeam({ name: 'Home', seed: 1000 + 2 * i, strength: quality() + gap / 2 }),
    away: makeTeam({ name: 'Away', seed: 1001 + 2 * i, strength: quality() - gap / 2 }),
  };
}
