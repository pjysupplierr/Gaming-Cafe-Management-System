import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  LayoutDashboard,
  Menu,
  Monitor,
  Moon,
  Receipt,
  RotateCcw,
  Sun,
  Timer,
  Users,
  X,
} from "lucide-react";
import { useStore } from "./store";
import type { View } from "./types";
import { fmtTime, money } from "./utils";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 shadow-lg shadow-brand-600/40">
        <svg viewBox="0 0 32 32" className="h-5 w-5">
          <path d="M17.5 4 7.5 18h6.2l-1.7 10 10.5-14.5h-6.3L17.5 4z" fill="white" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-none">
          <p className="font-display text-[17px] font-bold tracking-tight text-white">BlueShift</p>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.22em] text-brand-300/80 uppercase">
            Ops Console
          </p>
        </div>
      )}
    </div>
  );
}

const NAV: { view: View; label: string; icon: typeof Monitor }[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "sessions", label: "Sessions", icon: Timer },
  { view: "devices", label: "Devices", icon: Monitor },
  { view: "users", label: "Members", icon: Users },
  { view: "billing", label: "Billing", icon: Receipt },
  { view: "reports", label: "Reports", icon: BarChart3 },
];

export function Sidebar({
  view,
  setView,
  mobileOpen,
  closeMobile,
}: {
  view: View;
  setView: (v: View) => void;
  mobileOpen: boolean;
  closeMobile: () => void;
}) {
  const { state, now, resetDemo, alerts } = useStore();
  const inUse = state.devices.filter((d) => d.status === "in_use").length;
  const online = state.devices.filter((d) => d.status !== "offline").length;
  const occ = online === 0 ? 0 : Math.round((inUse / online) * 100);
  const liveSessions = state.sessions.filter((s) => s.status !== "settled").length;

  return (
    <>
      {mobileOpen && (
        <div className="fade-in fixed inset-0 z-40 bg-ink-950/60 lg:hidden" onClick={closeMobile} />
      )}
      <aside
        className={`fixed top-0 left-0 z-50 flex h-full w-60 flex-col bg-ink-900 transition-transform duration-300 lg:translate-x-0 dark:bg-ink-900 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(37,99,235,0.10), transparent 40%), radial-gradient(circle at 0% 100%, rgba(37,99,235,0.12), transparent 55%)",
        }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-6">
          <Logo />
          <button
            className="rounded-md p-1.5 text-slate-400 hover:text-white lg:hidden"
            onClick={closeMobile}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => {
            const active = view === n.view;
            const count = n.view === "sessions" ? liveSessions : 0;
            const alertCount = n.view === "dashboard" ? alerts.filter((a) => a.sev !== "info").length : 0;
            return (
              <button
                key={n.view}
                onClick={() => {
                  setView(n.view);
                  closeMobile();
                }}
                className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? "bg-brand-600/15 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                }`}
              >
                {active && (
                  <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-500" />
                )}
                <n.icon
                  className={`h-[18px] w-[18px] transition-colors ${
                    active ? "text-brand-400" : "text-slate-500 group-hover:text-slate-300"
                  }`}
                />
                {n.label}
                {count > 0 && (
                  <span className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-600/25 px-2 py-0.5 font-mono text-[11px] font-semibold text-brand-300">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-brand-400" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-400" />
                    </span>
                    {count}
                  </span>
                )}
                {alertCount > 0 && (
                  <span className="ml-auto rounded-full bg-rose-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-300">
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mx-3 mb-3 rounded-lg border border-white/8 bg-white/[0.04] p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            <span>Floor occupancy</span>
            <span className="font-mono text-brand-300">{occ}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-700"
              style={{ width: `${occ}%` }}
            />
          </div>
          <p className="mt-2 font-mono text-[11px] text-slate-500">
            {inUse}/{online} stations in use
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-white/8 px-5 py-3.5">
          <span className="font-mono text-[10px] text-slate-600">v2.4.1 · {fmtTime(now)}</span>
          <button
            onClick={resetDemo}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
            title="Restore fresh demo data"
          >
            <RotateCcw className="h-3 w-3" /> Reset demo
          </button>
        </div>
      </aside>
    </>
  );
}

export function Topbar({
  view,
  openMobile,
}: {
  view: View;
  openMobile: () => void;
}) {
  const { state, now, alerts, theme, toggleTheme, role, setRole, toast, isAdmin } = useStore();
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const titles: Record<View, { title: string; sub: string }> = {
    dashboard: { title: "Live Floor", sub: "Real-time overview of the café" },
    devices: { title: "Device Management", sub: `${state.devices.length} units across ${new Set(state.devices.map((d) => d.zone)).size} zones` },
    users: { title: "Members", sub: "Profiles, tiers & wallets" },
    sessions: { title: "Session Control", sub: "Start, pause, extend and settle play time" },
    billing: { title: "Billing & Payments", sub: "Every transaction, exportable" },
    reports: { title: "Reports & Analytics", sub: "Revenue trends and utilization" },
  };

  const d = new Date(now);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  const activeSessions = state.sessions.filter((s) => s.status !== "settled");
  const runningRevenue = activeSessions.reduce(
    (sum, s) => sum + (s.mode === "package" ? s.pkgPrice : 0),
    0
  );

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-mist-50/85 backdrop-blur-md dark:border-ink-700 dark:bg-ink-950/85">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button
          onClick={openMobile}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:text-brand-600 lg:hidden dark:border-ink-600 dark:bg-ink-800 dark:text-slate-300"
          aria-label="Open menu"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>

        <div className="min-w-0">
          <h1 className="font-display text-lg leading-tight font-bold tracking-tight text-slate-900 sm:text-xl dark:text-white">
            {titles[view].title}
          </h1>
          <p className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">
            {titles[view].sub}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 md:flex dark:border-ink-600 dark:bg-ink-800">
            <span className="relative flex h-2 w-2">
              <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-mono text-sm font-semibold text-slate-800 tabular dark:text-slate-100">
              {hh}
              <span className="blink-colon">:</span>
              {mm}
              <span className="text-slate-400">:{ss}</span>
            </span>
          </div>

          {/* role switch */}
          <div className="hidden items-center rounded-lg border border-slate-200 bg-white p-0.5 sm:flex dark:border-ink-600 dark:bg-ink-800">
            {(["admin", "staff"] as const).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setRole(r);
                  toast(
                    r === "admin" ? "Admin access granted — full controls enabled." : "Staff mode — destructive actions locked.",
                    "info"
                  );
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition ${
                  role === r
                    ? r === "admin"
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-slate-700 text-white shadow-sm dark:bg-ink-600"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* notifications */}
          <div className="relative" ref={bellRef}>
            <button
              onClick={() => setBellOpen((o) => !o)}
              className={`relative rounded-lg border p-2 transition ${
                bellOpen
                  ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300"
                  : "border-slate-200 bg-white text-slate-600 hover:text-brand-600 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-300"
              }`}
              aria-label="Notifications"
            >
              <Bell className="h-4.5 w-4.5" />
              {alerts.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 font-mono text-[10px] font-bold text-white">
                  {alerts.length}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="pop-in absolute right-0 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-ink-600 dark:bg-ink-850">
                <div className="border-b border-slate-100 px-4 py-3 dark:border-ink-700">
                  <p className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    Notifications
                  </p>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {alerts.length === 0 && (
                    <p className="px-4 py-6 text-center text-sm text-slate-400">
                      All quiet on the floor. ✓
                    </p>
                  )}
                  {alerts.map((a) => (
                    <div key={a.id} className="flex gap-3 border-b border-slate-100 px-4 py-3 last:border-0 dark:border-ink-700/60">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          a.sev === "danger" ? "bg-rose-500" : a.sev === "warn" ? "bg-amber-500" : "bg-brand-500"
                        }`}
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{a.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{a.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 dark:border-ink-700 dark:bg-ink-900/60">
                  <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                    In play right now · {activeSessions.length} sessions · {money(runningRevenue)} committed
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* theme */}
          <button
            onClick={toggleTheme}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:text-brand-600 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-300 dark:hover:text-brand-300"
            aria-label="Toggle dark mode"
          >
            {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </button>

          {/* operator */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-brand-500/40 bg-brand-600/10 font-display text-xs font-bold text-brand-700 dark:text-brand-300">
              {isAdmin ? "AD" : "ST"}
            </div>
            <div className="hidden leading-tight xl:block">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {isAdmin ? "Nadia Reyes" : "Omar Petit"}
              </p>
              <p className="text-[11px] text-slate-400 capitalize">{role} · Front desk</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
