import { describe, it } from 'vitest';

// Statistical checks simulate hundreds of matches. The engine is deterministic plain JavaScript, so they give the
// same answer on every operating system: CI runs them once, on Linux, and sets QUICK_TESTS on Windows and macOS,
// where the quick correctness tests (laws, determinism, save and load, fuzzing, the pitch view) still run.
const quick = !!process.env.QUICK_TESTS;
export const describeStatistical = quick ? describe.skip : describe;
export const itStatistical = quick ? it.skip : it;
