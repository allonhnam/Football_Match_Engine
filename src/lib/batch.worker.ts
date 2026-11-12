import { simulateMatch } from '@/engine/engine';
import { summarise } from '@/lib/summarise';

// Simulate each job in a batch and reply with its summary.
self.onmessage = (ev: MessageEvent) => {
  const { batch, jobs } = ev.data;
  for (const job of jobs) {
    (self as any).postMessage({ batch, i: job.i, one: summarise(simulateMatch(job.cfg)) });
  }
  (self as any).postMessage({ batch, end: true });
};
