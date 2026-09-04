import type { Device, Member, Session, Tx } from "./types";
import { mulberry32, paygCharge, round2 } from "./utils";

const min = 60_000;
const hr = 3_600_000;
const day = 24 * hr;

export function seedDevices(): Device[] {
  const pc = (id: string, name: string, zone: string, rate: number, specs: string): Device => ({
    id,
    name,
    type: "pc",
    zone,
    hourlyRate: rate,
    specs,
    status: "available",
  });
  return [
    pc("d-a1", "Arena A-01", "Arena A", 4.5, "RTX 4070 · i7-13700K · 240 Hz"),
    pc("d-a2", "Arena A-02", "Arena A", 4.5, "RTX 4070 · i7-13700K · 240 Hz"),
    pc("d-a3", "Arena A-03", "Arena A", 4.5, "RTX 4070 · i7-13700K · 240 Hz"),
    pc("d-a4", "Arena A-04", "Arena A", 4.5, "RTX 4070 · i7-13700K · 240 Hz"),
    pc("d-b1", "Arena B-01", "Arena B", 4.0, "RTX 4060 · i5-13400F · 165 Hz"),
    pc("d-b2", "Arena B-02", "Arena B", 4.0, "RTX 4060 · i5-13400F · 165 Hz"),
    pc("d-b3", "Arena B-03", "Arena B", 4.0, "RTX 4060 · i5-13400F · 165 Hz"),
    pc("d-b4", "Arena B-04", "Arena B", 4.0, "RTX 4060 · i5-13400F · 165 Hz"),
    { id: "d-ps1", name: "PS5 · Lounge 1", type: "console", zone: "Console Lounge", hourlyRate: 6, specs: "PS5 · 65″ 4K 120 Hz · DualSense ×4", status: "available" },
    { id: "d-ps2", name: "PS5 · Lounge 2", type: "console", zone: "Console Lounge", hourlyRate: 6, specs: "PS5 · 65″ 4K 120 Hz · DualSense ×4", status: "available" },
    { id: "d-xs1", name: "Xbox Series X", type: "console", zone: "Console Lounge", hourlyRate: 6, specs: "Series X · Game Pass Ultimate", status: "available" },
    { id: "d-vr1", name: "VR Bay 1", type: "vr", zone: "VR Bay", hourlyRate: 8, specs: "Valve Index · haptic floor · full-body", status: "available" },
    { id: "d-vr2", name: "VR Bay 2", type: "vr", zone: "VR Bay", hourlyRate: 8, specs: "Quest 3 · mixed-reality arena", status: "available" },
    { id: "d-vr3", name: "VR Bay 3", type: "vr", zone: "VR Bay", hourlyRate: 8, specs: "Quest 3 · mixed-reality arena", status: "offline" },
    { id: "d-sim1", name: "Sim Rig 1", type: "sim", zone: "Sim Deck", hourlyRate: 10, specs: "Fanatec DD+ · triple 34″ · motion seat", status: "available" },
    { id: "d-sim2", name: "Sim Rig 2", type: "sim", zone: "Sim Deck", hourlyRate: 10, specs: "Fanatec DD+ · triple 34″ · motion seat", status: "maintenance" },
  ];
}

export function seedMembers(): Member[] {
  const NOW = Date.now();
  return [
    { id: "m-01", name: "Dario Vex", email: "dario.vex@mail.com", phone: "555-0141", tier: "vip", wallet: 86.5, joinedAt: NOW - 320 * day },
    { id: "m-02", name: "Mina Okafor", email: "mina.o@mail.com", phone: "555-0117", tier: "premium", wallet: 42.0, joinedAt: NOW - 210 * day },
    { id: "m-03", name: "Kenji Sato", email: "kenji.s@mail.com", phone: "555-0163", tier: "vip", wallet: 120.0, joinedAt: NOW - 460 * day },
    { id: "m-04", name: "Lena Brandt", email: "lena.b@mail.com", phone: "555-0129", tier: "regular", wallet: 15.0, joinedAt: NOW - 90 * day },
    { id: "m-05", name: "Theo Marsh", email: "theo.m@mail.com", phone: "555-0186", tier: "regular", wallet: 8.5, joinedAt: NOW - 45 * day },
    { id: "m-06", name: "Aisha Karim", email: "aisha.k@mail.com", phone: "555-0152", tier: "premium", wallet: 64.0, joinedAt: NOW - 150 * day },
    { id: "m-07", name: "Rui Costa", email: "rui.c@mail.com", phone: "555-0170", tier: "regular", wallet: 0, joinedAt: NOW - 12 * day },
    { id: "m-08", name: "Sofia Lindqvist", email: "sofia.l@mail.com", phone: "555-0134", tier: "premium", wallet: 27.25, joinedAt: NOW - 275 * day },
  ];
}

/** Four live sessions so the floor is already humming on first load. */
export function seedSessions(): Session[] {
  const NOW = Date.now();
  return [
    {
      id: "s-live-1",
      deviceId: "d-a1",
      memberId: "m-02",
      status: "active",
      mode: "package",
      pkgId: "p2",
      prepaidSec: 2 * 3600,
      pkgPrice: 8.1,
      accumulatedMs: 0,
      resumedAt: NOW - 95 * min,
      pausedAt: null,
      startedAt: NOW - 95 * min,
    },
    {
      id: "s-live-2",
      deviceId: "d-ps1",
      memberId: "m-05",
      status: "active",
      mode: "payg",
      prepaidSec: 0,
      pkgPrice: 0,
      accumulatedMs: 0,
      resumedAt: NOW - 34 * min,
      pausedAt: null,
      startedAt: NOW - 34 * min,
    },
    {
      id: "s-live-3",
      deviceId: "d-vr1",
      memberId: "m-03",
      status: "active",
      mode: "package",
      pkgId: "p1",
      prepaidSec: 3600,
      pkgPrice: 6.4,
      accumulatedMs: 0,
      resumedAt: NOW - 57 * min,
      pausedAt: null,
      startedAt: NOW - 57 * min,
    },
    {
      id: "s-live-4",
      deviceId: "d-sim1",
      memberId: "m-06",
      status: "paused",
      mode: "payg",
      prepaidSec: 0,
      pkgPrice: 0,
      accumulatedMs: 41 * min,
      resumedAt: NOW - 47 * min,
      pausedAt: NOW - 6 * min,
      startedAt: NOW - 47 * min,
    },
  ];
}

export function seedTransactions(devices: Device[], members: Member[]): Tx[] {
  const NOW = Date.now();
  const rnd = mulberry32(20260214);
  const txs: Tx[] = [];
  let n = 0;
  const push = (t: Omit<Tx, "id">) => txs.push({ id: `t-seed-${n++}`, ...t });

  for (let d = 29; d >= 0; d--) {
    const count = 2 + Math.floor(rnd() * 3) + (d < 7 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const dev = devices[Math.floor(rnd() * devices.length)];
      const mem = members[Math.floor(rnd() * members.length)];
      const at = NOW - d * day - (2 + Math.floor(rnd() * 11)) * hr - Math.floor(rnd() * 55) * min;
      if (rnd() < 0.22) {
        const amt = [10, 20, 20, 50][Math.floor(rnd() * 4)];
        push({
          at,
          memberId: mem.id,
          memberName: mem.name,
          label: "Wallet top-up",
          detail: "Counter top-up",
          kind: "topup",
          method: rnd() < 0.5 ? "cash" : "card",
          amount: amt,
        });
      } else {
        const hours = [0.5, 1, 1, 1.5, 2, 2, 3][Math.floor(rnd() * 7)];
        const disc = mem.tier === "vip" ? 0.2 : mem.tier === "premium" ? 0.1 : 0;
        const amount = round2(dev.hourlyRate * hours * (1 - disc));
        push({
          at,
          memberId: mem.id,
          memberName: mem.name,
          label: `Session · ${dev.name}`,
          detail: `${hours}h @ $${dev.hourlyRate.toFixed(2)}/h`,
          kind: "session",
          method: (["cash", "card", "wallet"] as const)[Math.floor(rnd() * 3)],
          amount,
          deviceId: dev.id,
        });
      }
    }
  }

  // package purchases tied to the live sessions
  push({
    at: NOW - 95 * min,
    memberId: "m-02",
    memberName: "Mina Okafor",
    label: "Package · 2 Hours",
    detail: "Arena A-01 · Premium -10%",
    kind: "package",
    method: "wallet",
    amount: 8.1,
    deviceId: "d-a1",
  });
  push({
    at: NOW - 57 * min,
    memberId: "m-03",
    memberName: "Kenji Sato",
    label: "Package · 1 Hour",
    detail: "VR Bay 1 · VIP -20%",
    kind: "package",
    method: "card",
    amount: 6.4,
    deviceId: "d-vr1",
  });
  // a couple of settled sessions earlier today
  push({
    at: NOW - 3.2 * hr,
    memberId: "m-04",
    memberName: "Lena Brandt",
    label: "Session · Arena B-02",
    detail: "45m @ $4.00/h",
    kind: "session",
    method: "cash",
    amount: paygCharge(4, 45 * min, "regular"),
    deviceId: "d-b2",
  });
  push({
    at: NOW - 5.1 * hr,
    memberId: "m-08",
    memberName: "Sofia Lindqvist",
    label: "Session · PS5 · Lounge 2",
    detail: "2h @ $6.00/h",
    kind: "session",
    method: "card",
    amount: round2(12 * 0.9),
    deviceId: "d-ps2",
  });

  return txs.sort((a, b) => b.at - a.at);
}
