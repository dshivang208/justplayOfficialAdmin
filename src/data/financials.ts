/**
 * Mock data for the Financial Summary. Shapes mirror the future API
 * contract (`GET /admin/finance/summary?days=N`) so swapping this for a
 * real fetch later is a one-file change.
 */

export type FinancialPoint = {
  date: string;
  gmv: number;
  commission: number;
  payouts: number;
};

const AVG_COMMISSION_RATE = 0.12;

function isoOffset(daysAgo: number) {
  const d = new Date("2026-08-31");
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function seededWave(i: number, base: number, amplitude: number, offsetDays: number) {
  const wave = Math.sin(i / 4.1) * amplitude + Math.sin(i / 9) * (amplitude / 2);
  const weekday = new Date(isoOffset(offsetDays - 1 - i)).getDay();
  const weekendBoost = weekday === 0 || weekday === 6 ? amplitude * 0.5 : 0;
  return Math.max(2000, Math.round(base + wave + weekendBoost));
}

/** 90 days of daily GMV/commission/payouts, most-recent-last. */
export const financialSeries: FinancialPoint[] = Array.from({ length: 90 }, (_, i) => {
  const gmv = seededWave(i, 22000, 6000, 90);
  const commission = Math.round(gmv * AVG_COMMISSION_RATE);
  // Payouts lag GMV by a couple of days and net out the commission.
  const payouts = Math.round(gmv * (1 - AVG_COMMISSION_RATE) * (0.92 + (i % 5) * 0.015));
  return { date: isoOffset(89 - i), gmv, commission, payouts };
});

export function seriesForRange(days: 7 | 30 | 90) {
  return financialSeries.slice(-days);
}

export function summaryForRange(days: 7 | 30 | 90) {
  const slice = seriesForRange(days);
  const gmv = slice.reduce((sum, p) => sum + p.gmv, 0);
  const commission = slice.reduce((sum, p) => sum + p.commission, 0);
  const payoutsMade = slice.reduce((sum, p) => sum + p.payouts, 0);
  const netRevenue = commission - Math.round(commission * 0.08); // minus refunds/credits/gateway fees
  return { gmv, commission, payoutsMade, netRevenue };
}
