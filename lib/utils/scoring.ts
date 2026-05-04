export function calculatePoints(
  responseTimeMs: number,
  timeLimitSecs: number
): number {
  const timeLimitMs = timeLimitSecs * 1000;
  const ratio = Math.max(0, 1 - responseTimeMs / timeLimitMs);
  return Math.round(500 + 500 * ratio);
}
