/**
 * Real Supabase-backed coupon queries for Backend Phase E, replacing
 * src/data/coupons.ts (mock).
 *
 * The checkout-side half of this (validate_and_apply_coupon,
 * bookings.coupon_code/discount_amount, create_booking accepting a
 * coupon code) lives in the Phase E migration — this file is just the
 * admin management side: create/list/delete.
 */
import { supabase } from "@/lib/supabaseClient";

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

export type CouponStatus = "active" | "expired" | "exhausted";

export function couponStatus(coupon: Coupon, today = new Date()): CouponStatus {
  if (coupon.usedCount >= coupon.usageLimit) return "exhausted";
  if (new Date(coupon.expiryDate) < today) return "expired";
  return "active";
}

type CouponRow = {
  id: string;
  code: string;
  discount_type: DiscountType;
  value: number;
  usage_limit: number;
  times_used: number;
  expiry_date: string;
  applicable_venues: "all" | string[] | null;
};

function mapCouponRow(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    type: row.discount_type,
    value: row.value,
    usageLimit: row.usage_limit,
    usedCount: row.times_used,
    expiryDate: row.expiry_date,
    applicableVenues: row.applicable_venues === "all" || row.applicable_venues === null
      ? "all"
      : row.applicable_venues,
  };
}

export async function listCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from("coupons")
    .select("id, code, discount_type, value, usage_limit, times_used, expiry_date, applicable_venues")
    .order("created_at", { ascending: false })
    .returns<CouponRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCouponRow);
}

export async function createCoupon(input: {
  code: string;
  type: DiscountType;
  value: number;
  usageLimit: number;
  expiryDate: string;
  applicableVenues: "all" | string[];
}) {
  const { data, error } = await supabase.rpc("admin_create_coupon", {
    p_code: input.code,
    p_discount_type: input.type,
    p_value: input.value,
    p_usage_limit: input.usageLimit,
    p_expiry_date: input.expiryDate,
    p_applicable_venues: input.applicableVenues,
  });
  if (error) throw new Error(error.message);
  return mapCouponRow(data as CouponRow);
}

export async function deleteCoupon(id: string) {
  const { error } = await supabase.rpc("admin_delete_coupon", { p_coupon_id: id });
  if (error) throw new Error(error.message);
}