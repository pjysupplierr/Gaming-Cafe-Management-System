import { useMemo, useState } from "react";
import { CheckCircle2, Lock, Pause, Play, Plus, Square, Zap } from "lucide-react";
import { useStore } from "./store";
import { PACKAGES } from "./types";
import { elapsedMs, fmtClock, fmtDuration, fmtTime, money, timeAgo } from "./utils";
import { Badge, btnPrimary, cardCls, DeviceIcon, EmptyState } from "./ui";
import { ExtendModal, SettleModal, StartSessionModal } from "./modals";

export function Sessions() {
  const { state, now, pauseSession, resumeSession } = useStore();
  const [starting, setStarting] = useState(false);
  const [settleId, setSettleId] = useState<string | null>(null);
  const [extendId, setExtendId] = useState<string | null>(null);

  const live = useMemo(() => state.sessions.filter((s) => s.status !== "settled"), [state.sessions]);
  const settled = useMemo(
    () => state.sessions.filter((s) => s.status === "settled").slice(0, 12),
    [state.sessions]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={live.length > 0 ? "green" : "slate"}>{live.length} live</Badge>
          <Badge tone="slate">{settled.length} settled today</Badge>
        </div>
        <button className={btnPrimary} onClick={() => setStarting(true)}>
          <Plus className="h-4 w-4" /> New session
        </button>
      </div>

      {/* live board */}
      <div className="space-y-3">
        {live.length === 0 && (
          <EmptyState
            title="No sessions running"
            sub="The floor is quiet. Start a session to put a station in play."
            action={
              <button className={btnPrimary} onClick={() => setStarting(true)}>
                <Plus className="h-4 w-4" /> New session
              </button>
            }
          />
        )}
        {live.map((s) => {
          const device = state.devices.find((d) => d.id === s.deviceId);
          const member = state.members.find((m) => m.id === s.memberId);
          if (!device || !member) return null;
          const total = elapsedMs(s, now);
          const remaining = s.prepaidSec > 0 ? s.prepaidSec * 1000 - total : 0;
          const expired = s.prepaidSec > 0 && remaining <= 0;
          const pct = s.prepaidSec > 0 ? Math.max(0, remaining / (s.prepaidSec * 1000)) : 0;

          return (
            <div
              key={s.id}
              className={`${cardCls} p-4 transition ${
                expired ? "border-rose-300 dark:border-rose-500/40" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-4">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                    expired
                      ? "bg-rose-500 text-white"
                      : s.status === "paused"
                        ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                        : "bg-brand-600 text-white shadow-md shadow-brand-600/30"
                  }`}
                >
                  {expired ? <Lock className="h-5 w-5" /> : <DeviceIcon type={device.type} className="h-5 w-5" />}
                </span>

                <div className="min-w-[160px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-sm font-bold text-slate-900 dark:text-white">{device.name}</p>
                    <Badge tone={s.mode === "package" ? "amber" : "blue"}>
                      {s.mode === "package" ? PACKAGES.find((p) => p.id === s.pkgId)?.label ?? "Package" : "Pay-as-you-go"}
                    </Badge>
                    {s.status === "paused" && <Badge tone="slate">paused</Badge>}
                    {expired && <Badge tone="red">time up · auto-locked</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {member.name} · started {timeAgo(s.startedAt, now)} · {money(device.hourlyRate)}/h
                  </p>
                </div>

                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <p
                      className={`font-mono text-2xl leading-none font-bold tabular ${
                        expired
                          ? "text-rose-600 dark:text-rose-400"
                          : s.status === "paused"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-900 dark:text-white"
                      }`}
                    >
                      {fmtClock(total)}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">elapsed</p>
                  </div>

                  {s.prepaidSec > 0 && (
                    <div className="w-36">
                      <div className="flex justify-between text-[11px] font-semibold">
                        <span className="text-slate-400">prepaid</span>
                        <span className={`font-mono ${expired ? "text-rose-500" : "text-slate-600 dark:text-slate-300"}`}>
                          {expired ? `+${fmtDuration(-remaining)} over` : fmtDuration(remaining)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-ink-600">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            expired ? "bg-rose-500" : pct < 0.15 ? "bg-amber-500" : "bg-brand-600"
                          }`}
                          style={{ width: `${Math.max(expired ? 100 : 2, pct * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-1.5">
                    <button
                      onClick={() => (s.status === "active" ? pauseSession(s.id) : resumeSession(s.id))}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-500 transition hover:border-amber-400 hover:text-amber-600 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-300"
                      title={s.status === "active" ? "Pause session" : "Resume session"}
                    >
                      {s.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => setExtendId(s.id)}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-500 transition hover:border-brand-400 hover:text-brand-600 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-300"
                      title="Extend session"
                    >
                      <Zap className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setSettleId(s.id)}
                      className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-bold text-white transition active:scale-[0.97] ${
                        expired ? "bg-rose-500 hover:bg-rose-600" : "bg-brand-600 hover:bg-brand-700"
                      }`}
                    >
                      <Square className="h-4 w-4" /> Settle
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* settled log */}
      <section>
        <h3 className="mb-2.5 font-display text-sm font-bold tracking-tight text-slate-700 dark:text-slate-200">
          Recently settled
        </h3>
        <div className={`${cardCls} overflow-hidden`}>
          {settled.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Settled sessions will appear here with their final charge.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-ink-700/60">
              {settled.map((s) => {
                const device = state.devices.find((d) => d.id === s.deviceId);
                const member = state.members.find((m) => m.id === s.memberId);
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {device?.name ?? "Removed device"} · {member?.name ?? "Former member"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {fmtDuration(s.accumulatedMs)} played · ended {s.endedAt ? fmtTime(s.endedAt) : "—"} ·{" "}
                        {s.mode === "package" ? "package" : "pay-as-you-go"}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-slate-900 tabular dark:text-white">
                      {money((s.charged ?? 0) + s.pkgPrice)}
                    </span>
                    <Badge tone="slate">{s.method ?? "—"}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {starting && <StartSessionModal onClose={() => setStarting(false)} />}
      {settleId && <SettleModal sessionId={settleId} onClose={() => setSettleId(null)} />}
      {extendId && <ExtendModal sessionId={extendId} onClose={() => setExtendId(null)} />}
    </div>
  );
}
