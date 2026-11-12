import { describe, it } from 'vitest';

// Statistical checks simulate hundreds of matches.
const quick = !!process.env.QUICK_TESTS;
export const describeStatistical = quick ? describe.skip : describe;
export const itStatistical = quick ? it.skip : it;
