import { afterEach } from 'vitest';

// Many tests simulate hundreds of matches in one synchronous run. Between tests, hand control back to the event
// loop for a moment so the worker can answer Vitest's own messages; without this, a file of long tests on a slow
// CI runner can hit Vitest's 60-second RPC timeout ("Timeout calling onTaskUpdate") even though every test passes.
afterEach(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
