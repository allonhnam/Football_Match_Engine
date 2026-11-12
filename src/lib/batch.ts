import { simulateMatch } from '@/engine/engine';
import { summarise } from '@/lib/summarise';

// One pool of Web Workers for the whole page, started on first use and kept for later batches: starting workers costs more than a small batch (a season's matchday is 10 matches), so each batch reuses them.
let pool: Worker[] | null = null, lastBatch = 0;
// Start the pool of Web Workers that simulate matches, once.
function workers(): Worker[] {
  if (!pool) {
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 2) - 1));
    pool = Array.from({ length: n }, () => new Worker(new URL('./batch.worker.ts', import.meta.url)));
  }
  return pool;
}
// Stop and discard the worker pool.
function dropPool() { pool?.forEach(w => w.terminate()); pool = null; }

// Simulate many matches in the worker pool and return one summary per job, in order.
export async function runBatch(jobs: any[], onProgress?: (fraction: number) => void): Promise<any[]> {
  const results: any[] = new Array(jobs.length);
  let done = 0;
  try {
    if (typeof Worker === 'undefined') throw new Error('no workers');
    const all = workers(), use = all.slice(0, Math.max(1, Math.min(all.length, jobs.length))), batch = ++lastBatch;
    await Promise.all(use.map((worker, w) => new Promise<void>((resolve, reject) => {
      const mine: { i: number; cfg: any }[] = [];
      for (let i = w; i < jobs.length; i += use.length) mine.push({ i, cfg: jobs[i] });
      const stop = () => { worker.removeEventListener('message', onMessage); worker.removeEventListener('error', onError); };
      const onMessage = (e: MessageEvent) => {
        if (e.data.batch !== batch) return;
        if (e.data.one) { results[e.data.i] = e.data.one; done++; onProgress?.(done / jobs.length); }
        if (e.data.end) { stop(); resolve(); }
      };
      const onError = (err: ErrorEvent) => { stop(); reject(err); };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage({ batch, jobs: mine });
    })));
    return results;
  } catch {
    dropPool();
    for (let i = 0; i < jobs.length; i++) {
      if (results[i]) continue;
      results[i] = summarise(simulateMatch(jobs[i]));
      onProgress?.((i + 1) / jobs.length);
      if (i % 2) await new Promise(r => setTimeout(r, 0));
    }
    return results;
  }
}
