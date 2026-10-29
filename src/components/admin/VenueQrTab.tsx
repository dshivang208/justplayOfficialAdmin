import { useEffect, useState } from "react";
import { VenueQrCard, type QrStats } from "./VenueQrCard";
import { supabase } from "@/lib/supabaseClient";

/** Admin view of a venue's QR (poster download + scan counts). */
export function VenueQrTab({ venueId, venueName }: { venueId: string; venueName: string }) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [stats, setStats] = useState<QrStats>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      // Best-effort: before the qr_entry migration runs, the column/function don't exist yet.
      const { data } = await supabase.from("venues").select("qr_code").eq("id", venueId).maybeSingle();
      const { data: all } = await supabase.rpc("admin_qr_stats");
      if (!active) return;
      setQrCode((data as { qr_code?: string | null } | null)?.qr_code ?? null);
      const row = (all as { venue_id: string | null; total: number; last_30d: number }[] | null)?.find(
        (r) => r.venue_id === venueId,
      );
      setStats(row ? { total: Number(row.total), last7d: 0, last30d: Number(row.last_30d) } : { total: 0, last7d: 0, last30d: 0 });
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [venueId]);

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return <VenueQrCard venueName={venueName} qrCode={qrCode} stats={stats} />;
}
