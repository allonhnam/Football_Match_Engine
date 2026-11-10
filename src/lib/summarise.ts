import type { MatchResult, ValidationError } from '@/engine/engine';
import { matchFlow, type MatchFlow } from '@/lib/metrics';

export type TeamSummary = {
  shots: number; onTarget: number; xg: number; corners: number; fouls: number;
  yellows: number; reds: number; offsides: number; passes: number; passesOk: number; pos: number;
};
export type MatchSummary =
  | { errors: ValidationError[] }
  | { score: [number, number]; ht: [number, number] | null; pens: number; injuries: number; goalTimes: number[]; ts: TeamSummary[]; flow: MatchFlow; players: PlayerLine[] };
/** [id, side, minutes, goals, assists, yellows, red 0/1, injured 0/1, rating] for each player who took part. */
export type PlayerLine = [string, 0 | 1, number, number, number, number, 0 | 1, 0 | 1, number];

/** Reduce a full result to the numbers batch tools need, so workers send little data back. */
export function summarise(r: MatchResult | { errors: ValidationError[] }): any {
  if ('errors' in r) return { errors: r.errors };
  let pens = 0, inj = 0;
  const goalTimes: number[] = [];
  for (const e of r.events) {
    if (e.type === 'penalty') pens++;
    if (e.type === 'injury') inj++;
    if (e.type === 'goal') goalTimes.push(e.t);
  }
  return {
    score: r.score, ht: r.halftimeScore, pens, injuries: inj, goalTimes, flow: matchFlow(r),
    // one compact line per player who took part: [id, side, minutes, goals, assists, yellows, red 0/1, injured 0/1, rating]
    players: r.playerStats.filter(p => p.minutes > 0).map(p => [p.id, p.side, p.minutes, p.goals, p.assists, p.yellow, p.red ? 1 : 0, p.injury ? 1 : 0, p.rating]),
    ts: r.teamStats.map(s => ({
      shots: s.shots, onTarget: s.onTarget, xg: s.xg, corners: s.corners, fouls: s.fouls,
      yellows: s.yellows, reds: s.reds, offsides: s.offsides, passes: s.passes, passesOk: s.passesOk, pos: s.possessionPct,
    })),
  };
}
