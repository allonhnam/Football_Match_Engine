// Pause briefly so a long test does not block the test runner.
export const breathe = () => new Promise<void>(resolve => setTimeout(resolve, 0));
