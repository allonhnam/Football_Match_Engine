export interface MatchLine {
  goalsH: number; goalsA: number; shotsH: number; shotsA: number; onTargetH: number; onTargetA: number;
  cornersH: number; cornersA: number; foulsH: number; foulsA: number;
  yellowsH: number; yellowsA: number; redsH: number; redsA: number;
}

export interface CountMetric {
  key: string; label: string; edges: number[]; decimals: number; value: (l: MatchLine) => number;
}
export interface RateMetric { key: string; label: string; hit: (l: MatchLine) => boolean }
export interface RatioMetric { key: string; label: string; num: (l: MatchLine) => number; den: (l: MatchLine) => number }

export const COUNT_METRICS: CountMetric[];
export const RATE_METRICS: RateMetric[];
export const RATIO_METRICS: RatioMetric[];

export interface CountStats {
  mean: number; sd: number; p10: number; p50: number; p90: number; edges: number[]; hist: number[];
}
export interface Analysis {
  n: number;
  counts: Record<string, CountStats>;
  rates: Record<string, number>;
  ratios: Record<string, number>;
}

export function histogram(values: number[], edges: number[]): number[];
export function totalVariation(a: number[], b: number[]): number;
export function analyse(lines: MatchLine[]): Analysis;

export interface Comparison { mean: number; tol: number; ok: boolean; tv?: number }
export function compareCount(real: CountStats, engineValues: number[]): Comparison & { tv: number };
export function compareRate(realRate: number, hits: number, n: number): Comparison;
export function compareRatio(realRatio: number, value: number): Comparison;

export function lineFromEngine(
  score: [number, number],
  teamStats: { shots: number; onTarget: number; corners: number; fouls: number; yellows: number; reds: number }[],
): MatchLine;
