/** Give brief API restarts or connection blips time to recover before showing an error. */
export const adminQueryRecovery = {
  retry: 2,
  retryDelay: (attempt: number) => Math.min(1_000 * 2 ** attempt, 4_000),
} as const;
