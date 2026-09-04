import { useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Printer,
  Wallet as WalletIcon,
  Zap,
} from "lucide-react";
import { useStore, type SettleInfo } from "./store";
import {
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
  elapsedMs,
  fmtDateFull,
  fmtDuration,
  fmtTime,
  money,
  packagePrice,
  paygCharge,
} from "./utils";
import { btnDanger, btnGhost, btnPrimary, Field, inputCls, Modal, Seg } from "./ui";

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
  const [pkgId, setPkgId] = useState("p2");
  const [method, setMethod] = useState<PayMethod>("cash");

  const device = state.devices.find((d) => d.id === devId);
  const member = state.members.find((m) => m.id === memId);
  const price = device && member && mode === "package" ? packagePrice(device.hourlyRate, pkgId, member.tier) : 0;
  const insufficient = method === "wallet" && member !== undefined && member.wallet < price;

  const confirm = () => {
    if (!device || !member) return;
    const res = startSession({ deviceId: devId, memberId: memId, mode, pkgId: mode === "package" ? pkgId : undefined, method });
    if (!res.ok) {
      toast(res.reason, "error");
      return;
    }
    toast(
      mode === "package"
        ? `Session started · ${device.name} · ${PACKAGES.find((p) => p.id === pkgId)!.label}`
        : `Pay-as-you-go session started on ${device.name}`
    );
    onClose();
  };

  return (
    <Modal title="Start session" sub="Assign a member to an open station" onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Device">
          <select className={inputCls} value={devId} onChange={(e) => setDevId(e.target.value)}>
            {available.length === 0 && <option value="">No stations available</option>}
            {available.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {DEVICE_META[d.type].label} · ${d.hourlyRate.toFixed(2)}/h
              </option>
            ))}
          </select>
        </Field>
        <Field label="Member">
          <select className={inputCls} value={memId} onChange={(e) => setMemId(e.target.value)}>
            {state.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {TIER_META[m.tier].label} · wallet {money(m.wallet)}
              </option>
            ))}
          </select>
        </Field>
      </div>

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

      {mode === "package" && device && member && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PACKAGES.map((p) => {
            const pp = packagePrice(device.hourlyRate, p.id, member.tier);
            return (
              <button
                key={p.id}
                onClick={() => setPkgId(p.id)}
                className={`relative rounded-lg border p-3 text-left transition ${
                  pkgId === p.id
                    ? "border-brand-500 bg-brand-50 shadow-sm dark:bg-brand-500/10"
                    : "border-slate-200 bg-white hover:border-brand-300 dark:border-ink-600 dark:bg-ink-800"
                }`}
              >
                {p.tag && (
                  <span className="absolute -top-2 right-2 rounded-full bg-brand-600 px-1.5 py-px text-[9px] font-bold tracking-wide text-white uppercase">
                    {p.tag}
                  </span>
                )}
                <p className={`text-sm font-bold ${pkgId === p.id ? "text-brand-700 dark:text-brand-300" : "text-slate-800 dark:text-slate-100"}`}>
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
          Metered at <span className="font-mono font-semibold">{money(device.hourlyRate)}/h</span>
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

  const total = elapsedMs(session, now);
  const overageMs = Math.max(0, total - session.prepaidSec * 1000);
  const charged =
    session.mode === "package"
      ? overageMs > 0
        ? paygCharge(device.hourlyRate, overageMs, member.tier)
        : 0
      : paygCharge(device.hourlyRate, total, member.tier);
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
    <Modal title="Settle session" sub={`${device.name} · ${member.name}`} onClose={onClose}>
      <div className="space-y-2 rounded-lg border border-slate-200 bg-mist-50 p-4 text-sm dark:border-ink-600 dark:bg-ink-900">
        <Row k="Play time" v={fmtDuration(total)} />
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
          <Row k={`Rate · ${TIER_META[member.tier].label}`} v={`${money(device.hourlyRate)}/h${TIER_META[member.tier].disc ? ` (−${TIER_META[member.tier].disc * 100}%)` : ""}`} />
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
      <p className="text-center text-sm font-bold tracking-widest text-slate-900 dark:text-white">BLUESHIFT GAMING</p>
      <p className="text-center text-[10px] text-slate-400">12 Volt Alley · License #GC-2214</p>
      <div className="my-2 border-t border-dashed border-slate-300 dark:border-ink-600" />
      <Row k="Station" v={info.device.name} />
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
      <h1 style={{ textAlign: "center", fontSize: 20, letterSpacing: 4 }}>BLUESHIFT GAMING</h1>
      <p style={{ textAlign: "center", fontSize: 11 }}>12 Volt Alley · License #GC-2214</p>
      <hr style={{ borderStyle: "dashed" }} />
      <p>Station ....... {info.device.name}</p>
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

  const price = packagePrice(device.hourlyRate, pkgId, member.tier);
  const insufficient = method === "wallet" && member.wallet < price;

  return (
    <Modal title="Extend session" sub={`${device.name} · adds prepaid time instantly`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {PACKAGES.map((p) => {
          const pp = packagePrice(device.hourlyRate, p.id, member.tier);
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
  const [rate, setRate] = useState(String(device?.hourlyRate ?? 4));
  const [specs, setSpecs] = useState(device?.specs ?? "");
  const [status, setStatus] = useState<DeviceStatus>(device?.status ?? "available");
  const [err, setErr] = useState("");

  const submit = () => {
    const r = parseFloat(rate);
    if (!name.trim()) return setErr("Device name is required.");
    if (!Number.isFinite(r) || r <= 0) return setErr("Hourly rate must be a positive number.");
    if (device) {
      updateDevice(device.id, { name: name.trim(), type, zone, hourlyRate: r, specs: specs.trim(), status });
      toast(`${name.trim()} updated`);
    } else {
      addDevice({ name: name.trim(), type, zone, hourlyRate: r, specs: specs.trim(), status: "available" });
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
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as DeviceType)}>
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
        <Field label="Hourly rate ($)">
          <input className={inputCls} type="number" min="0.5" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
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
  const [text, setText] = useState("Arena C-01, pc, Arena A, 4.0, RTX 4060 · 165 Hz\nVR Bay 4, vr, VR Bay, 8, Quest 3 · mixed-reality");
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
        <Field label={member ? "Wallet balance ($)" : "Initial wallet ($)"}>
          <input className={inputCls} type="number" min="0" step="0.5" value={wallet} onChange={(e) => setWallet(e.target.value)} />
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
  const [amount, setAmount] = useState("20");
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");

  if (!member) return null;
  const final = parseFloat(custom) || parseFloat(amount) || 0;

  return (
    <Modal title="Top up wallet" sub={`${member.name} · current ${money(member.wallet)}`} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2">
        {["10", "20", "50"].map((a) => (
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
            ${a}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <Field label="Custom amount ($)">
          <input className={inputCls} type="number" min="1" step="0.5" placeholder="0.00" value={custom} onChange={(e) => setCustom(e.target.value)} />
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


