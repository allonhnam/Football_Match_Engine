import { simulateMatch } from '@/engine/engine';
import { summarise } from '@/lib/summarise';

/**
 * Simulate many matches in a pool of Web Workers so the page stays responsive.
 * Falls back to the main thread if workers are unavailable.
 */
export async function runBatch(jobs: any[], onProgress?: (fraction: number) => void): Promise<any[]> {
  const results: any[] = new Array(jobs.length);
  let done = 0;
  try {
    if (typeof Worker === 'undefined') throw new Error('no workers');
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 2) - 1, jobs.length));
    await Promise.all(Array.from({ length: n }, (_, w) => new Promise<void>((resolve, reject) => {
      const worker = new Worker(new URL('./batch.worker.ts', import.meta.url));
      const mine: { i: number; cfg: any }[] = [];
      for (let i = w; i < jobs.length; i += n) mine.push({ i, cfg: jobs[i] });
      worker.onmessage = e => {
        if (e.data.one) { results[e.data.i] = e.data.one; done++; onProgress?.(done / jobs.length); }
        if (e.data.end) { worker.terminate(); resolve(); }
      };
      worker.onerror = err => { worker.terminate(); reject(err); };
      worker.postMessage({ jobs: mine });
    })));
    return results;
  } catch {
    for (let i = 0; i < jobs.length; i++) {
      if (results[i]) continue;
      results[i] = summarise(simulateMatch(jobs[i]));
      onProgress?.((i + 1) / jobs.length);
      if (i % 2) await new Promise(r => setTimeout(r, 0));
    }
    return results;
  }
}
