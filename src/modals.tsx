import { useMemo, useState } from "react";
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Gamepad2,
  Loader2,
  Monitor,
  Printer,
  User,
  Users,
  Wallet as WalletIcon,
  Zap,
} from "lucide-react";
import { useStore, type SettleInfo } from "./store";
import {
  CONSOLE_PLAYER_RATES,
  DEVICE_META,
  PACKAGES,
  STATUS_META,
  TIER_META,
  ZONES,
  type Device,
  type DeviceStatus,
  type DeviceType,
  type Member,
  type PayMethod,
  type SessionMode,
  type Tier,
} from "./types";
import {
  calcSessionPrice,
  elapsedMs,
  fmtDate,
  fmtDateFull,
  fmtDuration,
  fmtTime,
  money,
  packagePrice,
  paygCharge,
  round2,
} from "./utils";
import { btnDanger, btnGhost, btnPrimary, Field, inputCls, Modal, Seg } from "./ui";
import logoImg from "./assets/logo.jpg";

/* ================= payment method picker ================= */

function MethodPicker({
  value,
  onChange,
  wallet,
  price,
}: {
  value: PayMethod;
  onChange: (m: PayMethod) => void;
  wallet: number;
  price: number;
}) {
  const opts: { v: PayMethod; label: string; icon: typeof Banknote }[] = [
    { v: "cash", label: "Cash", icon: Banknote },
    { v: "card", label: "Card", icon: CreditCard },
    { v: "wallet", label: "Wallet", icon: WalletIcon },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {opts.map((o) => {
        const insufficient = o.v === "wallet" && wallet < price;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-sm font-semibold transition ${
              value === o.v
                ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm dark:bg-brand-500/10 dark:text-brand-300"
                : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-300"
            } ${insufficient ? "opacity-50" : ""}`}
          >
            <o.icon className="h-5 w-5" />
            {o.label}
            {o.v === "wallet" && (
              <span className="font-mono text-[10px] font-medium text-slate-400">{money(wallet)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ================= start session ================= */

export function StartSessionModal({
  deviceId,
  onClose,
}: {
  deviceId?: string;
  onClose: () => void;
}) {
  const { state, startSession, toast } = useStore();
  const available = state.devices.filter((d) => d.status === "available");
  const [devId, setDevId] = useState(deviceId ?? available[0]?.id ?? "");
  const [memId, setMemId] = useState(state.members[0]?.id ?? "");
  const [mode, setMode] = useState<SessionMode>("package");
  const [pkgId, setPkgId] = useState("p1");
  const [customHours, setCustomHours] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");

  const device = state.devices.find((d) => d.id === devId);
  const [consolePlayers, setConsolePlayers] = useState<number>(() => device?.playerCount ?? 1);

  const handleDeviceSelect = (newId: string) => {
    setDevId(newId);
    const d = state.devices.find((x) => x.id === newId);
    if (d?.type === "console") {
      setConsolePlayers(d.playerCount ?? 1);
      setMode("package");
    }
  };

  const effectiveDevice = useMemo(() => {
    if (!device) return undefined;
    if (device.type === "console") {
      const rate = CONSOLE_PLAYER_RATES[consolePlayers] ?? 80;
      return {
        ...device,
        hourlyRate: rate,
        sessionHourlyRate: rate,
        playerCount: consolePlayers,
      };
    }
    return device;
  }, [device, consolePlayers]);

  const member = state.members.find((m) => m.id === memId);
  const isCustom = customHours.trim() !== "" && parseFloat(customHours) > 0;
  const hoursNum = isCustom
    ? parseFloat(customHours)
    : (PACKAGES.find((p) => p.id === pkgId)?.hours ?? 1);
  const price =
    effectiveDevice && member && mode === "package"
      ? calcSessionPrice(effectiveDevice, hoursNum, member.tier)
      : 0;
  const insufficient = method === "wallet" && member !== undefined && member.wallet < price;

  const confirm = () => {
    if (!device || !member) return;
    const res = startSession({
      deviceId: devId,
      memberId: memId,
      mode,
      pkgId: isCustom ? undefined : pkgId,
      customHours: isCustom ? parseFloat(customHours) : undefined,
      method,
      playerCount: device.type === "console" ? consolePlayers : undefined,
    });
    if (!res.ok) {
      toast(res.reason, "error");
      return;
    }
    const label = isCustom
      ? `${customHours} Hour${parseFloat(customHours) === 1 ? "" : "s"}`
      : (PACKAGES.find((p) => p.id === pkgId)?.label ?? "Package");
    toast(
      mode === "package"
        ? `Session started · ${device.name}${device.type === "console" ? ` (${consolePlayers}P)` : ""} · ${label}`
        : `Pay-as-you-go session started on ${device.name}${device.type === "console" ? ` (${consolePlayers}P)` : ""}`
    );
    onClose();
  };

  return (
    <Modal title="Start session" sub="Assign a member to an open station" onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Device">
          <select className={inputCls} value={devId} onChange={(e) => handleDeviceSelect(e.target.value)}>
            {available.length === 0 && <option value="">No stations available</option>}
            {available.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {DEVICE_META[d.type].label}{d.type === "console" && d.playerCount ? ` (${d.playerCount}P)` : ""} · {money(d.hourlyRate)}/h
              </option>
            ))}
          </select>
        </Field>
        <Field label="Member">
          <select className={inputCls} value={memId} onChange={(e) => setMemId(e.target.value)}>
            {state.members.length === 0 && <option value="">No members registered</option>}
            {state.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {TIER_META[m.tier].label} · wallet {money(m.wallet)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {device?.type === "console" && (
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/60 p-3.5 dark:border-brand-500/20 dark:bg-brand-500/5">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-xs font-bold text-brand-900 dark:text-brand-300">
              Players on single console
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              1P ₹80/h · 2P ₹140/h · 3P ₹180/h · 4P ₹200/h
            </span>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { count: 1, label: "1 Person", price: "₹80/h", sub: "Single player" },
              { count: 2, label: "2 People", price: "₹140/h", sub: "Co-op / 1v1" },
              { count: 3, label: "3 People", price: "₹180/h", sub: "Trio" },
              { count: 4, label: "4 People", price: "₹200/h", sub: "Squad / Party" },
            ].map((opt) => {
              const active = consolePlayers === opt.count;
              return (
                <button
                  key={opt.count}
                  type="button"
                  onClick={() => setConsolePlayers(opt.count)}
                  className={`flex flex-col items-center justify-center rounded-lg border p-2 text-center transition ${
                    active
                      ? "border-brand-600 bg-brand-600 text-white shadow-sm ring-2 ring-brand-500/20 dark:border-brand-500 dark:bg-brand-600"
                      : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-slate-50 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-200"
                  }`}
                >
                  <span className="text-xs font-bold">{opt.label}</span>
                  <span className={`font-mono text-xs font-extrabold ${active ? "text-white" : "text-brand-600 dark:text-brand-400"}`}>
                    {opt.price}
                  </span>
                  <span className={`text-[10px] ${active ? "text-brand-100" : "text-slate-400"}`}>
                    {opt.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {device?.type === "console" ? (
        <div className="mt-4">
          <Field label="Billing mode" hint="Console bookings are strictly pre-paid only (standard rates with no discounts)">
            <div className="flex items-center justify-between rounded-lg border border-brand-300 bg-brand-50/80 px-3.5 py-2.5 text-xs font-semibold text-brand-900 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-brand-600 dark:bg-brand-400" />
                <span className="font-bold">Pre-paid bill</span>
              </div>
              <span className="rounded bg-brand-200/70 px-2 py-0.5 text-[10px] font-bold text-brand-800 uppercase dark:bg-brand-500/20 dark:text-brand-300">
                Only Option · No Discounts
              </span>
            </div>
          </Field>
        </div>
      ) : (
        <div className="mt-4">
          <Field label="Billing mode">
            <Seg
              options={[
                { value: "package" as SessionMode, label: "Prepaid package" },
                { value: "payg" as SessionMode, label: "Pay-as-you-go" },
              ]}
              value={mode}
              onChange={setMode}
            />
          </Field>
        </div>
      )}

      {mode === "package" && effectiveDevice && member && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {PACKAGES.map((p) => {
              const pp = packagePrice(effectiveDevice, p.id, member.tier);
              const isSelected = !isCustom && pkgId === p.id;
              const tag =
                effectiveDevice.type === "pc"
                  ? p.hours > 1
                    ? "₹50/h"
                    : undefined
                  : effectiveDevice.type === "console"
                    ? undefined
                    : p.tag;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPkgId(p.id);
                    setCustomHours("");
                  }}
                  className={`relative rounded-lg border p-3 text-left transition ${
                    isSelected
                      ? "border-brand-500 bg-brand-50 shadow-sm dark:bg-brand-500/10"
                      : "border-slate-200 bg-white hover:border-brand-300 dark:border-ink-600 dark:bg-ink-800"
                  }`}
                >
                  {tag && (
                    <span className="absolute -top-2 right-2 rounded-full bg-brand-600 px-1.5 py-px text-[9px] font-bold tracking-wide text-white uppercase">
                      {tag}
                    </span>
                  )}
                  <p className={`text-sm font-bold ${isSelected ? "text-brand-700 dark:text-brand-300" : "text-slate-800 dark:text-slate-100"}`}>
                    {p.label}
                  </p>
                  <p className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">{money(pp)}</p>
                  <p className="text-[10px] text-slate-400">
                    eff. {money(pp / p.hours)}/h
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1 text-xs">
            <span className="font-medium text-slate-500 dark:text-slate-400">Or custom hours:</span>
            <input
              type="number"
              min="1"
              max="24"
              step="1"
              placeholder="e.g. 6"
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              className={`${inputCls} w-24 py-1 text-xs`}
            />
            {isCustom && effectiveDevice && (
              <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                {customHours}h = {money(price)}{" "}
                {effectiveDevice.type === "pc" && parseFloat(customHours) > 1
                  ? "(@ ₹50/h)"
                  : effectiveDevice.type === "console"
                    ? `(@ ${money(effectiveDevice.hourlyRate)}/h · Pre-paid standard rate)`
                    : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {mode === "package" && (
        <div className="mt-4">
          <Field label="Payment method">
            <MethodPicker value={method} onChange={setMethod} wallet={member?.wallet ?? 0} price={price} />
          </Field>
          {insufficient && (
            <p className="mt-2 text-xs font-medium text-rose-500">
              Wallet balance {money(member?.wallet ?? 0)} is below {money(price)} — top up or pick another method.
            </p>
          )}
        </div>
      )}

      {mode === "payg" && device && member && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-mist-50 px-4 py-3 text-sm text-slate-600 dark:border-ink-600 dark:bg-ink-900 dark:text-slate-300">
          {device.type === "pc" ? (
            <>
              Metered at <span className="font-mono font-semibold">₹60</span> for 1st hour, then{" "}
              <span className="font-mono font-semibold">₹50/h</span> for 2+ hours
            </>
          ) : device.type === "console" ? (
            <>
              Metered at <span className="font-mono font-semibold">{money(effectiveDevice?.hourlyRate ?? device.hourlyRate)}/h</span> ({consolePlayers} {consolePlayers === 1 ? "person" : "people"})
            </>
          ) : (
            <>
              Metered at <span className="font-mono font-semibold">{money(device.hourlyRate)}/h</span>
            </>
          )}
          {TIER_META[member.tier].disc > 0 && (
            <>
              {" "}with <span className="font-semibold text-brand-600 dark:text-brand-300">{TIER_META[member.tier].label} −{TIER_META[member.tier].disc * 100}%</span>
            </>
          )}
          , rounded up to 15-minute blocks. Collected when the session settles.
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-ink-700">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {mode === "package" ? (
            <>
              Due now: <span className="font-mono text-base font-bold text-slate-900 dark:text-white">{money(price)}</span>
            </>
          ) : (
            "No charge until settle"
          )}
        </p>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} onClick={confirm} disabled={!device || !member || (mode === "package" && insufficient)}>
            <Zap className="h-4 w-4" /> Start session
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= settle session ================= */

export function SettleModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { state, now, settleSession, toast } = useStore();
  const session = state.sessions.find((s) => s.id === sessionId);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<SettleInfo | null>(null);

  /* keep the receipt view alive even after the session flips to settled */
  if (receipt) {
    return (
      <Modal title="Payment complete" sub="Receipt ready — print or close" onClose={onClose}>
        <div className="flex flex-col items-center pb-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white">{money(receipt.charged)}</p>
          <p className="mt-1 text-xs text-slate-400">
            {receipt.charged === 0 ? "Covered by prepaid package" : `Paid by ${receipt.method}`}
          </p>
        </div>
        <ReceiptLines info={receipt} />
        <div className="mt-5 flex justify-end gap-2">
          <button className={btnGhost} onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print receipt
          </button>
          <button className={btnPrimary} onClick={onClose}>Done</button>
        </div>
        <PrintReceipt info={receipt} />
      </Modal>
    );
  }

  if (!session || session.status === "settled") return null;
  const device = state.devices.find((d) => d.id === session.deviceId);
  const member = state.members.find((m) => m.id === session.memberId);
  if (!device || !member) return null;

  const effRate = session.sessionHourlyRate ?? (session.playerCount ? (CONSOLE_PLAYER_RATES[session.playerCount] ?? device.hourlyRate) : device.hourlyRate);
  const effDevice = { ...device, hourlyRate: effRate, sessionHourlyRate: effRate, playerCount: session.playerCount };

  const total = elapsedMs(session, now);
  const overageMs = Math.max(0, total - session.prepaidSec * 1000);
  const charged =
    session.mode === "package"
      ? overageMs > 0
        ? device.type === "pc" || effRate === 60
          ? Math.max(
              0,
              round2(
                calcSessionPrice(
                  effDevice,
                  (Math.ceil(Math.max(1, total / 60000) / 15) * 15) / 60,
                  member.tier
                ) - session.pkgPrice
              )
            )
          : paygCharge(effDevice, overageMs, member.tier)
        : 0
      : paygCharge(effDevice, total, member.tier);
  const insufficient = method === "wallet" && member.wallet < charged;

  const confirm = () => {
    setBusy(true);
    window.setTimeout(() => {
      const res = settleSession(sessionId, method);
      setBusy(false);
      if ("error" in res) {
        toast(res.error, "error");
        return;
      }
      setReceipt(res);
      toast(`${device.name} settled · ${money(res.charged)} collected`);
    }, 650);
  };

  return (
    <Modal title="Settle session" sub={`${device.name}${session.playerCount ? ` (${session.playerCount} Players)` : ""} · ${member.name}`} onClose={onClose}>
      <div className="space-y-2 rounded-lg border border-slate-200 bg-mist-50 p-4 text-sm dark:border-ink-600 dark:bg-ink-900">
        <Row k="Play time" v={fmtDuration(total)} />
        {session.playerCount && (
          <Row k="Console Players" v={`${session.playerCount} Players (@ ${money(effRate)}/h)`} />
        )}
        {session.mode === "package" && (
          <>
            <Row k={`Package (${PACKAGES.find((p) => p.id === session.pkgId)?.label ?? "Prepaid"})`} v={money(session.pkgPrice)} />
            <Row k="Prepaid time" v={fmtDuration(session.prepaidSec * 1000)} />
            <Row
              k="Overage"
              v={overageMs > 0 ? fmtDuration(overageMs) : "—"}
              accent={overageMs > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
            />
          </>
        )}
        {session.mode === "payg" && (
          <Row k={`Rate · ${TIER_META[member.tier].label}`} v={`${money(effRate)}/h${session.playerCount ? ` (${session.playerCount}P)` : ""}${TIER_META[member.tier].disc ? ` (−${TIER_META[member.tier].disc * 100}%)` : ""}`} />
        )}
        <div className="my-1 border-t border-dashed border-slate-300 dark:border-ink-600" />
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700 dark:text-slate-200">Due now</span>
          <span className="font-mono text-xl font-bold text-slate-900 dark:text-white">{money(charged)}</span>
        </div>
      </div>

      {charged > 0 ? (
        <div className="mt-4">
          <Field label="Payment method">
            <MethodPicker value={method} onChange={setMethod} wallet={member.wallet} price={charged} />
          </Field>
          {insufficient && (
            <p className="mt-2 text-xs font-medium text-rose-500">
              Wallet holds {money(member.wallet)} — not enough for {money(charged)}.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          Fully covered by prepaid time — nothing to collect.
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} onClick={confirm} disabled={busy || (charged > 0 && insufficient)}>
          {busy ? <Loader2 className="spin h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {busy ? "Processing…" : charged > 0 ? `Collect ${money(charged)}` : "Release station"}
        </button>
      </div>
    </Modal>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500 dark:text-slate-400">{k}</span>
      <span className={`font-mono font-semibold text-slate-800 dark:text-slate-100 ${accent ?? ""}`}>{v}</span>
    </div>
  );
}

export function ReceiptLines({ info }: { info: SettleInfo }) {
  return (
    <div className="mt-4 space-y-1.5 rounded-lg border border-dashed border-slate-300 p-4 font-mono text-xs text-slate-600 dark:border-ink-600 dark:text-slate-300">
      <div className="flex flex-col items-center justify-center mb-1.5">
        <img
          src={logoImg}
          alt="GameNation Logo"
          className="h-9 w-9 rounded-full object-cover shadow-sm ring-1 ring-slate-300 dark:ring-ink-600"
        />
        <p className="mt-1.5 text-center text-sm font-bold tracking-widest text-slate-900 dark:text-white">GameNation GAMING</p>
        <p className="text-center text-[10px] text-slate-400">12 Volt Alley · License #GC-2214</p>
      </div>
      <div className="my-2 border-t border-dashed border-slate-300 dark:border-ink-600" />
      <Row k="Station" v={info.device.name} />
      {info.playerCount && <Row k="Console Players" v={`${info.playerCount} Players`} />}
      <Row k="Member" v={`${info.member.name} (${TIER_META[info.member.tier].label})`} />
      <Row k="Play time" v={fmtDuration(info.elapsedMsTotal)} />
      {info.pkgLabel && <Row k={`Package · ${info.pkgLabel}`} v={money(info.pkgPrice)} />}
      {info.overageMs > 0 && <Row k="Overage" v={fmtDuration(info.overageMs)} />}
      <div className="my-2 border-t border-dashed border-slate-300 dark:border-ink-600" />
      <div className="flex items-center justify-between text-sm font-bold text-slate-900 dark:text-white">
        <span>TOTAL</span>
        <span>{money(info.charged + info.pkgPrice)}</span>
      </div>
      <p className="pt-1 text-center text-[10px] text-slate-400">
        {fmtDateFull(Date.now())} {fmtTime(Date.now())} · paid via {info.method} · GLHF!
      </p>
    </div>
  );
}

function PrintReceipt({ info }: { info: SettleInfo }) {
  return (
    <div className="print-only">
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <img
          src={logoImg}
          alt="GameNation"
          style={{ width: 44, height: 44, borderRadius: "50%", margin: "0 auto 6px", display: "block" }}
        />
        <h1 style={{ textAlign: "center", fontSize: 20, letterSpacing: 4, margin: 0 }}>GameNation GAMING</h1>
        <p style={{ textAlign: "center", fontSize: 11, margin: "2px 0 0" }}>12 Volt Alley · License #GC-2214</p>
      </div>
      <hr style={{ borderStyle: "dashed" }} />
      <p>Station ....... {info.device.name}</p>
      {info.playerCount && <p>Players ........ {info.playerCount} Players</p>}
      <p>Member ........ {info.member.name} ({TIER_META[info.member.tier].label})</p>
      <p>Play time ..... {fmtDuration(info.elapsedMsTotal)}</p>
      {info.pkgLabel && <p>Package ....... {info.pkgLabel} — {money(info.pkgPrice)}</p>}
      {info.overageMs > 0 && <p>Overage ....... {fmtDuration(info.overageMs)}</p>}
      <hr style={{ borderStyle: "dashed" }} />
      <p style={{ fontSize: 16, fontWeight: 700 }}>TOTAL ......... {money(info.charged + info.pkgPrice)}</p>
      <p style={{ fontSize: 11 }}>
        {fmtDateFull(Date.now())} {fmtTime(Date.now())} · paid via {info.method}
      </p>
      <p style={{ textAlign: "center", marginTop: 16, fontSize: 11 }}>Thanks for playing — GLHF!</p>
    </div>
  );
}

/* ================= extend session ================= */

export function ExtendModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { state, extendSession, toast } = useStore();
  const session = state.sessions.find((s) => s.id === sessionId);
  const [pkgId, setPkgId] = useState("p1");
  const [method, setMethod] = useState<PayMethod>("cash");

  if (!session || session.status === "settled") return null;
  const device = state.devices.find((d) => d.id === session.deviceId);
  const member = state.members.find((m) => m.id === session.memberId);
  if (!device || !member) return null;

  const effRate = session.sessionHourlyRate ?? (session.playerCount ? (CONSOLE_PLAYER_RATES[session.playerCount] ?? device.hourlyRate) : device.hourlyRate);
  const effDevice = { ...device, hourlyRate: effRate, sessionHourlyRate: effRate, playerCount: session.playerCount };

  const getExtendPrice = (pId: string) => {
    const p = PACKAGES.find((x) => x.id === pId);
    if (!p) return 0;
    if (device.type === "pc" || effRate === 60) {
      const currentHours = session.prepaidSec / 3600;
      const targetHours = currentHours + p.hours;
      const targetCost = calcSessionPrice(effDevice, targetHours, member.tier);
      return Math.max(0, round2(targetCost - session.pkgPrice));
    }
    return packagePrice(effDevice, p.id, member.tier);
  };

  const price = getExtendPrice(pkgId);
  const insufficient = method === "wallet" && member.wallet < price;

  return (
    <Modal title="Extend session" sub={`${device.name}${session.playerCount ? ` · ${session.playerCount} Players (@ ${money(effRate)}/h)` : ""} · adds prepaid time instantly`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {PACKAGES.map((p) => {
          const pp = getExtendPrice(p.id);
          return (
            <button
              key={p.id}
              onClick={() => setPkgId(p.id)}
              className={`rounded-lg border p-3 text-left transition ${
                pkgId === p.id
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                  : "border-slate-200 bg-white hover:border-brand-300 dark:border-ink-600 dark:bg-ink-800"
              }`}
            >
              <p className={`text-sm font-bold ${pkgId === p.id ? "text-brand-700 dark:text-brand-300" : "text-slate-800 dark:text-slate-100"}`}>
                +{p.label}
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-white">{money(pp)}</p>
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        <Field label="Payment method">
          <MethodPicker value={method} onChange={setMethod} wallet={member.wallet} price={price} />
        </Field>
        {insufficient && (
          <p className="mt-2 text-xs font-medium text-rose-500">Insufficient wallet balance.</p>
        )}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-ink-700">
        <p className="font-mono text-base font-bold text-slate-900 dark:text-white">{money(price)}</p>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button
            className={btnPrimary}
            disabled={insufficient}
            onClick={() => {
              const res = extendSession(sessionId, pkgId, method);
              if (!res.ok) {
                toast(res.reason, "error");
                return;
              }
              toast(`Added ${PACKAGES.find((p) => p.id === pkgId)!.label} to ${device.name}`);
              onClose();
            }}
          >
            <Zap className="h-4 w-4" /> Add time
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= device form ================= */

export function DeviceFormModal({ device, onClose }: { device?: Device; onClose: () => void }) {
  const { addDevice, updateDevice, toast } = useStore();
  const [name, setName] = useState(device?.name ?? "");
  const [type, setType] = useState<DeviceType>(device?.type ?? "pc");
  const [zone, setZone] = useState(device?.zone ?? ZONES[0]);
  const [playerCount, setPlayerCount] = useState<number>(() => {
    if (device?.playerCount) return device.playerCount;
    if (device?.type === "console") {
      if (device.hourlyRate === 140) return 2;
      if (device.hourlyRate === 180) return 3;
      if (device.hourlyRate === 200) return 4;
    }
    return 1;
  });
  const [rate, setRate] = useState(
    String(
      device?.hourlyRate ??
        (device?.type === "pc"
          ? 60
          : device?.type === "console"
            ? (CONSOLE_PLAYER_RATES[playerCount] ?? 80)
            : !device
              ? 60
              : 80)
    )
  );
  const [specs, setSpecs] = useState(device?.specs ?? "");
  const [status, setStatus] = useState<DeviceStatus>(device?.status ?? "available");
  const [err, setErr] = useState("");

  const handleTypeChange = (newType: DeviceType) => {
    setType(newType);
    if (!device) {
      if (newType === "pc") setRate("60");
      else if (newType === "console") setRate(String(CONSOLE_PLAYER_RATES[playerCount] ?? 80));
      else if (newType === "vr") setRate("120");
      else if (newType === "sim") setRate("150");
    }
  };

  const handlePlayerCountSelect = (count: number) => {
    setPlayerCount(count);
    const pRate = CONSOLE_PLAYER_RATES[count] ?? 80;
    setRate(String(pRate));
  };

  const submit = () => {
    const r = parseFloat(rate);
    if (!name.trim()) return setErr("Device name is required.");
    if (!Number.isFinite(r) || r <= 0) return setErr("Hourly rate must be a positive number.");
    if (device) {
      updateDevice(device.id, {
        name: name.trim(),
        type,
        zone,
        hourlyRate: r,
        playerCount: type === "console" ? playerCount : undefined,
        specs: specs.trim(),
        status,
      });
      toast(`${name.trim()} updated`);
    } else {
      addDevice({
        name: name.trim(),
        type,
        zone,
        hourlyRate: r,
        playerCount: type === "console" ? playerCount : undefined,
        specs: specs.trim(),
        status: "available",
      });
      toast(`${name.trim()} added to the floor`);
    }
    onClose();
  };

  return (
    <Modal title={device ? "Edit device" : "Add device"} sub={device ? device.name : "New station on the floor"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Arena A-05" />
          </Field>
        </div>
        <Field label="Type">
          <select className={inputCls} value={type} onChange={(e) => handleTypeChange(e.target.value as DeviceType)}>
            {(Object.keys(DEVICE_META) as DeviceType[]).map((t) => (
              <option key={t} value={t}>{DEVICE_META[t].label}</option>
            ))}
          </select>
        </Field>
        <Field label="Zone">
          <select className={inputCls} value={zone} onChange={(e) => setZone(e.target.value)}>
            {ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </Field>

        {type === "console" && (
          <div className="col-span-2 rounded-xl border border-brand-200 bg-brand-50/70 p-3.5 dark:border-brand-500/20 dark:bg-brand-500/5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <div>
                <label className="text-xs font-bold text-brand-900 dark:text-brand-300">
                  Number of players on console
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Select players to automatically update the hourly rate
                </p>
              </div>
              <span className="rounded-md bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                Single console pricing
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { count: 1, label: "1 Person", price: "₹80/hr", sub: "Single player" },
                { count: 2, label: "2 People", price: "₹140/hr", sub: "Co-op / 1v1" },
                { count: 3, label: "3 People", price: "₹180/hr", sub: "Trio" },
                { count: 4, label: "4 People", price: "₹200/hr", sub: "Squad / Party" },
              ].map((opt) => {
                const active = playerCount === opt.count;
                return (
                  <button
                    key={opt.count}
                    type="button"
                    onClick={() => handlePlayerCountSelect(opt.count)}
                    className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition ${
                      active
                        ? "border-brand-600 bg-brand-600 text-white shadow-sm ring-2 ring-brand-500/25 dark:border-brand-500 dark:bg-brand-600"
                        : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-slate-50 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-200"
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className={`mt-0.5 font-mono text-sm font-extrabold ${active ? "text-white" : "text-slate-900 dark:text-white"}`}>
                      {opt.price}
                    </span>
                    <span className={`text-[10px] ${active ? "text-brand-100" : "text-slate-400"}`}>
                      {opt.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Field
          label="Hourly rate (₹)"
          hint={type === "console" ? `${playerCount} player(s) selected: ₹${CONSOLE_PLAYER_RATES[playerCount] ?? 80}/hr` : undefined}
        >
          <input className={inputCls} type="number" min="1" step="1" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        {device ? (
          <Field label="Status">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as DeviceStatus)}>
              {(Object.keys(STATUS_META) as DeviceStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Initial status" hint="New devices start as Available">
            <input className={`${inputCls} opacity-60`} value="Available" disabled />
          </Field>
        )}
        <div className="col-span-2">
          <Field label="Specs">
            <input className={inputCls} value={specs} onChange={(e) => setSpecs(e.target.value)} placeholder="RTX 4070 · i7 · 240 Hz" />
          </Field>
        </div>
      </div>
      {err && <p className="mt-3 text-xs font-medium text-rose-500">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} onClick={submit}>{device ? "Save changes" : "Add device"}</button>
      </div>
    </Modal>
  );
}

/* ================= bulk import ================= */

export function ImportDevicesModal({ onClose }: { onClose: () => void }) {
  const { importDevices, toast } = useStore();
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  const parsed = useMemo(() => {
    const rows: { name: string; type: DeviceType; zone: string; hourlyRate: number; specs: string }[] = [];
    const errors: string[] = [];
    text.split("\n").forEach((line, i) => {
      const l = line.trim();
      if (!l) return;
      const parts = l.split(",").map((p) => p.trim());
      const [name, type, zone, rate, specs = ""] = parts;
      const r = parseFloat(rate);
      if (!name || !["pc", "console", "vr", "sim"].includes(type) || !zone || !Number.isFinite(r) || r <= 0) {
        errors.push(`Line ${i + 1}: expected "name, type(pc|console|vr|sim), zone, rate, specs"`);
        return;
      }
      rows.push({ name, type: type as DeviceType, zone, hourlyRate: r, specs });
    });
    return { rows, errors };
  }, [text]);

  return (
    <Modal title="Bulk import devices" sub="CSV — one device per line" onClose={onClose} wide>
      <Field label="Paste CSV" hint='Format: name, type (pc | console | vr | sim), zone, hourly rate, specs'>
        <textarea
          className={`${inputCls} h-36 font-mono text-xs leading-relaxed`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g.&#10;Arena C-01, pc, Arena A, 4.0, RTX 4060 · 165 Hz&#10;VR Bay 4, vr, VR Bay, 8, Quest 3 · mixed-reality"
          spellCheck={false}
        />
      </Field>
      {parsed.errors.length > 0 && (
        <div className="mt-3 space-y-1 rounded-lg bg-rose-50 px-3 py-2 dark:bg-rose-500/10">
          {parsed.errors.map((e, i) => (
            <p key={i} className="text-xs font-medium text-rose-600 dark:text-rose-300">{e}</p>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-mono font-bold text-brand-600 dark:text-brand-300">{parsed.rows.length}</span> device
          {parsed.rows.length === 1 ? "" : "s"} ready to import
        </p>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button
            className={btnPrimary}
            disabled={parsed.rows.length === 0 || parsed.errors.length > 0}
            onClick={() => {
              const n = importDevices(parsed.rows);
              toast(`${n} device${n === 1 ? "" : "s"} imported to the floor`);
              onClose();
            }}
          >
            Import {parsed.rows.length || ""}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= member form ================= */

export function MemberFormModal({ member, onClose }: { member?: Member; onClose: () => void }) {
  const { addMember, updateMember, toast } = useStore();
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [tier, setTier] = useState<Tier>(member?.tier ?? "regular");
  const [wallet, setWallet] = useState(String(member?.wallet ?? 0));
  const [err, setErr] = useState("");

  const submit = () => {
    const w = parseFloat(wallet);
    if (!name.trim()) return setErr("Name is required.");
    if (!Number.isFinite(w) || w < 0) return setErr("Wallet must be zero or more.");
    if (member) {
      updateMember(member.id, { name: name.trim(), email: email.trim(), phone: phone.trim(), tier, wallet: w });
      toast(`${name.trim()} updated`);
    } else {
      addMember({ name: name.trim(), email: email.trim(), phone: phone.trim(), tier, wallet: w });
      toast(`${name.trim()} registered`);
    }
    onClose();
  };

  return (
    <Modal title={member ? "Edit member" : "Register member"} sub={member ? member.name : "New player profile"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Full name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Pixel" />
          </Field>
        </div>
        <Field label="Email">
          <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@mail.com" />
        </Field>
        <Field label="Phone">
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="555-0100" />
        </Field>
        <Field label="Membership tier">
          <select className={inputCls} value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
            {(Object.keys(TIER_META) as Tier[]).map((t) => (
              <option key={t} value={t}>
                {TIER_META[t].label} — {TIER_META[t].blurb}
              </option>
            ))}
          </select>
        </Field>
        <Field label={member ? "Wallet balance (₹)" : "Initial wallet (₹)"}>
          <input className={inputCls} type="number" min="0" step="1" value={wallet} onChange={(e) => setWallet(e.target.value)} />
        </Field>
      </div>
      {err && <p className="mt-3 text-xs font-medium text-rose-500">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} onClick={submit}>{member ? "Save changes" : "Register"}</button>
      </div>
    </Modal>
  );
}

/* ================= wallet top-up ================= */

export function TopUpModal({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const { state, topUp, toast } = useStore();
  const member = state.members.find((m) => m.id === memberId);
  const [amount, setAmount] = useState("100");
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");

  if (!member) return null;
  const final = parseFloat(custom) || parseFloat(amount) || 0;

  return (
    <Modal title="Top up wallet" sub={`${member.name} · current ${money(member.wallet)}`} onClose={onClose}>
      <div className="grid grid-cols-4 gap-2">
        {["50", "100", "200", "500"].map((a) => (
          <button
            key={a}
            onClick={() => {
              setAmount(a);
              setCustom("");
            }}
            className={`rounded-lg border py-3 font-mono text-base font-bold transition ${
              amount === a && !custom
                ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-200"
            }`}
          >
            ₹{a}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <Field label="Custom amount (₹)">
          <input className={inputCls} type="number" min="1" step="1" placeholder="0" value={custom} onChange={(e) => setCustom(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Payment method">
          <MethodPicker value={method} onChange={setMethod} wallet={Number.MAX_SAFE_INTEGER} price={0} />
        </Field>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-ink-700">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          New balance: <span className="font-mono font-bold text-slate-900 dark:text-white">{money(member.wallet + final)}</span>
        </p>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button
            className={btnPrimary}
            disabled={final <= 0}
            onClick={() => {
              topUp(member.id, final, method);
              toast(`${money(final)} added to ${member.name}'s wallet`);
              onClose();
            }}
          >
            <WalletIcon className="h-4 w-4" /> Add {final > 0 ? money(final) : ""}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= confirm ================= */

export function ConfirmModal({
  title,
  sub,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  sub: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} sub={sub} onClose={onClose}>
      <div className="mt-2 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>Cancel</button>
        <button
          className={btnDanger}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ================= reservation modal ================= */

export function ReservationModal({
  initialDeviceId,
  initialDeviceType,
  onClose,
}: {
  initialDeviceId?: string;
  initialDeviceType?: "pc" | "console";
  onClose: () => void;
}) {
  const { state, now, addReservation, toast } = useStore();

  // Filter to PCs and Consoles
  const eligibleDevices = useMemo(() => {
    const primary = state.devices.filter((d) => d.type === "pc" || d.type === "console");
    return primary.length > 0 ? primary : state.devices;
  }, [state.devices]);

  const defaultDevId = useMemo(() => {
    if (initialDeviceId && state.devices.some((d) => d.id === initialDeviceId)) {
      return initialDeviceId;
    }
    if (initialDeviceType) {
      const match = eligibleDevices.find((d) => d.type === initialDeviceType);
      if (match) return match.id;
    }
    return eligibleDevices[0]?.id ?? "";
  }, [initialDeviceId, initialDeviceType, eligibleDevices, state.devices]);

  const [devId, setDevId] = useState(defaultDevId);
  const device = state.devices.find((d) => d.id === devId);

  // Active session on this device
  const activeSession = useMemo(() => {
    return state.sessions.find((s) => s.deviceId === devId && s.status !== "settled");
  }, [state.sessions, devId]);

  const remainingMs = useMemo(() => {
    if (!activeSession) return 0;
    return Math.max(0, activeSession.prepaidSec * 1000 - elapsedMs(activeSession, now));
  }, [activeSession, now]);

  const projectedFreeTime = useMemo(() => {
    return now + remainingMs;
  }, [now, remainingMs]);

  // Customer state
  const [customerMode, setCustomerMode] = useState<"member" | "guest">(
    state.members.length > 0 ? "member" : "guest"
  );
  const [memId, setMemId] = useState(state.members[0]?.id ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  // Timing state based on live time
  const [startMs, setStartMs] = useState(now);
  const [durationHours, setDurationHours] = useState(1);
  const [consolePlayers, setConsolePlayers] = useState<number>(() => device?.playerCount ?? 1);
  const [notes, setNotes] = useState("");

  const handleDeviceChange = (newId: string) => {
    setDevId(newId);
    const d = state.devices.find((x) => x.id === newId);
    if (d?.type === "console") {
      setConsolePlayers(d.playerCount ?? 1);
    }
  };

  const selectedMember = state.members.find((m) => m.id === memId);

  // Effective device and price
  const effDevice = useMemo(() => {
    if (!device) return undefined;
    if (device.type === "console") {
      const rate = CONSOLE_PLAYER_RATES[consolePlayers] ?? 80;
      return {
        ...device,
        hourlyRate: rate,
        sessionHourlyRate: rate,
        playerCount: consolePlayers,
      };
    }
    return device;
  }, [device, consolePlayers]);

  const estimatedPrice = useMemo(() => {
    if (!effDevice) return 0;
    return calcSessionPrice(effDevice, durationHours, selectedMember?.tier ?? "regular");
  }, [effDevice, durationHours, selectedMember]);

  // Format start time for input: YYYY-MM-DDTHH:mm
  const formatDateTimeLocal = (ms: number) => {
    const d = new Date(ms);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleDateTimeInput = (val: string) => {
    if (!val) return;
    const parsed = new Date(val).getTime();
    if (!isNaN(parsed)) {
      setStartMs(parsed);
    }
  };

  const confirm = () => {
    if (!device) {
      toast("Please select a valid station", "error");
      return;
    }
    const cName = customerMode === "member" ? (selectedMember?.name ?? "") : guestName.trim();
    if (!cName) {
      toast("Please provide or select customer name", "error");
      return;
    }
    const cPhone = customerMode === "member" ? (selectedMember?.phone ?? "") : guestPhone.trim();

    const res = addReservation({
      deviceId: devId,
      deviceType: device.type,
      memberId: customerMode === "member" ? memId : undefined,
      customerName: cName,
      customerPhone: cPhone,
      startTime: startMs,
      durationHours,
      playerCount: device.type === "console" ? consolePlayers : undefined,
      notes: notes.trim() || undefined,
      estimatedAmount: estimatedPrice,
    });

    if (!res.ok) {
      toast(res.reason, "error");
      return;
    }

    toast(`Reservation confirmed: ${device.name} · ${fmtTime(startMs)} (${durationHours}h)`);
    onClose();
  };

  return (
    <Modal
      title="Book next reservation"
      sub="Reserve PC & Console stations ahead of time using live floor scheduling"
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        {/* Device selection */}
        <div>
          <Field label="Select Station (PC or Console)">
            <select className={inputCls} value={devId} onChange={(e) => handleDeviceChange(e.target.value)}>
              {eligibleDevices.length === 0 && <option value="">No stations registered</option>}
              {eligibleDevices.map((d) => {
                const isBusy = state.sessions.some((s) => s.deviceId === d.id && s.status !== "settled");
                return (
                  <option key={d.id} value={d.id}>
                    {d.name} · {DEVICE_META[d.type].label}
                    {d.type === "console" ? ` (Console Lounge)` : ` (${d.zone})`}
                    {isBusy ? " · [Currently In Use]" : " · [Available Now]"}
                  </option>
                );
              })}
            </select>
          </Field>

          {/* Device status badge */}
          {device && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs dark:border-ink-700 dark:bg-ink-800/60">
              <div className="flex items-center gap-2">
                {device.type === "console" ? (
                  <Gamepad2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                ) : (
                  <Monitor className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                )}
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {device.name} ({DEVICE_META[device.type].label})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {activeSession ? (
                  <span className="flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    <Clock className="h-3 w-3" />
                    In use · frees up ~{fmtTime(projectedFreeTime)} ({Math.ceil(remainingMs / 60000)}m left)
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Free right now
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Live time slot picker */}
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3.5 dark:border-brand-500/25 dark:bg-brand-500/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-brand-900 dark:text-brand-200">
              <CalendarClock className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              Schedule Start Time (Live Time: {fmtTime(now)})
            </span>
            <span className="font-mono text-[11px] font-semibold text-brand-700 dark:text-brand-300">
              Starts: {fmtTime(startMs)}
            </span>
          </div>

          {/* Quick timing shortcuts */}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStartMs(now)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand-500 hover:text-brand-600 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-200"
            >
              Right Now
            </button>
            <button
              type="button"
              onClick={() => setStartMs(now + 15 * 60000)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand-500 hover:text-brand-600 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-200"
            >
              +15 mins
            </button>
            <button
              type="button"
              onClick={() => setStartMs(now + 30 * 60000)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand-500 hover:text-brand-600 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-200"
            >
              +30 mins
            </button>
            <button
              type="button"
              onClick={() => setStartMs(now + 60 * 60000)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand-500 hover:text-brand-600 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-200"
            >
              +1 hour
            </button>
            {activeSession && remainingMs > 0 && (
              <button
                type="button"
                onClick={() => setStartMs(projectedFreeTime)}
                className="flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 shadow-sm transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
              >
                <Clock className="h-3 w-3" />
                When Free ({fmtTime(projectedFreeTime)})
              </button>
            )}
          </div>

          <div className="mt-3">
            <Field label="Or pick exact date & time">
              <input
                type="datetime-local"
                value={formatDateTimeLocal(startMs)}
                onChange={(e) => handleDateTimeInput(e.target.value)}
                className={`${inputCls} text-xs`}
              />
            </Field>
          </div>
        </div>

        {/* Console players picker (if console) */}
        {device?.type === "console" && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3.5 dark:border-brand-500/20 dark:bg-brand-500/5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-bold text-brand-900 dark:text-brand-300">
                Players on Console (Pre-paid Bill · No Discounts)
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                1P ₹80/h · 2P ₹140/h · 3P ₹180/h · 4P ₹200/h
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { count: 1, label: "1 Person", price: "₹80/h" },
                { count: 2, label: "2 People", price: "₹140/h" },
                { count: 3, label: "3 People", price: "₹180/h" },
                { count: 4, label: "4 People", price: "₹200/h" },
              ].map((opt) => {
                const active = consolePlayers === opt.count;
                return (
                  <button
                    key={opt.count}
                    type="button"
                    onClick={() => setConsolePlayers(opt.count)}
                    className={`flex flex-col items-center justify-center rounded-lg border p-2 text-center transition ${
                      active
                        ? "border-brand-600 bg-brand-600 text-white shadow-sm ring-2 ring-brand-500/20 dark:border-brand-500 dark:bg-brand-600"
                        : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-slate-50 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-200"
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className={`font-mono text-xs font-extrabold ${active ? "text-white" : "text-brand-600 dark:text-brand-400"}`}>
                      {opt.price}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Duration picker */}
        <div>
          <Field label="Duration (Hours)">
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setDurationHours(h)}
                  className={`rounded-lg border py-2 text-center text-xs font-bold transition ${
                    durationHours === h
                      ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-200"
                  }`}
                >
                  {h} {h === 1 ? "Hour" : "Hours"}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* Customer info */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Customer Details</span>
            <div className="flex rounded-md border border-slate-200 p-0.5 text-xs dark:border-ink-600">
              <button
                type="button"
                onClick={() => setCustomerMode("member")}
                className={`rounded px-2 py-0.5 font-semibold transition ${
                  customerMode === "member"
                    ? "bg-brand-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                Member
              </button>
              <button
                type="button"
                onClick={() => setCustomerMode("guest")}
                className={`rounded px-2 py-0.5 font-semibold transition ${
                  customerMode === "guest"
                    ? "bg-brand-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                Walk-in / Guest
              </button>
            </div>
          </div>

          {customerMode === "member" ? (
            <Field label="Select Registered Member">
              <select className={inputCls} value={memId} onChange={(e) => setMemId(e.target.value)}>
                {state.members.length === 0 && <option value="">No members registered</option>}
                {state.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.phone || "No phone"} · {TIER_META[m.tier].label}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Guest Name">
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Phone (Optional)">
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          )}
        </div>

        {/* Notes */}
        <Field label="Special Requests / Notes (Optional)">
          <input
            type="text"
            placeholder="e.g. Needs FIFA installed, dual controllers, tournament practice"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
          />
        </Field>

        {/* Pricing Summary & Confirmation Box */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-ink-700 dark:bg-ink-800/60">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2 text-xs text-slate-500 dark:border-ink-700/60 dark:text-slate-400">
            <span>Slot Breakdown</span>
            <span>
              {device?.type === "console" ? (
                <span className="font-semibold text-brand-600 dark:text-brand-400">
                  Pre-paid bill only · No discounts on console
                </span>
              ) : (
                <span className="font-semibold text-brand-600 dark:text-brand-400">
                  {durationHours === 1 ? "1h @ ₹60" : `${durationHours}h @ ₹50/h`}
                </span>
              )}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between">
            <div>
              <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                {device?.name} · {durationHours} {durationHours === 1 ? "Hour" : "Hours"}
                {device?.type === "console" ? ` (${consolePlayers}P)` : ""}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {fmtDate(startMs)}, {fmtTime(startMs)} → {fmtTime(startMs + durationHours * 3600 * 1000)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-medium text-slate-400">Estimated Pre-paid Bill</span>
              <p className="font-mono text-xl font-bold text-slate-900 dark:text-white">
                {money(estimatedPrice)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={confirm}>
            <CalendarClock className="h-4 w-4" />
            Confirm Reservation
          </button>
        </div>
      </div>
    </Modal>
  );
}


