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
import {
  CONSOLE_PLAYER_RATES,
  PACKAGES,
  type Device,
  type DeviceStatus,
  type Member,
  type PayMethod,
  type Reservation,
  type Role,
  type Session,
  type SessionMode,
  type Tier,
  type Tx,
} from "./types";
import {
  calcSessionPrice,
  elapsedMs,
  money,
  packagePrice,
  paygCharge,
  round2,
  uid,
} from "./utils";

export interface AppState {
  devices: Device[];
  members: Member[];
  sessions: Session[];
  transactions: Tx[];
  reservations: Reservation[];
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
  playerCount?: number;
  sessionHourlyRate?: number;
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
    customHours?: number;
    method: PayMethod;
    playerCount?: number;
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

  addReservation: (r: Omit<Reservation, "id" | "createdAt" | "status">) => Result;
  cancelReservation: (id: string) => void;
  deleteReservation: (id: string) => void;
  startReservationSession: (reservationId: string, method?: PayMethod) => Result;

  clearData: () => void;
  resetDemo: () => void;
}

const Ctx = createContext<StoreApi | null>(null);

const LS_STATE = "GameNation:state:v5";
const LS_THEME = "GameNation:theme";
const LS_ROLE = "GameNation:role";

function freshState(): AppState {
  return {
    devices: [],
    members: [],
    sessions: [],
    transactions: [],
    reservations: [],
  };
}

function loadState(): AppState {
  try {
    ["GameNation:state:v4", "GameNation:state:v3", "GameNation:state:v2", "GameNation:state"].forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    });
    const raw = localStorage.getItem(LS_STATE);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.devices) && Array.isArray(parsed.members)) {
        parsed.reservations = Array.isArray(parsed.reservations) ? parsed.reservations : [];
        // Migrate any existing devices from old USD rates to INR
        parsed.devices = parsed.devices.map((d) => {
          if (d.type === "pc" && (d.hourlyRate < 20 || !d.hourlyRate)) {
            return { ...d, hourlyRate: 60 };
          }
          if (d.hourlyRate < 20) {
            const def = d.type === "console" ? 80 : d.type === "vr" ? 120 : d.type === "sim" ? 150 : 60;
            return { ...d, hourlyRate: def };
          }
          return d;
        });
        return parsed;
      }
    }
  } catch {
    /* fall through to fresh state */
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
    ({ deviceId, memberId, mode, pkgId, customHours, method, playerCount }) => {
      const st = stateRef.current;
      const device = st.devices.find((d) => d.id === deviceId);
      const member = st.members.find((m) => m.id === memberId);
      if (!device || !member) return { ok: false, reason: "Device or member not found." };
      if (device.status !== "available") return { ok: false, reason: `${device.name} is not available.` };

      const t = Date.now();
      const effPlayerCount = device.type === "console" ? (playerCount ?? device.playerCount ?? 1) : undefined;
      const effRate =
        device.type === "console" && effPlayerCount && CONSOLE_PLAYER_RATES[effPlayerCount]
          ? CONSOLE_PLAYER_RATES[effPlayerCount]
          : device.hourlyRate;
      const effectiveDevice = {
        ...device,
        hourlyRate: effRate,
        playerCount: effPlayerCount,
        sessionHourlyRate: effRate,
      };

      let pkgPriceVal = 0;
      let prepaidSec = 0;
      let pkgLabel = "";

      if (mode === "package") {
        if (customHours && customHours > 0) {
          pkgPriceVal = calcSessionPrice(effectiveDevice, customHours, member.tier);
          prepaidSec = customHours * 3600;
          pkgLabel = `${customHours} Hour${customHours === 1 ? "" : "s"}`;
        } else if (pkgId) {
          const pkg = PACKAGES.find((p) => p.id === pkgId);
          if (pkg) {
            pkgPriceVal = packagePrice(effectiveDevice, pkgId, member.tier);
            prepaidSec = pkg.hours * 3600;
            pkgLabel = pkg.label;
          }
        }

        if (method === "wallet") {
          if (member.wallet < pkgPriceVal)
            return { ok: false, reason: "Insufficient wallet balance for this package." };
        }
      }

      const txs: Tx[] = [];
      if (mode === "package" && pkgPriceVal > 0) {
        txs.push({
          id: uid("t"),
          at: t,
          memberId: member.id,
          memberName: member.name,
          label: `Package · ${pkgLabel}${effPlayerCount ? ` (${effPlayerCount}P)` : ""}`,
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
        pkgId: mode === "package" ? (pkgId || (customHours ? `c_${customHours}h` : undefined)) : undefined,
        prepaidSec,
        pkgPrice: pkgPriceVal,
        playerCount: effPlayerCount,
        sessionHourlyRate: effRate,
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

    const effRate = s.sessionHourlyRate ?? (s.playerCount ? (CONSOLE_PLAYER_RATES[s.playerCount] ?? device.hourlyRate) : device.hourlyRate);
    const effDevice = { ...device, hourlyRate: effRate, sessionHourlyRate: effRate, playerCount: s.playerCount };

    let price: number;
    if (device.type === "pc" || effRate === 60) {
      const currentHours = s.prepaidSec / 3600;
      const targetHours = currentHours + pkg.hours;
      const targetCost = calcSessionPrice(effDevice, targetHours, member.tier);
      price = Math.max(0, round2(targetCost - s.pkgPrice));
    } else {
      price = packagePrice(effDevice, pkgId, member.tier);
    }

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
          label: `Extension · ${pkg.label}${s.playerCount ? ` (${s.playerCount}P)` : ""}`,
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

    const effRate = s.sessionHourlyRate ?? (s.playerCount ? (CONSOLE_PLAYER_RATES[s.playerCount] ?? device.hourlyRate) : device.hourlyRate);
    const effDevice = { ...device, hourlyRate: effRate, sessionHourlyRate: effRate, playerCount: s.playerCount };

    const t = Date.now();
    const total = elapsedMs(s, t);
    const overageMs = Math.max(0, total - s.prepaidSec * 1000);

    let charged = 0;
    if (s.mode === "package") {
      if (overageMs > 0) {
        if (device.type === "pc" || effRate === 60) {
          const totalHours = Math.ceil(Math.max(1, total / 60000) / 15) * 15 / 60;
          const fullCost = calcSessionPrice(effDevice, totalHours, member.tier);
          charged = Math.max(0, round2(fullCost - s.pkgPrice));
        } else {
          charged = paygCharge(effDevice, overageMs, member.tier);
        }
      } else {
        charged = 0;
      }
    } else {
      charged = paygCharge(effDevice, total, member.tier);
    }

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
            : `${Math.ceil(total / 60000)}m @ ${money(effRate)}/h${s.playerCount ? ` (${s.playerCount}P)` : ""}`,
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
      device: effDevice,
      member,
      method,
      pkgLabel: s.mode === "package" ? PACKAGES.find((p) => p.id === s.pkgId)?.label : undefined,
      pkgPrice: s.pkgPrice,
      txId,
      playerCount: s.playerCount,
      sessionHourlyRate: effRate,
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

  /* ---------------- reservations ---------------- */

  const addReservation: StoreApi["addReservation"] = useCallback((r) => {
    const st = stateRef.current;
    const dev = st.devices.find((d) => d.id === r.deviceId);
    if (!dev) return { ok: false, reason: "Selected station does not exist." };

    const newRes: Reservation = {
      ...r,
      id: uid("res"),
      status: "confirmed",
      createdAt: Date.now(),
    };

    setState((prev) => ({
      ...prev,
      reservations: [newRes, ...prev.reservations],
    }));
    return { ok: true };
  }, []);

  const cancelReservation = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      reservations: prev.reservations.map((r) =>
        r.id === id ? { ...r, status: "cancelled" } : r
      ),
    }));
  }, []);

  const deleteReservation = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      reservations: prev.reservations.filter((r) => r.id !== id),
    }));
  }, []);

  const startReservationSession: StoreApi["startReservationSession"] = useCallback(
    (reservationId, payMethod = "cash") => {
      const st = stateRef.current;
      const res = st.reservations.find((r) => r.id === reservationId);
      if (!res) return { ok: false, reason: "Reservation not found." };
      if (res.status === "completed") return { ok: false, reason: "Reservation has already been fulfilled." };

      const dev = st.devices.find((d) => d.id === res.deviceId);
      if (!dev) return { ok: false, reason: "Station no longer exists." };
      if (dev.status !== "available") {
        return {
          ok: false,
          reason: `${dev.name} is currently ${dev.status.replace("_", " ")}. Settle active session or wait for it to become available.`,
        };
      }

      let targetMemberId = res.memberId;
      if (!targetMemberId) {
        const existing = st.members.find(
          (m) =>
            (res.customerPhone && m.phone === res.customerPhone) ||
            m.name.toLowerCase() === res.customerName.toLowerCase()
        );
        if (existing) {
          targetMemberId = existing.id;
        } else {
          const newMemberId = uid("m");
          const newMember: Member = {
            id: newMemberId,
            name: res.customerName,
            phone: res.customerPhone || "",
            email: "",
            tier: "regular",
            wallet: 0,
            joinedAt: Date.now(),
          };
          setState((prev) => ({ ...prev, members: [newMember, ...prev.members] }));
          targetMemberId = newMemberId;
        }
      }

      const startRes = startSession({
        deviceId: res.deviceId,
        memberId: targetMemberId,
        mode: "package",
        customHours: res.durationHours,
        method: payMethod,
        playerCount: res.playerCount,
      });

      if (!startRes.ok) return startRes;

      setState((prev) => ({
        ...prev,
        reservations: prev.reservations.map((r) =>
          r.id === reservationId ? { ...r, status: "completed" } : r
        ),
      }));

      return { ok: true };
    },
    [startSession]
  );

  const clearData = useCallback(() => {
    setState(freshState());
    try {
      ["GameNation:state:v5", "GameNation:state:v4", "GameNation:state:v3", "GameNation:state:v2", "GameNation:state"].forEach((k) => {
        localStorage.removeItem(k);
      });
    } catch {
      /* ignore */
    }
    toast("All data cleared to a clean state.", "info");
  }, [toast]);

  const resetDemo = clearData;

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
    addReservation,
    cancelReservation,
    deleteReservation,
    startReservationSession,
    clearData,
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
