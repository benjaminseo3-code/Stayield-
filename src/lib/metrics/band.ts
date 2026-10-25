/**
 * Public teaser: an income band instead of the exact figure.
 * Steps: 5k below 100k, 10k up to 500k, 50k above. Amounts are minor units.
 */
export function incomeBand(minor: number): { low: number; high: number } {
  const major = Math.max(0, minor / 100);
  const step = major < 100_000 ? 5_000 : major < 500_000 ? 10_000 : 50_000;
  const low = Math.floor(major / step) * step;
  return { low: low * 100, high: (low + step) * 100 };
}
