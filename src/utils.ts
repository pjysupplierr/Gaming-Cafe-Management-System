import { PACKAGES, TIER_META, type PayMethod, type Session, type Tier } from "./types";

let counter = 0;
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(
    Math.random() * 1e4
  ).toString(36)}`;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function moneyShort(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

/** elapsed milliseconds of a session at a given clock time.
 *  For settled sessions accumulatedMs already includes the final segment. */
export function elapsedMs(s: Session, now: number): number {
  if (s.status === "paused" || s.status === "settled") return s.accumulatedMs;
  return s.accumulatedMs + Math.max(0, now - s.resumedAt);
}

export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function fmtDateFull(ts: number): string {
  return new Date(ts).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function timeAgo(ts: number, now: number): string {
  const d = Math.max(0, now - ts);
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function isToday(ts: number, now: number): boolean {
  const a = new Date(ts);
  const b = new Date(now);
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/* ---------------- billing ---------------- */

export function tierDiscount(tier: Tier): number {
  return TIER_META[tier].disc;
}

/** prepaid price of a package on a device with a given hourly rate */
export function packagePrice(rate: number, pkgId: string, tier: Tier): number {
  const pkg = PACKAGES.find((p) => p.id === pkgId)!;
  return round2(rate * pkg.hours * (1 - pkg.disc) * (1 - tierDiscount(tier)));
}

/** pay-as-you-go charge, rounded up to 15-minute blocks */
export function paygCharge(rate: number, ms: number, tier: Tier): number {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  const blocks = Math.ceil(mins / 15);
  return round2((blocks * 15 / 60) * rate * (1 - tierDiscount(tier)));
}

export const METHOD_LABEL: Record<PayMethod, string> = {
  cash: "Cash",
  card: "Card",
  wallet: "Wallet",
};

/* ---------------- csv export ---------------- */

export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- deterministic rng (for seed data) ---------------- */

export function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
