import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

/**
 * Two-level QR entry for JustPlay.
 *   Level 1 — Website QR : <site>/q          -> opens the JustPlay website
 *   Level 2 — Venue QR   : <site>/q/<code>   -> opens THIS venue's page directly
 * Prints/downloads as a poster ("Scan to book your slot") for the venue's entrance,
 * court boards and social posts. Same file is used by the Partner and Admin apps.
 */

const SITE_KEY = "justplay.consumerSiteUrl";

function normalizeSite(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.origin;
  } catch {
    return "";
  }
}

const envSite = normalizeSite((import.meta.env["VITE_CONSUMER_URL"] as string | undefined) ?? "");

function initialSite(): string {
  if (envSite) return envSite;
  try {
    return normalizeSite(localStorage.getItem(SITE_KEY) ?? "");
  } catch {
    return "";
  }
}

export type QrStats = { total: number; last7d: number; last30d: number } | null;

type Props = {
  venueName: string;
  /** venues.qr_code — null while the QR migration hasn't been applied. */
  qrCode: string | null;
  stats?: QrStats;
};

export async function makePoster(opts: { title: string; tagline: string; url: string }): Promise<HTMLCanvasElement> {
  const W = 1080;
  const H = 1560;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);

  // header band
  g.fillStyle = "#0b1220";
  g.fillRect(0, 0, W, 250);
  g.fillStyle = "#22c55e";
  g.fillRect(0, 250, W, 12);
  g.fillStyle = "#ffffff";
  g.font = "800 84px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  g.textAlign = "center";
  g.fillText("JustPlay", W / 2, 150);
  g.font = "500 32px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  g.fillStyle = "#9fb0c8";
  g.fillText("Book sports venues in Kanpur", W / 2, 205);

  // title
  g.fillStyle = "#0b1220";
  g.font = "800 64px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const words = opts.title.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > W - 160 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 2);
  shown.forEach((l, i) => g.fillText(l, W / 2, 360 + i * 76));
  const afterTitle = 360 + shown.length * 76;

  g.font = "600 42px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  g.fillStyle = "#16a34a";
  g.fillText(opts.tagline, W / 2, afterTitle + 30);

  // QR
  const qrSize = 640;
  const dataUrl = await QRCode.toDataURL(opts.url, { width: qrSize, margin: 1, errorCorrectionLevel: "M" });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const qy = afterTitle + 105;
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#0b1220";
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect((W - qrSize) / 2 - 32, qy - 32, qrSize + 64, qrSize + 64, 36);
  g.fill();
  g.stroke();
  g.drawImage(img, (W - qrSize) / 2, qy, qrSize, qrSize);

  g.fillStyle = "#0b1220";
  g.font = "700 46px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  g.fillText("Scan with your phone camera", W / 2, qy + qrSize + 110);
  g.font = "500 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  g.fillStyle = "#475569";
  const shortUrl = opts.url.replace(/^https?:\/\//, "");
  g.fillText(shortUrl, W / 2, qy + qrSize + 170);

  g.fillStyle = "#94a3b8";
  g.font = "500 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  g.fillText("Pick a slot · Pay online · Show up and play", W / 2, H - 50);
  return c;
}

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function VenueQrCard({ venueName, qrCode, stats }: Props) {
  const [site, setSite] = useState(initialSite);
  const [siteDraft, setSiteDraft] = useState("");
  const [level, setLevel] = useState<1 | 2>(2);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const url = useMemo(() => {
    if (!site) return "";
    if (level === 1) return `${site}/q`;
    return qrCode ? `${site}/q/${qrCode}` : "";
  }, [site, level, qrCode]);

  useEffect(() => {
    if (!url || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, url, { width: 220, margin: 1, errorCorrectionLevel: "M" });
  }, [url]);

  const saveSite = () => {
    const n = normalizeSite(siteDraft);
    if (!n) return;
    try {
      localStorage.setItem(SITE_KEY, n);
    } catch {
      /* private mode: just keep it in memory */
    }
    setSite(n);
  };

  const fileBase = `justplay-${level === 1 ? "website" : venueName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-qr`;

  const downloadPoster = async () => {
    if (!url) return;
    setBusy(true);
    try {
      const poster = await makePoster({
        title: level === 1 ? "Find & book sports venues" : venueName,
        tagline: level === 1 ? "Scan to open JustPlay" : "Scan to book your slot",
        url,
      });
      download(poster.toDataURL("image/png"), `${fileBase}-poster.png`);
    } finally {
      setBusy(false);
    }
  };

  const downloadQr = async () => {
    if (!url) return;
    download(await QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" }), `${fileBase}.png`);
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold text-foreground">QR codes</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Print these for the entrance, court boards or social posts. Players scan with their phone camera — no searching,
        no typing.
      </p>

      <div className="mt-4 inline-flex rounded-full border border-border p-1 text-sm font-semibold">
        {(
          [
            { v: 2, label: "Level 2 · This venue" },
            { v: 1, label: "Level 1 · Website" },
          ] as const
        ).map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setLevel(t.v)}
            className={
              "rounded-full px-4 py-1.5 transition-colors " +
              (level === t.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {level === 2
          ? "Opens this venue's page directly, ready to pick a slot and book."
          : "Opens the JustPlay website homepage."}
      </p>

      {!site ? (
        <div className="mt-4 rounded-xl bg-muted p-3 text-sm">
          <p className="font-medium text-foreground">Enter the consumer website address once</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            e.g. https://www.yourdomain.in (or set <code>VITE_CONSUMER_URL</code> in the app's environment).
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={siteDraft}
              onChange={(e) => setSiteDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveSite()}
              placeholder="https://www.yourdomain.in"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button type="button" onClick={saveSite} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Save
            </button>
          </div>
        </div>
      ) : level === 2 && !qrCode ? (
        <p className="mt-4 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          This venue doesn't have a QR code yet — run the <code>qr_entry</code> database migration, then refresh.
        </p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="rounded-2xl border border-border bg-white p-3">
            <canvas ref={canvasRef} width={220} height={220} aria-label="QR code" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="break-all rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{url}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={downloadPoster} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {busy ? "Preparing…" : "Download poster"}
              </button>
              <button type="button" onClick={downloadQr} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-primary">
                QR only (PNG)
              </button>
              <button type="button" onClick={copy} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-primary">
                {copied ? "Copied ✓" : "Copy link"}
              </button>
            </div>
            {!envSite ? (
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem(SITE_KEY);
                  } catch {
                    /* ignore */
                  }
                  setSiteDraft(site);
                  setSite("");
                }}
                className="text-xs text-muted-foreground underline"
              >
                Change website address
              </button>
            ) : null}
          </div>
        </div>
      )}

      {stats ? (
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
          {[
            { l: "Scans · 7 days", v: stats.last7d },
            { l: "Scans · 30 days", v: stats.last30d },
            { l: "All time", v: stats.total },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-2xl font-semibold text-foreground">{s.v.toLocaleString("en-IN")}</p>
              <p className="text-[11px] text-muted-foreground">{s.l}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
