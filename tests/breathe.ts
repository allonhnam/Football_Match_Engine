/** Hand control back to the event loop for a moment. Long tests call this between simulated matches so the test
 * worker can answer Vitest's own messages; a test that keeps the worker busy for over a minute without a break
 * otherwise fails the run with "Timeout calling onTaskUpdate", even when every assertion passes. */
export const breathe = () => new Promise<void>(resolve => setTimeout(resolve, 0));
