/** One stable colour per sport, so a sport looks the same in every chart and table. */
const PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "oklch(0.62 0.12 190)",
  "oklch(0.55 0.1 330)",
  "oklch(0.7 0.12 100)",
];

export function sportColor(sport: string, order: string[]): string {
  const i = order.indexOf(sport);
  if (i >= 0) return PALETTE[i % PALETTE.length]!;
  let h = 0;
  for (const c of sport) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}
