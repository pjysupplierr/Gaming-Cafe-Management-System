import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Gamepad2,
  Lock,
  Monitor,
  Pause,
  Play,
  Plus,
  Square,
  Trash2,
  Wallet as WalletIcon,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import { useStore } from "./store";
import type { Device, Session, View } from "./types";
import { DEVICE_META } from "./types";
import { elapsedMs, fmtClock, fmtDate, fmtDuration, fmtTime, isToday, money, timeAgo } from "./utils";
import { Badge, btnPrimary, cardCls, DeviceIcon, EmptyState, ProgressRing, StatusBadge } from "./ui";
import { ExtendModal, ReservationModal, SettleModal, StartSessionModal } from "./modals";

export function Dashboard({ setView }: { setView: (v: View) => void }) {
  const {
    state,
    now,
    alerts,
    pauseSession,
    resumeSession,
    startReservationSession,
    cancelReservation,
    deleteReservation,
    toast,
  } = useStore();
  const [startFor, setStartFor] = useState<string | null>(null);
  const [settleId, setSettleId] = useState<string | null>(null);
  const [extendId, setExtendId] = useState<string | null>(null);
  const [reserving, setReserving] = useState<{
    open: boolean;
    deviceId?: string;
    deviceType?: "pc" | "console";
  }>({ open: false });
  const [resFilter, setResFilter] = useState<"all" | "pc" | "console" | "confirmed">("all");

  const live = state.sessions.filter((s) => s.status !== "settled");
  const todayRevenue = useMemo(
    () => state.transactions.filter((t) => isToday(t.at, now)).reduce((s, t) => s + t.amount, 0),
    [state.transactions, now]
  );

  const revSeries = useMemo(() => {
    const days: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = new Date(now - i * 86400000);
      dayStart.setHours(0, 0, 0, 0);
      const next = dayStart.getTime() + 86400000;
      days.push(
        state.transactions.filter((t) => t.at >= dayStart.getTime() && t.at < next).reduce((s, t) => s + t.amount, 0)
      );
    }
    return days;
  }, [state.transactions, now]);

  const online = state.devices.filter((d) => d.status !== "offline");
  const inUse = state.devices.filter((d) => d.status === "in_use").length;
  const occ = online.length ? Math.round((inUse / online.length) * 100) : 0;

  const prepaidRemaining = live.reduce((sum, s) => {
    if (s.prepaidSec === 0) return sum;
    return sum + Math.max(0, s.prepaidSec * 1000 - elapsedMs(s, now));
  }, 0);

  const zones = useMemo(() => {
    const map = new Map<string, Device[]>();
    for (const d of state.devices) {
      map.set(d.zone, [...(map.get(d.zone) ?? []), d]);
    }
    return [...map.entries()];
  }, [state.devices]);

  const sessionFor = (deviceId: string) => live.find((s) => s.deviceId === deviceId);

  // Next available slots for PC and Console using live time
  const pcDevices = useMemo(() => state.devices.filter((d) => d.type === "pc"), [state.devices]);
  const consoleDevices = useMemo(() => state.devices.filter((d) => d.type === "console"), [state.devices]);

  const pcAvailableNow = useMemo(() => pcDevices.filter((d) => d.status === "available"), [pcDevices]);
  const consoleAvailableNow = useMemo(() => consoleDevices.filter((d) => d.status === "available"), [consoleDevices]);

  // If none available, when does the earliest one free up?
  const nextPcFree = useMemo(() => {
    if (pcAvailableNow.length > 0) return { availableNow: true, count: pcAvailableNow.length };
    const activePcSessions = state.sessions.filter(
      (s) => s.status !== "settled" && pcDevices.some((d) => d.id === s.deviceId)
    );
    if (activePcSessions.length === 0) return null;
    let minRemaining = Infinity;
    let targetDevice: Device | undefined;
    for (const s of activePcSessions) {
      const rem = Math.max(0, s.prepaidSec * 1000 - elapsedMs(s, now));
      if (rem < minRemaining) {
        minRemaining = rem;
        targetDevice = pcDevices.find((d) => d.id === s.deviceId);
      }
    }
    return {
      availableNow: false,
      freeAt: now + minRemaining,
      remMs: minRemaining,
      device: targetDevice,
    };
  }, [pcAvailableNow, state.sessions, pcDevices, now]);

  const nextConsoleFree = useMemo(() => {
    if (consoleAvailableNow.length > 0) return { availableNow: true, count: consoleAvailableNow.length };
    const activeConsoleSessions = state.sessions.filter(
      (s) => s.status !== "settled" && consoleDevices.some((d) => d.id === s.deviceId)
    );
    if (activeConsoleSessions.length === 0) return null;
    let minRemaining = Infinity;
    let targetDevice: Device | undefined;
    for (const s of activeConsoleSessions) {
      const rem = Math.max(0, s.prepaidSec * 1000 - elapsedMs(s, now));
      if (rem < minRemaining) {
        minRemaining = rem;
        targetDevice = consoleDevices.find((d) => d.id === s.deviceId);
      }
    }
    return {
      availableNow: false,
      freeAt: now + minRemaining,
      remMs: minRemaining,
      device: targetDevice,
    };
  }, [consoleAvailableNow, state.sessions, consoleDevices, now]);

  const filteredReservations = useMemo(() => {
    const list = state.reservations || [];
    return list.filter((r) => {
      if (resFilter === "pc") return r.deviceType === "pc";
      if (resFilter === "console") return r.deviceType === "console";
      if (resFilter === "confirmed") return r.status === "confirmed";
      return true;
    });
  }, [state.reservations, resFilter]);

  const handleStartReservation = (rId: string) => {
    const res = startReservationSession(rId);
    if (!res.ok) {
      toast(res.reason, "error");
    } else {
      toast("Reservation checked in! Session is now live on floor.");
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className={`${cardCls} p-4`}>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase">Revenue today</p>
          <div className="mt-1.5 flex items-end justify-between gap-2">
            <p className="font-mono text-2xl font-bold text-slate-900 tabular sm:text-3xl dark:text-white">
              {money(todayRevenue)}
            </p>
            <span className="text-brand-500">
              <svg viewBox="0 0 120 36" className="h-9 w-24" preserveAspectRatio="none">
                {(() => {
                  const max = Math.max(...revSeries, 1);
                  return revSeries.map((v, i) => (
                    <rect
                      key={i}
                      x={(i / revSeries.length) * 120 + 1}
                      y={34 - (v / max) * 30}
                      width={120 / revSeries.length - 2.5}
                      height={Math.max(1.5, (v / max) * 30)}
                      rx="1.5"
                      fill="currentColor"
                      opacity={i === revSeries.length - 1 ? 1 : 0.35}
                    />
                  ));
                })()}
              </svg>
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">14-day trend · all methods</p>
        </div>

        <div className={`${cardCls} p-4`}>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase">Active sessions</p>
          <div className="mt-1.5 flex items-end gap-2">
            <p className="font-mono text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">{live.length}</p>
            <span className="relative mb-1.5 flex h-2 w-2">
              <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {live.filter((s) => s.status === "paused").length} paused · live on the floor
          </p>
        </div>

        <div className={`${cardCls} p-4`}>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase">Station occupancy</p>
          <div className="mt-1.5 flex items-end justify-between">
            <p className="font-mono text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">{occ}%</p>
            <ProgressRing
              pct={occ / 100}
              size={44}
              label={<span className="font-mono text-[10px] font-bold text-slate-600 dark:text-slate-300">{inUse}/{online.length}</span>}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">of online stations in use</p>
        </div>

        <div className={`${cardCls} p-4`}>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase">Prepaid time in play</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
            {fmtDuration(prepaidRemaining)}
          </p>
          <p className="mt-1 text-xs text-slate-400">remaining on packages right now</p>
        </div>
      </div>

      {/* Floor Reservations Section */}
      <div className={`${cardCls} overflow-hidden p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-ink-700">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <CalendarClock className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Floor Reservations & Next Bookings
                </h3>
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Book upcoming sessions for Gaming PCs and Consoles using live floor timing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setReserving({ open: true })}
              className={btnPrimary}
            >
              <Plus className="h-4 w-4" /> Book Next Slot
            </button>
          </div>
        </div>

        {/* Quick-Slot Status Cards for PC and Console */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* PC Quick Slot */}
          <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 transition hover:border-brand-300 dark:border-ink-700 dark:bg-ink-800/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  <Monitor className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Gaming PC Next Slot</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Rate: ₹60 for 1h · ₹50/h for 2+ hrs
                  </p>
                </div>
              </div>
              {nextPcFree?.availableNow ? (
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {nextPcFree.count} PC{nextPcFree.count === 1 ? "" : "s"} Free Now
                </span>
              ) : nextPcFree?.freeAt ? (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  Frees up ~{fmtTime(nextPcFree.freeAt)} ({Math.ceil(nextPcFree.remMs / 60000)}m)
                </span>
              ) : (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-ink-700 dark:text-slate-300">
                  {pcDevices.length} PCs registered
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400">
                {nextPcFree?.availableNow ? "Ready for immediate walk-in / booking" : `Next: ${nextPcFree?.device?.name ?? "PC Station"}`}
              </span>
              <button
                onClick={() => setReserving({ open: true, deviceType: "pc" })}
                className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-brand-600 shadow-xs transition hover:bg-brand-50 hover:text-brand-700 dark:border-ink-600 dark:bg-ink-800 dark:text-brand-400"
              >
                <Plus className="h-3 w-3" /> Book PC Slot
              </button>
            </div>
          </div>

          {/* Console Quick Slot */}
          <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 transition hover:border-brand-300 dark:border-ink-700 dark:bg-ink-800/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                  <Gamepad2 className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Console Lounge Next Slot</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pre-paid only · 1P ₹80/h to 4P ₹200/h (No Disc)
                  </p>
                </div>
              </div>
              {nextConsoleFree?.availableNow ? (
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {nextConsoleFree.count} Console{nextConsoleFree.count === 1 ? "" : "s"} Free Now
                </span>
              ) : nextConsoleFree?.freeAt ? (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  Frees up ~{fmtTime(nextConsoleFree.freeAt)} ({Math.ceil(nextConsoleFree.remMs / 60000)}m)
                </span>
              ) : (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-ink-700 dark:text-slate-300">
                  {consoleDevices.length} Consoles registered
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400">
                {nextConsoleFree?.availableNow ? "Ready for immediate walk-in / booking" : `Next: ${nextConsoleFree?.device?.name ?? "Console Station"}`}
              </span>
              <button
                onClick={() => setReserving({ open: true, deviceType: "console" })}
                className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-brand-600 shadow-xs transition hover:bg-brand-50 hover:text-brand-700 dark:border-ink-600 dark:bg-ink-800 dark:text-brand-400"
              >
                <Plus className="h-3 w-3" /> Book Console Slot
              </button>
            </div>
          </div>
        </div>

        {/* Reservations List */}
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-ink-700">
            <div className="flex items-center gap-1">
              {[
                { id: "all", label: `All (${state.reservations?.length ?? 0})` },
                { id: "confirmed", label: `Upcoming (${state.reservations?.filter((r) => r.status === "confirmed").length ?? 0})` },
                { id: "pc", label: `PC (${state.reservations?.filter((r) => r.deviceType === "pc").length ?? 0})` },
                { id: "console", label: `Console (${state.reservations?.filter((r) => r.deviceType === "console").length ?? 0})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setResFilter(tab.id as typeof resFilter)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    resFilter === tab.id
                      ? "bg-brand-600 text-white shadow-xs"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-ink-800 dark:hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredReservations.length === 0 ? (
            <div className="py-8 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                No reservations found
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Book the next slot ahead for a PC or Console station.
              </p>
              <button
                onClick={() => setReserving({ open: true })}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-600 shadow-xs transition hover:bg-brand-50 dark:border-ink-600 dark:bg-ink-800 dark:text-brand-400"
              >
                <Plus className="h-3.5 w-3.5" /> Book Next Slot
              </button>
            </div>
          ) : (
            <div className="mt-3 divide-y divide-slate-100 overflow-x-auto dark:divide-ink-700/60">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] tracking-wider text-slate-400 uppercase dark:border-ink-700">
                    <th className="py-2.5 pr-3 font-semibold">Station</th>
                    <th className="px-3 py-2.5 font-semibold">Customer</th>
                    <th className="px-3 py-2.5 font-semibold">Scheduled Slot</th>
                    <th className="px-3 py-2.5 font-semibold">Timing / Status</th>
                    <th className="px-3 py-2.5 font-semibold">Est. Bill</th>
                    <th className="py-2.5 pl-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70 dark:divide-ink-700/50">
                  {filteredReservations.map((r) => {
                    const dev = state.devices.find((d) => d.id === r.deviceId);
                    const isDueNow = r.status === "confirmed" && r.startTime <= now && (r.startTime + r.durationHours * 3600 * 1000) >= now;
                    const isPassed = r.status === "confirmed" && (r.startTime + r.durationHours * 3600 * 1000) < now;
                    const isFuture = r.status === "confirmed" && r.startTime > now;

                    return (
                      <tr key={r.id} className="group transition hover:bg-slate-50/70 dark:hover:bg-ink-800/40">
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                              {r.deviceType === "console" ? (
                                <Gamepad2 className="h-3.5 w-3.5" />
                              ) : (
                                <Monitor className="h-3.5 w-3.5" />
                              )}
                            </span>
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-100">
                                {dev?.name ?? "Station"}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {DEVICE_META[r.deviceType]?.label ?? r.deviceType}
                                {r.playerCount ? ` · ${r.playerCount}P` : ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{r.customerName}</p>
                          <p className="text-[10px] text-slate-400">{r.customerPhone || "No phone"}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-700 dark:text-slate-300">
                            {fmtTime(r.startTime)} – {fmtTime(r.startTime + r.durationHours * 3600 * 1000)}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {fmtDate(r.startTime)} · {r.durationHours}h duration
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          {r.status === "completed" ? (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-ink-700 dark:text-slate-300">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Completed
                            </span>
                          ) : r.status === "cancelled" ? (
                            <span className="rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                              Cancelled
                            </span>
                          ) : isDueNow ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" /> Due Now
                            </span>
                          ) : isFuture ? (
                            <span className="rounded bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                              Starts in {fmtDuration(r.startTime - now)}
                            </span>
                          ) : isPassed ? (
                            <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                              Late / Passed
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {money(r.estimatedAmount)}
                          </span>
                          <span className="block text-[10px] text-slate-400">Pre-paid</span>
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {r.status === "confirmed" && (
                              <>
                                <button
                                  onClick={() => handleStartReservation(r.id)}
                                  className="flex items-center gap-1 rounded bg-brand-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs transition hover:bg-brand-700 active:scale-95"
                                  title="Start active session on station"
                                >
                                  <Play className="h-3 w-3" /> Start Session
                                </button>
                                <button
                                  onClick={() => cancelReservation(r.id)}
                                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                                  title="Cancel reservation"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            {r.status !== "confirmed" && (
                              <button
                                onClick={() => deleteReservation(r.id)}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-ink-700 dark:hover:text-slate-300"
                                title="Delete record"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {/* live floor */}
        <div className="space-y-6">
          {zones.length === 0 && (
            <div className={`${cardCls} p-8`}>
              <EmptyState
                title="No stations on the floor"
                sub="Add gaming PCs, consoles, VR bays, or sim rigs to start tracking live floor occupancy."
                action={
                  <button className={btnPrimary} onClick={() => setView("devices")}>
                    Manage devices
                  </button>
                }
              />
            </div>
          )}
          {zones.map(([zone, devices]) => (
            <section key={zone}>
              <div className="mb-2.5 flex items-baseline justify-between">
                <h3 className="font-display text-sm font-bold tracking-tight text-slate-700 dark:text-slate-200">
                  {zone}
                </h3>
                <span className="font-mono text-[11px] text-slate-400">
                  {devices.filter((d) => d.status === "in_use").length}/{devices.length} in use
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {devices.map((d) => {
                  const s = sessionFor(d.id);
                  return (
                    <DeviceTile
                      key={d.id}
                      device={d}
                      session={s}
                      onStart={() => setStartFor(d.id)}
                      onSettle={() => s && setSettleId(s.id)}
                      onExtend={() => s && setExtendId(s.id)}
                      onPauseToggle={() =>
                        s && (s.status === "active" ? pauseSession(s.id) : resumeSession(s.id))
                      }
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* right rail */}
        <div className="space-y-5">
          <div className={`${cardCls} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-ink-700">
              <h3 className="font-display text-sm font-bold text-slate-800 dark:text-slate-100">Needs attention</h3>
              {alerts.length > 0 ? (
                <Badge tone={alerts.some((a) => a.sev === "danger") ? "red" : "amber"}>{alerts.length}</Badge>
              ) : (
                <Badge tone="green">clear</Badge>
              )}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-ink-700/60">
              {alerts.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">Floor is running smooth. ✓</p>
              )}
              {alerts.slice(0, 6).map((a) => (
                <button
                  key={a.id}
                  onClick={() => setView("sessions")}
                  className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-ink-800/60"
                >
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      a.sev === "danger" ? "bg-rose-500" : a.sev === "warn" ? "bg-amber-500" : "bg-brand-500"
                    }`}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{a.title}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{a.sub}</span>
                  </span>
                  <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 self-center text-slate-300" />
                </button>
              ))}
            </div>
          </div>

          <div className={`${cardCls} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-ink-700">
              <h3 className="font-display text-sm font-bold text-slate-800 dark:text-slate-100">Recent activity</h3>
              <button
                onClick={() => setView("billing")}
                className="text-xs font-semibold text-brand-600 transition hover:text-brand-700 dark:text-brand-400"
              >
                View all →
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-ink-700/60">
              {state.transactions.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-slate-400">No activity recorded yet.</p>
              )}
              {state.transactions.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      t.kind === "topup"
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : t.kind === "package"
                          ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                          : "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                    }`}
                  >
                    {t.method === "cash" ? (
                      <Banknote className="h-4 w-4" />
                    ) : t.method === "card" ? (
                      <CreditCard className="h-4 w-4" />
                    ) : (
                      <WalletIcon className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{t.label}</p>
                    <p className="truncate text-xs text-slate-400">
                      {t.memberName} · {timeAgo(t.at, now)}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold text-slate-900 tabular dark:text-white">
                    {money(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {startFor && <StartSessionModal deviceId={startFor} onClose={() => setStartFor(null)} />}
      {settleId && <SettleModal sessionId={settleId} onClose={() => setSettleId(null)} />}
      {extendId && <ExtendModal sessionId={extendId} onClose={() => setExtendId(null)} />}
      {reserving.open && (
        <ReservationModal
          initialDeviceId={reserving.deviceId}
          initialDeviceType={reserving.deviceType}
          onClose={() => setReserving({ open: false })}
        />
      )}
    </div>
  );
}

/* ---------------- device tile ---------------- */

function DeviceTile({
  device: d,
  session: s,
  onStart,
  onSettle,
  onExtend,
  onPauseToggle,
}: {
  device: Device;
  session?: Session;
  onStart: () => void;
  onSettle: () => void;
  onExtend: () => void;
  onPauseToggle: () => void;
}) {
  const { state, now } = useStore();
  const member = s ? state.members.find((m) => m.id === s.memberId) : undefined;

  let remainingMs = 0;
  let expired = false;
  if (s && s.prepaidSec > 0) {
    remainingMs = s.prepaidSec * 1000 - elapsedMs(s, now);
    expired = remainingMs <= 0;
  }

  const frame =
    d.status === "in_use"
      ? expired
        ? "border-rose-300 bg-rose-50/60 dark:border-rose-500/40 dark:bg-rose-500/[0.07]"
        : "border-brand-300/70 bg-white shadow-[0_0_0_3px_rgba(37,99,235,0.08)] dark:border-brand-500/40 dark:bg-ink-850"
      : d.status === "available"
        ? "border-slate-200/80 bg-white hover:border-brand-300 hover:shadow-md dark:border-ink-700 dark:bg-ink-850 dark:hover:border-brand-500/50"
        : "border-slate-200/60 bg-slate-50/60 dark:border-ink-700/70 dark:bg-ink-900/60";

  return (
    <div className={`group rounded-xl border p-4 transition-all duration-300 ${frame}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              d.status === "in_use"
                ? "bg-brand-600 text-white shadow-md shadow-brand-600/30"
                : d.status === "available"
                  ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                  : "bg-slate-100 text-slate-400 dark:bg-ink-700 dark:text-slate-500"
            }`}
          >
            <DeviceIcon type={d.type} className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="font-display text-sm leading-tight font-bold text-slate-900 dark:text-white">{d.name}</p>
            <p className="text-[11px] text-slate-400">
              {DEVICE_META[d.type].label}
              {d.type === "console" ? ` (${s?.playerCount ?? d.playerCount ?? 1}P)` : ""} ·{" "}
              {money(s?.sessionHourlyRate ?? d.hourlyRate)}/h
            </p>
          </div>
        </div>
        <StatusBadge status={d.status} />
      </div>

      {d.status === "in_use" && s && (
        <div className="mt-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{member?.name ?? "Walk-in"}</p>
              <p
                className={`font-mono text-xl leading-tight font-bold tabular ${
                  expired ? "text-rose-600 dark:text-rose-400" : s.status === "paused" ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"
                }`}
              >
                {fmtClock(elapsedMs(s, now))}
              </p>
            </div>
            {s.prepaidSec > 0 && (
              <div className="text-right">
                <ProgressRing
                  pct={remainingMs / (s.prepaidSec * 1000)}
                  size={40}
                  tone={expired ? "red" : remainingMs < 5 * 60000 ? "amber" : "brand"}
                  label={
                    expired ? (
                      <Lock className="h-3.5 w-3.5 text-rose-500" />
                    ) : (
                      <span className="font-mono text-[9px] font-bold text-slate-500 dark:text-slate-300">
                        {Math.ceil(Math.max(0, remainingMs) / 60000)}m
                      </span>
                    )
                  }
                />
              </div>
            )}
          </div>

          {expired && (
            <p className="mt-2 flex items-center gap-1.5 rounded-md bg-rose-100 px-2 py-1 text-[11px] font-bold tracking-wide text-rose-700 uppercase dark:bg-rose-500/15 dark:text-rose-300">
              <Lock className="h-3 w-3" /> Time up — station auto-locked
            </p>
          )}
          {s.status === "paused" && !expired && (
            <p className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold tracking-wide text-amber-700 uppercase dark:bg-amber-500/15 dark:text-amber-300">
              <Pause className="h-3 w-3" /> Paused — meter stopped
            </p>
          )}

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <button
              onClick={onPauseToggle}
              className="flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-amber-400 hover:text-amber-600 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-300"
            >
              {s.status === "active" ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {s.status === "active" ? "Pause" : "Resume"}
            </button>
            <button
              onClick={onExtend}
              className="flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-brand-400 hover:text-brand-600 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-300"
            >
              <Zap className="h-3 w-3" /> Extend
            </button>
            <button
              onClick={onSettle}
              className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-bold text-white transition active:scale-[0.97] ${
                expired ? "bg-rose-500 hover:bg-rose-600" : "bg-brand-600 hover:bg-brand-700"
              }`}
            >
              <Square className="h-3 w-3" /> Settle
            </button>
          </div>
        </div>
      )}

      {d.status === "available" && (
        <div className="mt-3 flex items-center justify-between">
          <p className="max-w-[55%] truncate text-[11px] text-slate-400">{d.specs || "—"}</p>
          <button
            onClick={onStart}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-brand-600/30 transition hover:bg-brand-700 active:scale-[0.97]"
          >
            <Play className="h-3 w-3" /> Start
          </button>
        </div>
      )}

      {d.status === "maintenance" && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
          <Wrench className="h-3.5 w-3.5" /> Out of rotation — see Devices to restore
        </p>
      )}
      {d.status === "offline" && (
        <p className="mt-3 text-[11px] font-semibold text-slate-400">Powered down · not billable</p>
      )}
    </div>
  );
}
