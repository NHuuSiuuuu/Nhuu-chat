export const RETRY_DELAYS_MS = [0, 1_000, 4_000] as const;

export function retryDelay(attempt: number): number | null {
  return RETRY_DELAYS_MS[attempt] ?? null;
}
