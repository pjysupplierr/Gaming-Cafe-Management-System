export type DeviceType = "pc" | "console" | "vr" | "sim";
export type DeviceStatus = "available" | "in_use" | "maintenance" | "offline";

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  zone: string;
  hourlyRate: number;
  specs: string;
  status: DeviceStatus;
}

export type Tier = "regular" | "premium" | "vip";

export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: Tier;
  wallet: number;
  joinedAt: number;
}

export type SessionMode = "payg" | "package";
export type SessionStatus = "active" | "paused" | "settled";

export interface Session {
  id: string;
  deviceId: string;
  memberId: string;
  status: SessionStatus;
  mode: SessionMode;
  pkgId?: string;
  prepaidSec: number;
  pkgPrice: number;
  /** ms accumulated across paused segments */
  accumulatedMs: number;
  /** epoch ms when the current running segment started */
  resumedAt: number;
  pausedAt: number | null;
  startedAt: number;
  endedAt?: number;
  charged?: number;
  method?: PayMethod;
}

export type PayMethod = "cash" | "card" | "wallet";
export type TxKind = "session" | "package" | "topup";

export interface Tx {
  id: string;
  at: number;
  memberId: string | null;
  memberName: string;
  label: string;
  detail?: string;
  kind: TxKind;
  method: PayMethod;
  amount: number;
  deviceId?: string;
}

export interface PackageDef {
  id: string;
  label: string;
  hours: number;
  disc: number;
  tag?: string;
}

export const PACKAGES: PackageDef[] = [
  { id: "p1", label: "1 Hour", hours: 1, disc: 0 },
  { id: "p2", label: "2 Hours", hours: 2, disc: 0.1, tag: "-10%" },
  { id: "p5", label: "5 Hours", hours: 5, disc: 0.2, tag: "-20%" },
  { id: "pd", label: "Day Pass", hours: 12, disc: 0.4, tag: "Best value" },
];

export const TIER_META: Record<Tier, { label: string; disc: number; blurb: string }> = {
  regular: { label: "Regular", disc: 0, blurb: "Standard hourly rates" },
  premium: { label: "Premium", disc: 0.1, blurb: "10% off all play time" },
  vip: { label: "VIP", disc: 0.2, blurb: "20% off + priority booking" },
};

export const DEVICE_META: Record<DeviceType, { label: string; plural: string }> = {
  pc: { label: "Gaming PC", plural: "Gaming PCs" },
  console: { label: "Console", plural: "Consoles" },
  vr: { label: "VR Headset", plural: "VR Headsets" },
  sim: { label: "Sim Rig", plural: "Sim Rigs" },
};

export const STATUS_META: Record<DeviceStatus, { label: string }> = {
  available: { label: "Available" },
  in_use: { label: "In use" },
  maintenance: { label: "Maintenance" },
  offline: { label: "Offline" },
};

export const ZONES = ["Arena A", "Arena B", "Console Lounge", "VR Bay", "Sim Deck"];

export type View = "dashboard" | "devices" | "users" | "sessions" | "billing" | "reports";
export type Role = "admin" | "staff";
