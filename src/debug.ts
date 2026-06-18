export const debugEnabled = (): boolean => Boolean(process.env.DEBUG);

export const debugLog = (...args: unknown[]): void => {
  if (debugEnabled()) console.error('[scs]', ...args);
};
