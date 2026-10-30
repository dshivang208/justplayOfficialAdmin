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

// Website palette (src/styles.css, converted from oklch): pitch green + warm ochre on warm off-white.
const C = {
  green: "#108846",
  greenDeep: "#074a24",
  greenDarkest: "#012a14",
  greenLight: "#4dbf74",
  tint: "#e2f6e6",
  ochre: "#d4822b",
  ochreLight: "#f4c48d",
  ink: "#0c121a",
  bg: "#fcfcf9",
  muted: "#5d646e",
  border: "#dfe1e5",
};
const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';
const SANS = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** The website's own fonts, so the poster matches it. Falls back silently if offline. */
async function ensureFonts() {
  try {
    if (!document.getElementById("jp-poster-fonts")) {
      const l = document.createElement("link");
      l.id = "jp-poster-fonts";
      l.rel = "stylesheet";
      l.href =
        "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap";
      document.head.appendChild(l);
    }
    await Promise.race([
      Promise.all([
        document.fonts.load('700 80px "Playfair Display"'),
        document.fonts.load('italic 600 40px "Playfair Display"'),
        document.fonts.load('800 40px "Plus Jakarta Sans"'),
        document.fonts.load('600 30px "Plus Jakarta Sans"'),
      ]),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch {
    /* keep fallbacks */
  }
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1]!;
    while (last.length > 1 && g.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

/** Faint pitch markings behind the headline. */
function drawCourt(g: CanvasRenderingContext2D, W: number, H: number) {
  g.save();
  g.strokeStyle = "rgba(255,255,255,0.09)";
  g.lineWidth = 5;
  // centre circle + halfway line
  g.beginPath();
  g.arc(W * 0.86, H * 0.5, 190, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(W * 0.86, 0);
  g.lineTo(W * 0.86, H);
  g.stroke();
  // penalty box
  rr(g, -60, H * 0.18, 300, H * 0.64, 6);
  g.stroke();
  rr(g, -60, H * 0.34, 130, H * 0.32, 6);
  g.stroke();
  g.restore();
}

export async function makePoster(opts: { title: string; tagline: string; url: string; level?: 1 | 2 }): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const W = 1080;
  const H = 1740;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";

  // page
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);

  // ── hero (deep pitch green, with pitch markings) ──────────────────────────
  const HERO_H = 820;
  const hero = g.createLinearGradient(0, 0, W, HERO_H);
  hero.addColorStop(0, C.greenDarkest);
  hero.addColorStop(0.55, C.greenDeep);
  hero.addColorStop(1, C.green);
  g.save();
  rr(g, 0, 0, W, HERO_H, 0);
  g.clip();
  g.fillStyle = hero;
  g.fillRect(0, 0, W, HERO_H);
  drawCourt(g, W, HERO_H);
  // warm glow, top-right
  const glow = g.createRadialGradient(W * 0.95, 40, 10, W * 0.95, 40, 520);
  glow.addColorStop(0, "rgba(244,196,141,0.20)");
  glow.addColorStop(1, "rgba(212,130,43,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, HERO_H);
  g.restore();
  // ochre accent edge
  g.fillStyle = C.ochre;
  g.fillRect(0, HERO_H - 8, W, 8);

  // brand row: logo mark + wordmark, city pill
  const lx = 76;
  const ly = 78;
  const mark = g.createLinearGradient(lx, ly, lx + 84, ly + 84);
  mark.addColorStop(0, C.greenLight);
  mark.addColorStop(1, C.green);
  g.fillStyle = mark;
  rr(g, lx, ly, 84, 84, 24);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = `700 58px ${SERIF}`;
  g.textAlign = "center";
  g.fillText("J", lx + 42, ly + 62);
  g.textAlign = "left";
  g.font = `700 54px ${SERIF}`;
  g.fillText("JustPlay", lx + 108, ly + 60);

  g.font = `800 24px ${SANS}`;
  const pill = "KANPUR";
  const pw = g.measureText(pill).width + 52;
  g.fillStyle = C.ochre;
  rr(g, W - 76 - pw, ly + 16, pw, 52, 26);
  g.fill();
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.fillText(pill, W - 76 - pw / 2, ly + 51);

  // headline
  g.fillStyle = C.ochreLight;
  g.font = `800 26px ${SANS}`;
  g.textAlign = "left";
  g.fillText(opts.level === 1 ? "BOOK SPORTS VENUES" : "BOOK YOUR SLOT AT", 76, 262);

  g.fillStyle = "#ffffff";
  // Largest headline size whose lines + tagline still clear the QR card below.
  const cardTop = HERO_H - 150;
  const top = 262 + 30;
  let size = 96;
  let lines: string[] = [];
  for (; size >= 52; size -= 4) {
    g.font = `700 ${size}px ${SERIF}`;
    lines = wrap(g, opts.title, W - 152, 3);
    const end = top + size * 0.85 + (lines.length - 1) * size * 1.12;
    if (lines.every((l) => g.measureText(l).width <= W - 152) && end + 78 <= cardTop - 24) break;
  }
  size = Math.max(size, 52);
  g.font = `700 ${size}px ${SERIF}`;
  const lh = size * 1.12;
  lines.forEach((l, i) => g.fillText(l, 76, top + size * 0.85 + i * lh));
  const headEnd = top + size * 0.85 + (lines.length - 1) * lh;

  g.fillStyle = C.tint;
  g.font = `italic 600 44px ${SERIF}`;
  g.fillText(opts.tagline, 76, headEnd + 70);

  // ── QR card overlapping the hero ──────────────────────────────────────────
  const CARD_W = 660;
  const CARD_H = 750;
  const cx = (W - CARD_W) / 2;
  const cy = HERO_H - 150;
  g.save();
  g.shadowColor = "rgba(12,18,26,0.28)";
  g.shadowBlur = 56;
  g.shadowOffsetY = 26;
  g.fillStyle = "#ffffff";
  rr(g, cx, cy, CARD_W, CARD_H, 48);
  g.fill();
  g.restore();
  g.strokeStyle = C.border;
  g.lineWidth = 2;
  rr(g, cx, cy, CARD_W, CARD_H, 48);
  g.stroke();

  const qrSize = 520;
  const qx = (W - qrSize) / 2;
  const qy = cy + 52;
  const dataUrl = await QRCode.toDataURL(opts.url, {
    width: qrSize,
    margin: 0,
    errorCorrectionLevel: "H",
    color: { dark: C.ink, light: "#ffffff" },
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  g.drawImage(img, qx, qy, qrSize, qrSize);

  // centre logo (small enough for error-correction level H)
  const lg = 92;
  g.fillStyle = "#ffffff";
  rr(g, W / 2 - lg / 2 - 10, qy + qrSize / 2 - lg / 2 - 10, lg + 20, lg + 20, 30);
  g.fill();
  const lgrad = g.createLinearGradient(W / 2 - lg / 2, qy + qrSize / 2 - lg / 2, W / 2 + lg / 2, qy + qrSize / 2 + lg / 2);
  lgrad.addColorStop(0, C.greenLight);
  lgrad.addColorStop(1, C.green);
  g.fillStyle = lgrad;
  rr(g, W / 2 - lg / 2, qy + qrSize / 2 - lg / 2, lg, lg, 24);
  g.fill();
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.font = `700 66px ${SERIF}`;
  g.fillText("J", W / 2, qy + qrSize / 2 + 23);

  // green scan-frame corners
  g.strokeStyle = C.green;
  g.lineWidth = 12;
  g.lineCap = "round";
  const f = 26;
  const L = 74;
  const x0 = qx - f;
  const y0 = qy - f;
  const x1 = qx + qrSize + f;
  const y1 = qy + qrSize + f;
  for (const [px, py, dx, dy] of [
    [x0, y0, 1, 1],
    [x1, y0, -1, 1],
    [x0, y1, 1, -1],
    [x1, y1, -1, -1],
  ] as const) {
    g.beginPath();
    g.moveTo(px + dx * L, py);
    g.lineTo(px, py);
    g.lineTo(px, py + dy * L);
    g.stroke();
  }

  // CTA pill under the QR (sits on the card)
  const ctaY = qy + qrSize + 70;
  const cta = g.createLinearGradient(cx + 60, ctaY, cx + CARD_W - 60, ctaY);
  cta.addColorStop(0, C.green);
  cta.addColorStop(1, C.ochre);
  g.fillStyle = cta;
  rr(g, cx + 70, ctaY, CARD_W - 140, 76, 38);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = `800 32px ${SANS}`;
  g.textAlign = "center";
  g.fillText(opts.level === 1 ? "Scan to open JustPlay" : "Scan to book your slot", W / 2, ctaY + 49);

  // ── steps ─────────────────────────────────────────────────────────────────
  const stepsY = cy + CARD_H + 78;
  const steps = ["Scan", "Pick a slot", "Play"];
  const gap = 300;
  steps.forEach((t, i) => {
    const sx = W / 2 + (i - 1) * gap;
    g.fillStyle = C.tint;
    g.beginPath();
    g.arc(sx, stepsY, 34, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = C.green;
    g.font = `800 32px ${SANS}`;
    g.fillText(String(i + 1), sx, stepsY + 11);
    g.fillStyle = C.ink;
    g.font = `700 28px ${SANS}`;
    g.fillText(t, sx, stepsY + 76);
    if (i < steps.length - 1) {
      g.strokeStyle = C.border;
      g.setLineDash([10, 10]);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sx + 56, stepsY);
      g.lineTo(sx + gap - 56, stepsY);
      g.stroke();
      g.setLineDash([]);
    }
  });

  // ── footer ────────────────────────────────────────────────────────────────
  g.fillStyle = C.muted;
  g.font = `600 27px ${SANS}`;
  g.fillText(opts.url.replace(/^https?:\/\//, ""), W / 2, H - 78);
  g.fillStyle = C.ochre;
  g.fillRect(W / 2 - 36, H - 56, 72, 5);
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
        level,
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
