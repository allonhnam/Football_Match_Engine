export interface OrderedLogit { t1: number; t2: number; b: number }
export function fitOrderedLogit(samples: { g: number; res: number }[]): OrderedLogit;
export function outcomeProbs(fit: OrderedLogit, gap: number): [number, number, number];
export function spreadOfD(fit: OrderedLogit, gaps: number[]): { meanD: number; sdD: number };
