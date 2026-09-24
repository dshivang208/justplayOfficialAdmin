/**
 * Mock data for Coupon/Discount Management. Shapes mirror the future API
 * contract (`GET /admin/coupons`, `POST /admin/coupons`) so swapping this
 * for a real fetch later is a one-file change.
 */

export type DiscountType = "flat" | "percentage";

export type Coupon = {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  usageLimit: number;
  usedCount: number;
  expiryDate: string;
  applicableVenues: "all" | string[];
};

export const coupons: Coupon[] = [
  {
    id: "cpn-001",
    code: "WELCOME100",
    type: "flat",
    value: 100,
    usageLimit: 500,
    usedCount: 312,
    expiryDate: "2026-12-31",
    applicableVenues: "all",
  },
  {
    id: "cpn-002",
    code: "MONSOON20",
    type: "percentage",
    value: 20,
    usageLimit: 200,
    usedCount: 187,
    expiryDate: "2026-09-15",
    applicableVenues: "all",
  },
  {
    id: "cpn-003",
    code: "GREENFIELD10",
    type: "percentage",
    value: 10,
    usageLimit: 100,
    usedCount: 44,
    expiryDate: "2026-10-01",
    applicableVenues: ["ven-001", "ven-006"],
  },
  {
    id: "cpn-004",
    code: "SUMMER50",
    type: "flat",
    value: 50,
    usageLimit: 300,
    usedCount: 300,
    expiryDate: "2026-07-31",
    applicableVenues: "all",
  },
  {
    id: "cpn-005",
    code: "TENNISCLUB15",
    type: "percentage",
    value: 15,
    usageLimit: 80,
    usedCount: 12,
    expiryDate: "2026-11-30",
    applicableVenues: ["ven-005"],
  },
];

export type CouponStatus = "active" | "expired" | "exhausted";

export function couponStatus(coupon: Coupon, today = new Date("2026-08-31")): CouponStatus {
  if (coupon.usedCount >= coupon.usageLimit) return "exhausted";
  if (new Date(coupon.expiryDate) < today) return "expired";
  return "active";
}
