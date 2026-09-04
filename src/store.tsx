import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { seedDevices, seedMembers, seedSessions, seedTransactions } from "./data";
import {
  PACKAGES,
  type Device,
  type DeviceStatus,
  type Member,
  type PayMethod,
  type Role,
  type Session,
  type SessionMode,
  type Tier,
  type Tx,
} from "./types";
import { elapsedMs, packagePrice, paygCharge, round2, uid } from "./utils";

export interface AppState {
  devices: Device[];
  members: Member[];
  sessions: Session[];
  transactions: Tx[];
}

export interface Alert {
  id: string;
  sev: "danger" | "warn" | "info";
  title: string;
  sub: string;
}

export interface Toast {
  id: string;
  kind: "success" | "error" | "info";
  msg: string;
}

type Result = { ok: true } | { ok: false; reason: string };

export interface SettleInfo {
  charged: number;
  elapsedMsTotal: number;
  overageMs: number;
  device: Device;
  member: Member;
  method: PayMethod;
  pkgLabel?: string;
  pkgPrice: number;
  txId?: string;
}

interface StoreApi {
  state: AppState;
  now: number;
  role: Role;
  setRole: (r: Role) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  toasts: Toast[];
  toast: (msg: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;
  alerts: Alert[];
  isAdmin: boolean;

  startSession: (a: {
    deviceId: string;
    memberId: string;
    mode: SessionMode;
    pkgId?: string;
    method: PayMethod;
  }) => Result;
  pauseSession: (id: string) => void;
  resumeSession: (id: string) => void;
  extendSession: (id: string, pkgId: string, method: PayMethod) => Result;
  settleSession: (id: string, method: PayMethod) => SettleInfo | { error: string };

  addDevice: (d: Omit<Device, "id">) => void;
  updateDevice: (id: string, patch: Partial<Device>) => void;
  deleteDevice: (id: string) => Result;
  setDeviceStatus: (id: string, status: DeviceStatus) => void;
  importDevices: (rows: Omit<Device, "id" | "status">[]) => number;

  addMember: (m: Omit<Member, "id" | "joinedAt" | "wallet"> & { wallet?: number }) => void;
  updateMember: (id: string, patch: Partial<Member>) => void;
  deleteMember: (id: string) => Result;
  topUp: (memberId: string, amount: number, method: PayMethod) => void;

  resetDemo: () => void;
}

const Ctx = createContext<StoreApi | null>(null);

const LS_STATE = "blueshift:state:v3";
const LS_THEME = "blueshift:theme";
const LS_ROLE = "blueshift:role";

function freshState(): AppState {
  const devices = seedDevices();
  const members = seedMembers();
  return {
    devices,
    members,
    sessions: seedSessions(),
    transactions: seedTransactions(devices, members),
  };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.devices) && Array.isArray(parsed.members)) {
        return parsed;
      }
    }
  } catch {
    /* fall through to seed */
  }
  return freshState();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);
  const [now, setNow] = useState(() => Date.now());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );
  const [role, setRole] = useState<Role>(() => {
    try {
      return (localStorage.getItem(LS_ROLE) as Role) || "admin";
    } catch {
      return "admin";
    }
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  /* live clock — 1s tick */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* persistence */
  useEffect(() => {
    try {
      localStorage.setItem(LS_STATE, JSON.stringify(state));
    } catch {
      /* storage full / unavailable */
    }
  }, [state]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(LS_THEME, theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ROLE, role);
    } catch {
      /* noop */
    }
  }, [role]);

  const toast = useCallback((msg: string, kind: Toast["kind"] = "success") => {
    const id = uid("toast");
    setToasts((t) => [...t.slice(-3), { id, kind, msg }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  /* ---------------- sessions ---------------- */

  const startSession: StoreApi["startSession"] = useCallback(
    ({ deviceId, memberId, mode, pkgId, method }) => {
      const st = stateRef.current;
      const device = st.devices.find((d) => d.id === deviceId);
      const member = st.members.find((m) => m.id === memberId);
      if (!device || !member) return { ok: false, reason: "Device or member not found." };
      if (device.status !== "available") return { ok: false, reason: `${device.name} is not available.` };

      const t = Date.now();
      let pkgPriceVal = 0;
      let prepaidSec = 0;

      if (mode === "package" && pkgId) {
        const pkg = PACKAGES.find((p) => p.id === pkgId)!;
        pkgPriceVal = packagePrice(device.hourlyRate, pkgId, member.tier);
        prepaidSec = pkg.hours * 3600;
        if (method === "wallet") {
          if (member.wallet < pkgPriceVal)
            return { ok: false, reason: "Insufficient wallet balance for this package." };
        }
      }

      const txs: Tx[] = [];
      if (mode === "package" && pkgId) {
        txs.push({
          id: uid("t"),
          at: t,
          memberId: member.id,
          memberName: member.name,
          label: `Package · ${PACKAGES.find((p) => p.id === pkgId)!.label}`,
          detail: `${device.name} · ${pkgId === "pd" ? "Day pass" : "Prepaid time"}`,
          kind: "package",
          method,
          amount: pkgPriceVal,
          deviceId: device.id,
        });
      }

      const session: Session = {
        id: uid("s"),
        deviceId,
        memberId,
        status: "active",
        mode,
        pkgId: mode === "package" ? pkgId : undefined,
        prepaidSec,
        pkgPrice: pkgPriceVal,
        accumulatedMs: 0,
        resumedAt: t,
        pausedAt: null,
        startedAt: t,
      };

      setState((prev) => ({
        ...prev,
        devices: prev.devices.map((d) =>
          d.id === deviceId ? { ...d, status: "in_use" as DeviceStatus } : d
        ),
        members:
          method === "wallet" && pkgPriceVal > 0
            ? prev.members.map((m) =>
                m.id === memberId ? { ...m, wallet: round2(m.wallet - pkgPriceVal) } : m
              )
            : prev.members,
        sessions: [session, ...prev.sessions],
        transactions: [...txs, ...prev.transactions],
      }));
      return { ok: true };
    },
    []
  );

  const pauseSession = useCallback((id: string) => {
    const t = Date.now();
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === id && s.status === "active"
          ? { ...s, status: "paused", accumulatedMs: s.accumulatedMs + Math.max(0, t - s.resumedAt), pausedAt: t }
          : s
      ),
    }));
  }, []);

  const resumeSession = useCallback((id: string) => {
    const t = Date.now();
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === id && s.status === "paused" ? { ...s, status: "active", resumedAt: t, pausedAt: null } : s
      ),
    }));
  }, []);

  const extendSession: StoreApi["extendSession"] = useCallback((id, pkgId, method) => {
    const st = stateRef.current;
    const s = st.sessions.find((x) => x.id === id);
    if (!s || s.status === "settled") return { ok: false, reason: "Session is not running." };
    const device = st.devices.find((d) => d.id === s.deviceId);
    const member = st.members.find((m) => m.id === s.memberId);
    if (!device || !member) return { ok: false, reason: "Record not found." };
    const pkg = PACKAGES.find((p) => p.id === pkgId)!;
    const price = packagePrice(device.hourlyRate, pkgId, member.tier);
    if (method === "wallet" && member.wallet < price)
      return { ok: false, reason: "Insufficient wallet balance." };

    const t = Date.now();
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((x) =>
        x.id === id ? { ...x, prepaidSec: x.prepaidSec + pkg.hours * 3600, pkgPrice: round2(x.pkgPrice + price) } : x
      ),
      members:
        method === "wallet"
          ? prev.members.map((m) => (m.id === member.id ? { ...m, wallet: round2(m.wallet - price) } : m))
          : prev.members,
      transactions: [
        {
          id: uid("t"),
          at: t,
          memberId: member.id,
          memberName: member.name,
          label: `Extension · ${pkg.label}`,
          detail: device.name,
          kind: "package",
          method,
          amount: price,
          deviceId: device.id,
        },
        ...prev.transactions,
      ],
    }));
    return { ok: true };
  }, []);

  const settleSession: StoreApi["settleSession"] = useCallback((id, method) => {
    const st = stateRef.current;
    const s = st.sessions.find((x) => x.id === id);
    if (!s || s.status === "settled") return { error: "Session is not running." };
    const device = st.devices.find((d) => d.id === s.deviceId);
    const member = st.members.find((m) => m.id === s.memberId);
    if (!device || !member) return { error: "Record not found." };

    const t = Date.now();
    const total = elapsedMs(s, t);
    const overageMs = Math.max(0, total - s.prepaidSec * 1000);
    const charged =
      s.mode === "package"
        ? overageMs > 0
          ? paygCharge(device.hourlyRate, overageMs, member.tier)
          : 0
        : paygCharge(device.hourlyRate, total, member.tier);

    if (method === "wallet" && member.wallet < charged)
      return { error: "Insufficient wallet balance — choose another method or top up." };

    let txId: string | undefined;
    const txs: Tx[] = [];
    if (charged > 0) {
      txId = uid("t");
      txs.push({
        id: txId,
        at: t,
        memberId: member.id,
        memberName: member.name,
        label: `Session · ${device.name}`,
        detail:
          s.mode === "package" && overageMs > 0
            ? `Overage · ${Math.ceil(overageMs / 60000)}m beyond prepaid time`
            : `${Math.ceil(total / 60000)}m @ $${device.hourlyRate.toFixed(2)}/h`,
        kind: "session",
        method,
        amount: charged,
        deviceId: device.id,
      });
    }

    setState((prev) => ({
      ...prev,
      devices: prev.devices.map((d) => (d.id === device.id ? { ...d, status: "available" } : d)),
      members:
        method === "wallet" && charged > 0
          ? prev.members.map((m) => (m.id === member.id ? { ...m, wallet: round2(m.wallet - charged) } : m))
          : prev.members,
      sessions: prev.sessions.map((x) =>
        x.id === id
          ? { ...x, status: "settled", accumulatedMs: total, pausedAt: null, endedAt: t, charged, method }
          : x
      ),
      transactions: [...txs, ...prev.transactions],
    }));

    return {
      charged,
      elapsedMsTotal: total,
      overageMs,
      device,
      member,
      method,
      pkgLabel: s.mode === "package" ? PACKAGES.find((p) => p.id === s.pkgId)?.label : undefined,
      pkgPrice: s.pkgPrice,
      txId,
    };
  }, []);

  /* ---------------- devices ---------------- */

  const addDevice: StoreApi["addDevice"] = useCallback((d) => {
    setState((prev) => ({ ...prev, devices: [...prev.devices, { ...d, id: uid("d") }] }));
  }, []);

  const updateDevice: StoreApi["updateDevice"] = useCallback((id, patch) => {
    setState((prev) => ({
      ...prev,
      devices: prev.devices.map((d) => (d.id === id ? { ...d, ...patch, id } : d)),
    }));
  }, []);

  const deleteDevice: StoreApi["deleteDevice"] = useCallback((id) => {
    const st = stateRef.current;
    const live = st.sessions.some((s) => s.deviceId === id && s.status !== "settled");
    if (live) return { ok: false, reason: "Device has a running session. Settle it first." };
    setState((prev) => ({ ...prev, devices: prev.devices.filter((d) => d.id !== id) }));
    return { ok: true };
  }, []);

  const setDeviceStatus: StoreApi["setDeviceStatus"] = useCallback((id, status) => {
    setState((prev) => ({
      ...prev,
      devices: prev.devices.map((d) => (d.id === id ? { ...d, status } : d)),
    }));
  }, []);

  const importDevices: StoreApi["importDevices"] = useCallback((rows) => {
    const withIds: Device[] = rows.map((r) => ({ ...r, id: uid("d"), status: "available" as DeviceStatus }));
    setState((prev) => ({ ...prev, devices: [...prev.devices, ...withIds] }));
    return withIds.length;
  }, []);

  /* ---------------- members ---------------- */

  const addMember: StoreApi["addMember"] = useCallback((m) => {
    setState((prev) => ({
      ...prev,
      members: [
        { ...m, wallet: m.wallet ?? 0, id: uid("m"), joinedAt: Date.now() },
        ...prev.members,
      ],
    }));
  }, []);

  const updateMember: StoreApi["updateMember"] = useCallback((id, patch) => {
    setState((prev) => ({
      ...prev,
      members: prev.members.map((m) => (m.id === id ? { ...m, ...patch, id } : m)),
    }));
  }, []);

  const deleteMember: StoreApi["deleteMember"] = useCallback((id) => {
    const st = stateRef.current;
    const live = st.sessions.some((s) => s.memberId === id && s.status !== "settled");
    if (live) return { ok: false, reason: "Member has a running session. Settle it first." };
    setState((prev) => ({ ...prev, members: prev.members.filter((m) => m.id !== id) }));
    return { ok: true };
  }, []);

  const topUp: StoreApi["topUp"] = useCallback((memberId, amount, method) => {
    const t = Date.now();
    setState((prev) => {
      const mem = prev.members.find((m) => m.id === memberId);
      if (!mem) return prev;
      return {
        ...prev,
        members: prev.members.map((m) =>
          m.id === memberId ? { ...m, wallet: round2(m.wallet + amount) } : m
        ),
        transactions: [
          {
            id: uid("t"),
            at: t,
            memberId,
            memberName: mem.name,
            label: "Wallet top-up",
            detail: "Counter top-up",
            kind: "topup",
            method,
            amount,
          },
          ...prev.transactions,
        ],
      };
    });
  }, []);

  const resetDemo = useCallback(() => {
    setState(freshState());
    toast("Demo data restored to a fresh state.", "info");
  }, [toast]);

  /* ---------------- derived alerts ---------------- */

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    for (const s of state.sessions) {
      if (s.status === "settled" || s.prepaidSec === 0) continue;
      const dev = state.devices.find((d) => d.id === s.deviceId);
      const mem = state.members.find((m) => m.id === s.memberId);
      if (!dev || !mem) continue;
      const remaining = s.prepaidSec * 1000 - elapsedMs(s, now);
      if (remaining <= 0) {
        out.push({
          id: `exp-${s.id}`,
          sev: "danger",
          title: `Time expired · ${dev.name}`,
          sub: `${mem.name} is over prepaid time — extend or settle.`,
        });
      } else if (remaining <= 5 * 60_000) {
        out.push({
          id: `soon-${s.id}`,
          sev: "warn",
          title: `Expiring soon · ${dev.name}`,
          sub: `${mem.name} has ${Math.max(1, Math.ceil(remaining / 60000))} min of prepaid time left.`,
        });
      }
    }
    for (const d of state.devices) {
      if (d.status === "maintenance")
        out.push({
          id: `mnt-${d.id}`,
          sev: "info",
          title: `Maintenance · ${d.name}`,
          sub: "Device is out of rotation.",
        });
    }
    const rank = { danger: 0, warn: 1, info: 2 } as const;
    return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
  }, [state.sessions, state.devices, state.members, now]);

  const api: StoreApi = {
    state,
    now,
    role,
    setRole,
    theme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    toasts,
    toast,
    dismissToast,
    alerts,
    isAdmin: role === "admin",
    startSession,
    pauseSession,
    resumeSession,
    extendSession,
    settleSession,
    addDevice,
    updateDevice,
    deleteDevice,
    setDeviceStatus,
    importDevices,
    addMember,
    updateMember,
    deleteMember,
    topUp,
    resetDemo,
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export type { Tier };
