/**
 * Referral & points program — admin side.
 *
 * Every call goes through SECURITY DEFINER RPCs that re-check the caller's
 * admin role in the database (see 20261024020000_referral_points.sql), so the
 * UI gating here is a convenience, not the security boundary.
 */
import { supabase } from "@/lib/supabaseClient";

export type ReferralSettings = {
  programEnabled: boolean;
  redemptionEnabled: boolean;
  referrerPoints: number;
  refereePoints: number;
  rewardTrigger: "signup" | "first_booking";
  minBookingAmount: number;
  pointValueInr: number;
  maxRedeemPercent: number;
  minRedeemPoints: number;
  maxRewardsPerReferrer: number;
  codeWindowDays: number;
  updatedAt: string | null;
};

type SettingsRow = {
  program_enabled: boolean;
  redemption_enabled: boolean;
  referrer_points: number;
  referee_points: number;
  reward_trigger: "signup" | "first_booking";
  min_booking_amount: number;
  point_value_inr: number | string;
  max_redeem_percent: number;
  min_redeem_points: number;
  max_rewards_per_referrer: number;
  code_window_days: number;
  updated_at: string | null;
};

function mapSettings(r: SettingsRow): ReferralSettings {
  return {
    programEnabled: r.program_enabled,
    redemptionEnabled: r.redemption_enabled,
    referrerPoints: r.referrer_points,
    refereePoints: r.referee_points,
    rewardTrigger: r.reward_trigger,
    minBookingAmount: r.min_booking_amount,
    pointValueInr: Number(r.point_value_inr),
    maxRedeemPercent: r.max_redeem_percent,
    minRedeemPoints: r.min_redeem_points,
    maxRewardsPerReferrer: r.max_rewards_per_referrer,
    codeWindowDays: r.code_window_days,
    updatedAt: r.updated_at,
  };
}

function friendly(message: string): string {
  if (message.includes("NOT_ALLOWED")) return "Only a Super Admin can do this.";
  if (message.includes("USER_NOT_FOUND")) return "No player found with that phone number.";
  if (message.includes("INSUFFICIENT_POINTS")) return "That would take the player's balance below zero.";
  if (message.includes("REASON_REQUIRED")) return "Add a short reason for the adjustment.";
  if (message.includes("INVALID_POINTS")) return "Enter a non-zero number of points.";
  if (message.includes("violates check constraint")) return "One of the values is out of its allowed range.";
  if (message.includes("Could not find the function"))
    return "Run the referral_points migration in Supabase first.";
  return message;
}

export async function getReferralSettings(): Promise<ReferralSettings> {
  const { data, error } = await supabase.rpc("admin_get_referral_settings");
  if (error) throw new Error(friendly(error.message));
  return mapSettings(data as SettingsRow);
}

export async function saveReferralSettings(s: ReferralSettings): Promise<ReferralSettings> {
  const { data, error } = await supabase.rpc("admin_update_referral_settings", {
    p: {
      program_enabled: s.programEnabled,
      redemption_enabled: s.redemptionEnabled,
      referrer_points: s.referrerPoints,
      referee_points: s.refereePoints,
      reward_trigger: s.rewardTrigger,
      min_booking_amount: s.minBookingAmount,
      point_value_inr: s.pointValueInr,
      max_redeem_percent: s.maxRedeemPercent,
      min_redeem_points: s.minRedeemPoints,
      max_rewards_per_referrer: s.maxRewardsPerReferrer,
      code_window_days: s.codeWindowDays,
    },
  });
  if (error) throw new Error(friendly(error.message));
  return mapSettings(data as SettingsRow);
}

export type ReferralOverview = {
  totalReferrals: number;
  pending: number;
  rewarded: number;
  pointsIssued: number;
  pointsRedeemed: number;
  pointsOutstanding: number;
  topReferrers: { name: string; phone: string; code: string; rewarded: number; invited: number; points: number }[];
};

export async function getReferralOverview(): Promise<ReferralOverview> {
  const { data, error } = await supabase.rpc("admin_referral_overview");
  if (error) throw new Error(friendly(error.message));
  return data as ReferralOverview;
}

export type ReferralRow = {
  id: string;
  status: "joined" | "invited" | "first_booking_complete";
  referrerPoints: number;
  refereePoints: number;
  code: string | null;
  createdAt: string;
  rewardedAt: string | null;
  referrerName: string;
  referrerPhone: string;
  refereeName: string | null;
  refereePhone: string | null;
};

export async function listReferrals(limit = 100): Promise<ReferralRow[]> {
  const { data, error } = await supabase.rpc("admin_list_referrals", { p_limit: limit });
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as ReferralRow[];
}

export async function adjustPoints(phone: string, points: number, reason: string) {
  const { data, error } = await supabase.rpc("admin_adjust_points", {
    p_phone: phone,
    p_points: points,
    p_reason: reason,
  });
  if (error) throw new Error(friendly(error.message));
  return data as { name: string; newBalance: number };
}

export { friendly as referralErrorMessage };
