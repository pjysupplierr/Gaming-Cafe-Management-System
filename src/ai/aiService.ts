import type { AppState } from "../store";
import { DEVICE_META, type Device } from "../types";
import { elapsedMs, fmtDuration, fmtTime, money, paygCharge } from "../utils";
import type {
  AISettings,
  BookedDeviceSummary,
  ChatMessage,
  EmptyDeviceSummary,
  FloorSnapshot,
} from "./types";

export const DEFAULT_SETTINGS: AISettings = {
  apiKey: import.meta.env.VITE_OPENROUTER_API_KEY || "",
  provider: "openrouter",
  model: import.meta.env.VITE_OPENROUTER_MODEL || "google/gemini-2.0-flash-001",
  temperature: 0.2,
};

export const AVAILABLE_MODELS = [
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash (Fast & Smart)", provider: "openrouter" },
  { id: "google/gemini-flash-1.5", label: "Gemini 1.5 Flash", provider: "openrouter" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "openrouter" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct", provider: "openrouter" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3", provider: "openrouter" },
];

/**
 * Extracts a real-time structured telemetry snapshot of the gaming café floor.
 */
export function extractFloorSnapshot(state: AppState, now: number): FloorSnapshot {
  const devices = state.devices;
  const sessions = state.sessions.filter((s) => s.status !== "settled");

  const availableDevices: EmptyDeviceSummary[] = [];
  const bookedDevices: BookedDeviceSummary[] = [];

  let inUseCount = 0;
  let availableCount = 0;
  let maintenanceCount = 0;
  let offlineCount = 0;

  for (const dev of devices) {
    if (dev.status === "available") {
      availableCount++;
      availableDevices.push({
        id: dev.id,
        name: dev.name,
        type: dev.type,
        typeLabel: DEVICE_META[dev.type]?.label || dev.type,
        zone: dev.zone,
        hourlyRate: dev.hourlyRate,
        specs: dev.specs,
      });
    } else if (dev.status === "in_use") {
      inUseCount++;
    } else if (dev.status === "maintenance") {
      maintenanceCount++;
    } else if (dev.status === "offline") {
      offlineCount++;
    }
  }

  // Active & booked devices
  for (const session of sessions) {
    const dev = devices.find((d) => d.id === session.deviceId);
    const member = state.members.find((m) => m.id === session.memberId);
    if (!dev) continue;

    const elapsed = elapsedMs(session, now);
    const memberName = member ? member.name : "Guest Player";
    const memberTier = member ? member.tier : "regular";

    let remainingMs = 0;
    let remainingFormatted = "PAYG (Ongoing)";
    let isExpired = false;

    if (session.mode === "package" && session.prepaidSec > 0) {
      remainingMs = session.prepaidSec * 1000 - elapsed;
      if (remainingMs <= 0) {
        isExpired = true;
        remainingFormatted = `Expired by ${fmtDuration(Math.abs(remainingMs))}`;
      } else {
        remainingFormatted = `${fmtDuration(remainingMs)} remaining`;
      }
    }

    let estimatedCharge = session.mode === "package" ? session.pkgPrice : 0;
    if (session.mode === "payg") {
      estimatedCharge = paygCharge(dev, elapsed, memberTier);
    }

    bookedDevices.push({
      deviceId: dev.id,
      deviceName: dev.name,
      deviceType: dev.type,
      zone: dev.zone,
      memberId: session.memberId,
      memberName,
      memberTier,
      sessionStatus: session.status as "active" | "paused",
      mode: session.mode,
      startTimeFormatted: fmtTime(session.startedAt),
      elapsedMs: elapsed,
      elapsedFormatted: fmtDuration(elapsed),
      prepaidSec: session.prepaidSec,
      remainingMs,
      remainingFormatted,
      isExpired,
      hourlyRate: dev.hourlyRate,
      currentEstimatedCharge: estimatedCharge,
    });
  }

  const onlineDevices = availableCount + inUseCount;
  const occupancyPercent =
    onlineDevices === 0 ? 0 : Math.round((inUseCount / onlineDevices) * 100);

  const activeAlerts: Array<{ id: string; title: string; sub: string; sev: string }> = [];
  for (const b of bookedDevices) {
    if (b.isExpired) {
      activeAlerts.push({
        id: `exp-${b.deviceId}`,
        title: `Time Expired · ${b.deviceName}`,
        sub: `${b.memberName} is over prepaid duration. Action needed.`,
        sev: "danger",
      });
    } else if (b.mode === "package" && b.remainingMs <= 5 * 60_000 && b.remainingMs > 0) {
      activeAlerts.push({
        id: `warn-${b.deviceId}`,
        title: `Expiring Soon · ${b.deviceName}`,
        sub: `${b.memberName} has less than 5 minutes remaining.`,
        sev: "warn",
      });
    }
  }

  return {
    timestamp: new Date(now).toLocaleTimeString(),
    timeNow: now,
    totalDevices: devices.length,
    availableCount,
    inUseCount,
    maintenanceCount,
    offlineCount,
    occupancyPercent,
    emptyDevices: availableDevices,
    bookedDevices,
    alerts: activeAlerts,
    activeSessionsCount: sessions.length,
  };
}

/**
 * Builds the comprehensive grounded system prompt injected into LLM requests.
 */
export function buildSystemPrompt(snapshot: FloorSnapshot): string {
  const emptyDeviceList =
    snapshot.emptyDevices.length === 0
      ? "None (all operational stations are currently occupied or offline)"
      : snapshot.emptyDevices
          .map(
            (d) =>
              `- [AVAILABLE] ${d.name} (${d.typeLabel}) in Zone "${d.zone}" | Rate: ${money(d.hourlyRate)}/hr | Specs: ${d.specs}`
          )
          .join("\n");

  const bookedDeviceList =
    snapshot.bookedDevices.length === 0
      ? "None (no active sessions on the floor right now)"
      : snapshot.bookedDevices
          .map(
            (b) =>
              `- [BOOKED] ${b.deviceName} (${b.zone}) | Player: ${b.memberName} (${b.memberTier} tier) | Mode: ${b.mode.toUpperCase()} | Started: ${b.startTimeFormatted} | Elapsed: ${b.elapsedFormatted} | Status: ${b.sessionStatus.toUpperCase()} | Remaining: ${b.remainingFormatted} ${b.isExpired ? "⚠️ OVERDUE" : ""} | Est. Charge: ${money(b.currentEstimatedCharge)}`
          )
          .join("\n");

  const alertsList =
    snapshot.alerts.length === 0
      ? "None. All sessions running normally."
      : snapshot.alerts.map((a) => `- [${a.sev.toUpperCase()}] ${a.title}: ${a.sub}`).join("\n");

  return `You are the GameNation AI Floor Monitor, an intelligent operations copilot for a state-of-the-art gaming café and esports arena.

Your primary mission is to provide instantaneous, 100% accurate information on:
1. Which gaming devices/stations are EMPTY and available for walk-in players.
2. The exact PLAY DURATION and REMAINING TIME of all currently BOOKED devices.
3. Overdue or expiring sessions that require staff attention.

=== LIVE VENUE TELEMETRY (Current Time: ${snapshot.timestamp}) ===
- Total Registered Stations: ${snapshot.totalDevices}
- Empty / Available Stations: ${snapshot.availableCount}
- Booked / In-Use Stations: ${snapshot.inUseCount}
- Maintenance Stations: ${snapshot.maintenanceCount}
- Offline Stations: ${snapshot.offlineCount}
- Floor Occupancy: ${snapshot.occupancyPercent}%

--- LIST OF EMPTY / AVAILABLE STATIONS ---
${emptyDeviceList}

--- LIST OF BOOKED STATIONS & ACTIVE DURATIONS ---
${bookedDeviceList}

--- ACTIVE OPERATIONAL ALERTS ---
${alertsList}

=== RESPONSE GUIDELINES ===
- Answer directly, crisply, and professionally with cyber/ops tone.
- When the user asks about empty or available devices, group or highlight them clearly with their Station Name, Zone, and Hourly Rate.
- When the user asks about duration of booked devices, explicitly report the Station Name, Current Player, Elapsed Duration (e.g. "45m", "1h 20m"), and Remaining Duration (or PAYG status).
- Flag any expired sessions with ⚠️ warning so staff can extend or settle them.
- If there are 0 devices or 0 sessions, politely explain that the venue is currently clear or no devices have been registered yet, and suggest adding them or seating a walk-in.
- Format responses cleanly using markdown bullet points, bold highlights, and tables where appropriate.`;
}

/**
 * Deterministic local instant query engine for rapid answers without network latency.
 */
export function localFloorQuery(query: string, snapshot: FloorSnapshot): string | null {
  const q = query.toLowerCase().trim();

  const isAskingEmpty =
    q.includes("empty") ||
    q.includes("available") ||
    q.includes("free") ||
    q.includes("vacant") ||
    q.includes("unoccupied") ||
    q.includes("open");

  const isAskingDurationOrBooked =
    q.includes("duration") ||
    q.includes("booked") ||
    q.includes("in use") ||
    q.includes("occupied") ||
    q.includes("active session") ||
    q.includes("playing") ||
    q.includes("who is on");

  const isAskingAlerts =
    q.includes("alert") ||
    q.includes("expir") ||
    q.includes("overdue") ||
    q.includes("warning");

  if (isAskingEmpty && !isAskingDurationOrBooked) {
    if (snapshot.emptyDevices.length === 0) {
      if (snapshot.totalDevices === 0) {
        return `**No devices registered yet.**\n\nThere are currently 0 devices in the system. Go to the **Devices** tab to add your gaming PCs, consoles, or VR rigs.`;
      }
      return `**No empty stations available.**\n\nAll ${snapshot.inUseCount} active stations are currently occupied (Occupancy: **${snapshot.occupancyPercent}%**).`;
    }

    const rows = snapshot.emptyDevices
      .map(
        (d) =>
          `| **${d.name}** | ${d.typeLabel} | ${d.zone} | ${money(d.hourlyRate)}/hr | ${d.specs || "Standard"} |`
      )
      .join("\n");

    return `### 🟢 Empty & Available Stations (${snapshot.emptyDevices.length} available)

| Station | Type | Zone | Rate | Hardware / Specs |
| :--- | :--- | :--- | :--- | :--- |
${rows}

*All above stations are ready for immediate walk-in play.*`;
  }

  if (isAskingDurationOrBooked && !isAskingEmpty) {
    if (snapshot.bookedDevices.length === 0) {
      return `### ⏱️ Booked Devices & Play Duration\n\nThere are currently **no active bookings** on the floor.\n\n- Available Stations: **${snapshot.availableCount}**\n- Floor Occupancy: **0%**`;
    }

    const rows = snapshot.bookedDevices
      .map(
        (b) =>
          `| **${b.deviceName}** (${b.zone}) | ${b.memberName} | **${b.elapsedFormatted}** | ${b.isExpired ? "⚠️ **" + b.remainingFormatted + "**" : b.remainingFormatted} | ${b.mode.toUpperCase()} | ${money(b.currentEstimatedCharge)} |`
      )
      .join("\n");

    return `### ⏱️ Currently Booked Stations & Duration (${snapshot.bookedDevices.length} active)

| Station | Player | Time Played | Time Remaining | Mode | Est. Charge |
| :--- | :--- | :--- | :--- | :--- | :--- |
${rows}

${
  snapshot.alerts.length > 0
    ? `\n> ⚠️ **Alert**: ${snapshot.alerts.length} session(s) require staff attention (expired or near expiration).`
    : ""
}`;
  }

  if (isAskingAlerts) {
    if (snapshot.alerts.length === 0) {
      return `### ✅ All Sessions Running Smoothly\n\nNo stations have expired or are nearing expiration right now. All ${snapshot.bookedDevices.length} active sessions are within their allotted time.`;
    }
    const alertItems = snapshot.alerts
      .map((a) => `- **${a.title}**: ${a.sub}`)
      .join("\n");
    return `### ⚠️ Active Floor Alerts (${snapshot.alerts.length})\n\n${alertItems}`;
  }

  return null;
}

/**
 * Execute request to OpenRouter API.
 */
export async function callAI(
  messages: ChatMessage[],
  snapshot: FloorSnapshot,
  settings: AISettings
): Promise<string> {
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    throw new Error(
      "OpenRouter API key is missing. Please configure your key in AI Settings."
    );
  }

  const systemPrompt = buildSystemPrompt(snapshot);

  const formattedMessages = [
    { role: "system", content: systemPrompt },
    ...messages
      .slice(-10) // keep last 10 messages for context
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
  ];

  const payload = {
    model: settings.model || "google/gemini-2.0-flash-001",
    messages: formattedMessages,
    temperature: settings.temperature ?? 0.2,
    max_tokens: 1000,
  };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://GameNation.cafe",
      "X-Title": "GameNation Gaming Cafe Operations",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorDetails = "";
    try {
      const errJson = await response.json();
      errorDetails = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errorDetails = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(`OpenRouter API error: ${errorDetails}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("No response text received from AI provider.");
  }

  return text;
}
