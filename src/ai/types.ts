import type { DeviceType, DeviceStatus, Tier, SessionMode } from "../types";

export type AIProvider = "openrouter" | "gemini" | "openai";

export interface AISettings {
  apiKey: string;
  provider: AIProvider;
  model: string;
  temperature?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: boolean;
  suggestedQueries?: string[];
}

export interface EmptyDeviceSummary {
  id: string;
  name: string;
  type: DeviceType;
  typeLabel: string;
  zone: string;
  hourlyRate: number;
  specs: string;
}

export interface BookedDeviceSummary {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  zone: string;
  memberId: string;
  memberName: string;
  memberTier: Tier;
  sessionStatus: "active" | "paused";
  mode: SessionMode;
  startTimeFormatted: string;
  elapsedMs: number;
  elapsedFormatted: string;
  prepaidSec: number;
  remainingMs: number;
  remainingFormatted: string;
  isExpired: boolean;
  hourlyRate: number;
  currentEstimatedCharge: number;
}

export interface FloorSnapshot {
  timestamp: string;
  timeNow: number;
  totalDevices: number;
  availableCount: number;
  inUseCount: number;
  maintenanceCount: number;
  offlineCount: number;
  occupancyPercent: number;
  emptyDevices: EmptyDeviceSummary[];
  bookedDevices: BookedDeviceSummary[];
  alerts: Array<{ id: string; title: string; sub: string; sev: string }>;
  activeSessionsCount: number;
}
