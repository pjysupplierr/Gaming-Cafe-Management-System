import { useMemo, useState } from "react";
import { useStore } from "./store";
import { DEVICE_META, TIER_META, type DeviceType, type Tier } from "./types";
import { fmtDate, money, moneyShort } from "./utils";
import { cardCls, DeviceIcon, Seg } from "./ui";

type Range = "7d" | "30d";

export function Reports() {
  const { state, now } = useStore();
  const [range, setRange] = useState<Range>("7d");

  const days = range === "7d" ? 7 : 30;
  const cutoff = now - days * 86400000;
  const txs = useMemo(() => state.transactions.filter((t) => t.at >= cutoff), [state.transactions, cutoff]);

  /* daily revenue series */
  const series = useMemo(() => {
    const out: { label: string; value: number; isToday: boolean }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(now - i * 86400000);
      start.setHours(0, 0, 0, 0);
      const end = start.getTime() + 86400000;
      out.push({
        label: fmtDate(start.getTime()),
        value: state.transactions.filter((t) => t.at >= start.getTime() && t.at < end).reduce((s, t) => s + t.amount, 0),
        isToday: i === 0,
      });
    }
    return out;
  }, [state.transactions, now, days]);

  const [hover, setHover] = useState<number | null>(null);
  const maxDay = Math.max(...series.map((s) => s.value), 1);
  const total = series.reduce((s, d) => s + d.value, 0);
  const bestDay = series.reduce((a, b) => (b.value > a.value ? b : a), series[0]);

  /* revenue by device type */
  const byType = useMemo(() => {
    const map = new Map<DeviceType, number>();
    for (const t of txs) {
      if (!t.deviceId) continue;
      const dev = state.devices.find((d) => d.id === t.deviceId);
      if (!dev) continue;
      map.set(dev.type, (map.get(dev.type) ?? 0) + t.amount);
    }
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const sum = entries.reduce((s, [, v]) => s + v, 0) || 1;
    return entries.map(([type, v]) => ({ type, v, pct: v / sum }));
  }, [txs, state.devices]);

  /* by payment method */
  const byMethod = useMemo(() => {
    const map: Record<string, number> = { cash: 0, card: 0, wallet: 0 };
    for (const t of txs) map[t.method] += t.amount;
    const sum = map.cash + map.card + map.wallet || 1;
    return (["card", "cash", "wallet"] as const).map((m) => ({ m, v: map[m], pct: map[m] / sum }));
  }, [txs]);

  /* hour heatmap */
  const hours = useMemo(() => {
    const buckets = new Array(14).fill(0) as number[]; // 10:00 → 23:00
    for (const t of txs) {
      const h = new Date(t.at).getHours();
      if (h >= 10 && h <= 23) buckets[h - 10] += 1;
    }
    return buckets;
  }, [txs]);
  const maxHour = Math.max(...hours, 1);

  /* top members */
  const topMembers = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of txs) {
      if (t.kind === "topup" || !t.memberId) continue;
      map.set(t.memberId, (map.get(t.memberId) ?? 0) + t.amount);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ member: state.members.find((m) => m.id === id), v }))
      .filter((x): x is { member: NonNullable<typeof x.member>; v: number } => Boolean(x.member))
      .sort((a, b) => b.v - a.v)
      .slice(0, 5);
  }, [txs, state.members]);
  const maxMember = Math.max(...topMembers.map((m) => m.v), 1);

  const sessionCount = txs.filter((t) => t.kind === "session").length;
  const avgTicket = sessionCount > 0 ? txs.filter((t) => t.kind !== "topup").reduce((s, t) => s + t.amount, 0) / Math.max(1, txs.filter((t) => t.kind !== "topup").length) : 0;

  const barW = 100 / series.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-mono font-bold text-slate-900 dark:text-white">{money(total)}</span> collected over the
            last {days} days · best day{" "}
            <span className="font-semibold text-brand-600 dark:text-brand-300">{bestDay.label}</span> ({money(bestDay.value)})
          </p>
        </div>
        <Seg
          options={[
            { value: "7d" as Range, label: "7 days" },
            { value: "30d" as Range, label: "30 days" },
          ]}
          value={range}
          onChange={setRange}
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: "Gross revenue", v: money(total) },
          { k: "Sessions billed", v: String(sessionCount) },
          { k: "Avg. ticket", v: money(avgTicket) },
          { k: "Top method", v: txs.length === 0 ? "—" : byMethod.reduce((a, b) => (b.v > a.v ? b : a)).m.toUpperCase() },
        ].map((x) => (
          <div key={x.k} className={`${cardCls} p-4`}>
            <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase">{x.k}</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 dark:text-white">{x.v}</p>
          </div>
        ))}
      </div>

      {/* revenue chart */}
      <div className={`${cardCls} p-5`}>
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="font-display text-sm font-bold text-slate-800 dark:text-slate-100">Daily revenue</h3>
          <span className="font-mono text-xs text-slate-400">peak {moneyShort(maxDay)}/day</span>
        </div>
        <div className="relative">
          {hover !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 rounded-md bg-ink-900 px-2.5 py-1.5 text-center shadow-lg dark:bg-ink-700"
              style={{ left: `${(hover + 0.5) * barW}%` }}
            >
              <p className="font-mono text-xs font-bold text-white">{money(series[hover].value)}</p>
              <p className="text-[10px] text-slate-400">{series[hover].label}</p>
            </div>
          )}
          <svg viewBox="0 0 100 42" className="h-44 w-full" preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1="0" x2="100" y1={42 - g * 38} y2={42 - g * 38} stroke="currentColor" strokeWidth="0.15" className="text-slate-300 dark:text-ink-600" />
            ))}
            {series.map((d, i) => {
              const h = Math.max(0.8, (d.value / maxDay) * 36);
              return (
                <g key={i}>
                  <rect
                    x={i * barW + barW * 0.18}
                    y={42 - h}
                    width={barW * 0.64}
                    height={h}
                    rx="0.8"
                    className={`bar-grow transition-opacity ${
                      hover === null || hover === i ? "" : "opacity-40"
                    } ${d.isToday ? "fill-brand-600" : "fill-brand-400/70 dark:fill-brand-500/70"}`}
                    style={{ animationDelay: `${i * 22}ms` }}
                    onMouseEnter={() => setHover(i)}
                  />
                  {/* hover catcher */}
                  <rect x={i * barW} y="0" width={barW} height="42" fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
            <span>{series[0].label}</span>
            {series.length > 10 && <span>{series[Math.floor(series.length / 2)].label}</span>}
            <span>{series[series.length - 1].label}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* by device type */}
        <div className={`${cardCls} p-5`}>
          <h3 className="mb-4 font-display text-sm font-bold text-slate-800 dark:text-slate-100">Revenue by station type</h3>
          <div className="space-y-3.5">
            {byType.map(({ type, v, pct }) => (
              <div key={type} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  <DeviceIcon type={type} className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{DEVICE_META[type].plural}</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{money(v)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-700">
                    <div className="h-full rounded-full bg-brand-600 transition-all duration-700" style={{ width: `${pct * 100}%` }} />
                  </div>
                </div>
                <span className="w-10 text-right font-mono text-xs text-slate-400">{Math.round(pct * 100)}%</span>
              </div>
            ))}
            {byType.length === 0 && <p className="text-sm text-slate-400">No device-linked revenue in this window.</p>}
          </div>

          <h3 className="mt-6 mb-4 font-display text-sm font-bold text-slate-800 dark:text-slate-100">Payment mix</h3>
          <div className="flex h-3 overflow-hidden rounded-full">
            {byMethod.map(({ m, pct }) => (
              <div
                key={m}
                className={`h-full transition-all duration-700 ${
                  m === "card" ? "bg-brand-600" : m === "cash" ? "bg-emerald-500" : "bg-amber-400"
                }`}
                style={{ width: `${Math.max(pct * 100, pct > 0 ? 3 : 0)}%` }}
                title={`${m} · ${Math.round(pct * 100)}%`}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-slate-500 dark:text-slate-400">
            {byMethod.map(({ m, v, pct }) => (
              <span key={m} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${m === "card" ? "bg-brand-600" : m === "cash" ? "bg-emerald-500" : "bg-amber-400"}`} />
                <span className="font-semibold capitalize">{m}</span>
                <span className="font-mono text-slate-400">{Math.round(pct * 100)}%</span>
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          {/* hour heatmap */}
          <div className={`${cardCls} p-5`}>
            <h3 className="mb-1 font-display text-sm font-bold text-slate-800 dark:text-slate-100">Busiest hours</h3>
            <p className="mb-4 text-xs text-slate-400">Transaction volume by hour, last {days} days</p>
            <div className="grid grid-cols-7 gap-1.5">
              {hours.map((v, i) => (
                <div key={i} className="text-center">
                  <div
                    className="flex h-11 items-end justify-center rounded-md transition hover:ring-2 hover:ring-brand-400"
                    style={{
                      background: `rgba(37, 99, 235, ${0.08 + (v / maxHour) * 0.85})`,
                    }}
                    title={`${i + 10}:00 — ${v} transactions`}
                  >
                    <span className="pb-1 font-mono text-[10px] font-bold text-white drop-shadow">{v || ""}</span>
                  </div>
                  <p className="mt-1 font-mono text-[9px] text-slate-400">{i + 10}h</p>
                </div>
              ))}
            </div>
          </div>

          {/* top members */}
          <div className={`${cardCls} p-5`}>
            <h3 className="mb-4 font-display text-sm font-bold text-slate-800 dark:text-slate-100">Top members by spend</h3>
            <div className="space-y-3">
              {topMembers.map(({ member, v }, i) => (
                <div key={member.id} className="flex items-center gap-3">
                  <span className={`w-5 text-center font-mono text-xs font-bold ${i === 0 ? "text-amber-500" : "text-slate-400"}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{member.name}</p>
                      <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">{money(v)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-700">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${i === 0 ? "bg-amber-400" : "bg-brand-500"}`}
                          style={{ width: `${(v / maxMember) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                        {TIER_META[member.tier as Tier].label}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {topMembers.length === 0 && <p className="text-sm text-slate-400">No member spend in this window.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
