import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { ContentSectionTabs } from "@/components/admin/ContentSectionTabs";
import { Switch } from "@/components/ui/switch";
import { getSiteSettings, saveSiteSettings, type SiteSettingsForm } from "@/lib/admin-data/opsTools";

const input =
  "mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary";

export function SiteSettingsPage() {
  const [f, setF] = useState<SiteSettingsForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSiteSettings().then(setF).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load settings."));
  }, []);

  const set = <K extends keyof SiteSettingsForm>(k: K, v: SiteSettingsForm[K]) =>
    setF((p) => (p ? { ...p, [k]: v } : p));

  const save = async () => {
    if (!f) return;
    if (f.maintenanceMode && !window.confirm("Maintenance mode will show a 'We'll be right back' screen to ALL players. Turn it on?")) return;
    setSaving(true);
    try {
      await saveSiteSettings(f);
      toast.success("Settings saved — live within a few minutes");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">Content Management</h1>
        <div className="mt-4"><ContentSectionTabs /></div>

        {error ? (
          <p className="mt-6 text-sm font-medium text-destructive">{error}</p>
        ) : !f ? (
          <div className="mt-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="mt-6 grid max-w-3xl gap-5">
            <section className="surface-card rounded-xl p-5">
              <h2 className="text-lg font-semibold text-foreground">Support contact</h2>
              <p className="text-sm text-muted-foreground">Shown on the Contact Us page and the maintenance screen.</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold text-muted-foreground">Email
                  <input className={input} value={f.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} placeholder="support@yourdomain.com" />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">Phone
                  <input className={input} value={f.supportPhone} onChange={(e) => set("supportPhone", e.target.value)} placeholder="+91 …" />
                </label>
              </div>
            </section>

            <section className="surface-card rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Announcement bar</h2>
                  <p className="text-sm text-muted-foreground">A slim green bar at the top of every consumer page. Players can dismiss it.</p>
                </div>
                <Switch checked={f.announcementActive} onCheckedChange={(v) => set("announcementActive", v)} />
              </div>
              <div className="mt-3 grid gap-4">
                <label className="text-xs font-semibold text-muted-foreground">Text
                  <input className={input} maxLength={140} value={f.announcementText} onChange={(e) => set("announcementText", e.target.value)} placeholder="Weekend offer: 20% off all turfs — use code WEEKEND20" />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">Link (optional)
                  <input className={input} value={f.announcementUrl} onChange={(e) => set("announcementUrl", e.target.value)} placeholder="/venues or https://…" />
                </label>
              </div>
              {f.announcementText ? (
                <div className="mt-4 rounded-lg bg-gradient-to-r from-[#074a24] to-[#108846] px-4 py-2 text-center text-xs font-semibold text-white">
                  {f.announcementText}
                </div>
              ) : null}
            </section>

            <section className="surface-card rounded-xl border-destructive/30 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Maintenance mode</h2>
                  <p className="text-sm text-muted-foreground">
                    Shows a full-screen "We'll be right back" message in the consumer app. It hides the site UI; it does not stop the API, so use it for planned upgrades.
                  </p>
                </div>
                <Switch checked={f.maintenanceMode} onCheckedChange={(v) => set("maintenanceMode", v)} />
              </div>
              <label className="mt-3 block text-xs font-semibold text-muted-foreground">Message (optional)
                <input className={input} maxLength={200} value={f.maintenanceMessage} onChange={(e) => set("maintenanceMessage", e.target.value)} placeholder="Back by 6 PM — thanks for your patience!" />
              </label>
            </section>

            <div><Button onClick={() => void save()} disabled={saving}><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save settings"}</Button></div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
