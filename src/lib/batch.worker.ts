import { simulateMatch } from '@/engine/engine';
import { summarise } from '@/lib/summarise';

// Receives { batch, jobs: [{ i, cfg }] } and replies with one summary per job, then { batch, end: true }. The worker
// stays alive between batches; `batch` tells the page which batch a reply belongs to.
self.onmessage = (ev: MessageEvent) => {
  const { batch, jobs } = ev.data;
  for (const job of jobs) {
    (self as any).postMessage({ batch, i: job.i, one: summarise(simulateMatch(job.cfg)) });
  }
  (self as any).postMessage({ batch, end: true });
};
