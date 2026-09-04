import { useEffect, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Gamepad2, Glasses, Info, Monitor, X, Gauge } from "lucide-react";
import type { DeviceStatus, DeviceType } from "./types";
import { useStore } from "./store";
import { STATUS_META } from "./types";

/* ---------------- class recipes ---------------- */

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none dark:border-ink-600 dark:bg-ink-800 dark:text-slate-100 dark:placeholder:text-slate-500";

export const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

export const btnGhost =
  "inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-400 hover:text-brand-700 active:scale-[0.98] dark:border-ink-600 dark:bg-ink-800 dark:text-slate-200 dark:hover:border-brand-500 dark:hover:text-brand-300";

export const btnDanger =
  "inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 active:scale-[0.98] dark:border-rose-500/30 dark:bg-transparent dark:text-rose-400 dark:hover:bg-rose-500/10";

export const cardCls =
  "rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,30,60,0.06)] dark:border-ink-700 dark:bg-ink-850";

/* ---------------- modal ---------------- */

export function Modal({
  title,
  sub,
  onClose,
  children,
  wide,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="fade-in absolute inset-0 bg-ink-950/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`pop-in relative w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[88vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-ink-600 dark:bg-ink-850`}
        role="dialog"
        aria-modal="true"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200/70 bg-white/95 px-5 py-4 backdrop-blur dark:border-ink-700 dark:bg-ink-850/95">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h2>
            {sub && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-ink-700 dark:hover:text-slate-200"
            aria-label="Close dialog"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- toasts ---------------- */

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[70] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm shadow-lg backdrop-blur ${
            t.kind === "success"
              ? "border-emerald-200 bg-white/95 text-emerald-800 dark:border-emerald-500/30 dark:bg-ink-850/95 dark:text-emerald-300"
              : t.kind === "error"
                ? "border-rose-200 bg-white/95 text-rose-800 dark:border-rose-500/30 dark:bg-ink-850/95 dark:text-rose-300"
                : "border-slate-200 bg-white/95 text-slate-700 dark:border-ink-600 dark:bg-ink-850/95 dark:text-slate-300"
          }`}
        >
          {t.kind === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : t.kind === "error" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span className="flex-1 leading-snug font-medium">{t.msg}</span>
          <button
            onClick={() => dismissToast(t.id)}
            className="opacity-50 transition hover:opacity-100"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- small bits ---------------- */

const tones: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25",
  blue: "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:border-brand-500/25",
  amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25",
  red: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25",
  slate: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-ink-700 dark:text-slate-300 dark:border-ink-600",
};

export function Badge({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const statusTone: Record<DeviceStatus, keyof typeof tones> = {
  available: "green",
  in_use: "blue",
  maintenance: "amber",
  offline: "slate",
};

export function StatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <Badge tone={statusTone[status]}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "available"
            ? "bg-emerald-500"
            : status === "in_use"
              ? "bg-brand-500"
              : status === "maintenance"
                ? "bg-amber-500"
                : "bg-slate-400"
        }`}
      />
      {STATUS_META[status].label}
    </Badge>
  );
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-ink-600 dark:bg-ink-900 ${
        size === "sm" ? "text-xs" : "text-sm"
      }`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md font-medium transition-all ${
            size === "sm" ? "px-2.5 py-1" : "px-3 py-1.5"
          } ${
            value === o.value
              ? "bg-white text-brand-700 shadow-sm dark:bg-ink-700 dark:text-brand-300"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase dark:text-slate-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function EmptyState({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center dark:border-ink-600">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
        <Info className="h-5 w-5" />
      </div>
      <p className="font-display font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">{sub}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------- data viz ---------------- */

export function Sparkline({ data, className = "" }: { data: number[]; className?: string }) {
  const w = 120;
  const h = 36;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data
    .map(
      (v, i) =>
        `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / range) * (h - 6)).toFixed(1)}`
    )
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill="currentColor" opacity="0.12" stroke="none" />
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressRing({
  pct,
  size = 44,
  tone = "brand",
  label,
}: {
  pct: number;
  size?: number;
  tone?: "brand" | "amber" | "red";
  label?: ReactNode;
}) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  const color = tone === "red" ? "#f43f5e" : tone === "amber" ? "#f59e0b" : "#2563eb";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200 dark:text-ink-600" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      {label && <div className="absolute inset-0 flex items-center justify-center">{label}</div>}
    </div>
  );
}

/* ---------------- device icon ---------------- */

export function DeviceIcon({ type, className = "h-5 w-5" }: { type: DeviceType; className?: string }) {
  if (type === "pc") return <Monitor className={className} />;
  if (type === "console") return <Gamepad2 className={className} />;
  if (type === "vr") return <Glasses className={className} />;
  return <Gauge className={className} />;
}
