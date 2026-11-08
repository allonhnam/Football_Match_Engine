import { simulateMatch } from '@/engine/engine';
import { summarise } from '@/lib/summarise';

// Receives { jobs: [{ i, cfg }] } and replies with one summary per job, then { end: true }.
self.onmessage = (ev: MessageEvent) => {
  const { jobs } = ev.data;
  for (const job of jobs) {
    (self as any).postMessage({ i: job.i, one: summarise(simulateMatch(job.cfg)) });
  }
  (self as any).postMessage({ end: true });
};
