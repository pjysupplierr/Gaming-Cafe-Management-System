import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  AlertCircle,
  Bot,
  Check,
  Copy,
  Eye,
  EyeOff,
  Key,
  Maximize2,
  Minimize2,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useStore } from "../store";
import {
  AVAILABLE_MODELS,
  DEFAULT_SETTINGS,
  callAI,
  extractFloorSnapshot,
  localFloorQuery,
} from "./aiService";
import type { AISettings, ChatMessage } from "./types";

const LS_AI_SETTINGS = "GameNation:ai:settings";
const LS_AI_CHAT = "GameNation:ai:chat_history";

function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(LS_AI_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.apiKey === "string") {
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          apiKey: parsed.apiKey || DEFAULT_SETTINGS.apiKey,
        };
      }
    }
  } catch {
    /* fallback to default */
  }
  return DEFAULT_SETTINGS;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "welcome-1",
    role: "assistant",
    content: `👋 **GameNation AI Floor Monitor online.**

I am continuously synced with your gaming floor telemetry. You can ask me anytime:
- 🟢 **"Which devices are empty?"**
- ⏱️ **"What is the duration of all booked devices?"**
- ⚠️ **"Are any sessions expired or about to run out of time?"**
- 🎮 **"Show available Gaming PCs or VR bays"**`,
    timestamp: Date.now(),
    suggestedQueries: [
      "Which devices are empty?",
      "Duration of booked devices",
      "Any sessions about to expire?",
      "Summarize current floor occupancy",
    ],
  },
];

function loadChatHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(LS_AI_CHAT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore */
  }
  return INITIAL_MESSAGES;
}

/**
 * Lightweight formatting for AI responses (headers, bold, tables, lists, quotes)
 */
function FormattedMessage({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: JSX.Element[] = [];

  let tableRows: string[][] = [];
  let inTable = false;

  const flushTable = (key: number) => {
    if (tableRows.length === 0) return;
    const header = tableRows[0];
    const data = tableRows.slice(1);
    elements.push(
      <div key={`table-${key}`} className="my-2.5 overflow-x-auto rounded-lg border border-slate-700/60 bg-ink-950/80">
        <table className="w-full text-left text-xs">
          {header && (
            <thead className="border-b border-slate-700/70 bg-ink-900/90 text-slate-300 font-semibold">
              <tr>
                {header.map((col, ci) => (
                  <th key={ci} className="px-3 py-2">
                    {renderInline(col)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-slate-800/60 text-slate-200">
            {data.map((row, ri) => (
              <tr key={ri} className="hover:bg-slate-800/30 transition-colors">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 tabular">
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
    inTable = false;
  };

  const renderInline = (s: string) => {
    // split bold **text**
    const parts = s.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-slate-100">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <Fragment key={i}>{part}</Fragment>;
    });
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Table detection
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      // separator row like | :--- | :--- |
      if (/^\|[-: |]+\|$/.test(trimmed)) {
        return;
      }
      inTable = true;
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      tableRows.push(cells);
      return;
    } else if (inTable) {
      flushTable(idx);
    }

    if (!trimmed) {
      elements.push(<div key={idx} className="h-2" />);
      return;
    }

    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4 key={idx} className="mt-2.5 mb-1 font-display text-sm font-bold text-brand-300 tracking-tight">
          {renderInline(trimmed.replace(/^###\s+/, ""))}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={idx} className="mt-3 mb-1.5 font-display text-base font-bold text-white tracking-tight">
          {renderInline(trimmed.replace(/^##\s+/, ""))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith("> ")) {
      elements.push(
        <blockquote
          key={idx}
          className="my-1.5 border-l-2 border-amber-500 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 rounded-r"
        >
          {renderInline(trimmed.replace(/^>\s+/, ""))}
        </blockquote>
      );
      return;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <div key={idx} className="ml-1 my-0.5 flex items-start gap-2 text-xs text-slate-300">
          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
          <span className="leading-relaxed">{renderInline(trimmed.replace(/^[-*]\s+/, ""))}</span>
        </div>
      );
      return;
    }

    elements.push(
      <p key={idx} className="my-1 text-xs leading-relaxed text-slate-200">
        {renderInline(trimmed)}
      </p>
    );
  });

  if (inTable) {
    flushTable(lines.length);
  }

  return <div className="space-y-0.5">{elements}</div>;
}

export function AIChatDrawer({
  isOpen,
  onClose,
  onOpen,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}) {
  const { state, now } = useStore();
  const [messages, setMessages] = useState<ChatMessage[]>(loadChatHistory);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AISettings>(loadSettings);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const floorSnapshot = extractFloorSnapshot(state, now);

  // Save chat history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LS_AI_CHAT, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, loading]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const query = (textToSend || input).trim();
      if (!query || loading) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: query,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      if (!textToSend) setInput("");
      setLoading(true);

      // Check instant local rule fallback
      const localResult = localFloorQuery(query, floorSnapshot);

      try {
        let aiText = "";
        // If query is standard device/duration and user wants instant local or has no key
        if (!settings.apiKey && localResult) {
          aiText = localResult;
        } else {
          try {
            aiText = await callAI([...messages, userMsg], floorSnapshot, settings);
          } catch (err: unknown) {
            const errStr = err instanceof Error ? err.message : String(err);
            console.warn("AI API call failed, falling back to local snapshot analysis:", errStr);
            if (localResult) {
              aiText = `${localResult}\n\n*(Telemetry generated via local floor analysis — OpenRouter: ${errStr})*`;
            } else {
              throw err;
            }
          }
        }

        const assistantMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: aiText,
          timestamp: Date.now(),
          suggestedQueries: [
            "Which devices are empty?",
            "Duration of booked devices",
            "Are there any expired sessions?",
          ],
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: unknown) {
        const errStr = err instanceof Error ? err.message : String(err);
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `❌ **Failed to generate AI response**\n\n${errStr}\n\n*Please verify your API key in AI Settings (top-right cog).*`,
          timestamp: Date.now(),
          error: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, floorSnapshot, settings]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    if (window.confirm("Clear AI conversation history?")) {
      setMessages(INITIAL_MESSAGES);
      localStorage.removeItem(LS_AI_CHAT);
    }
  };

  const handleSaveSettings = () => {
    try {
      localStorage.setItem(LS_AI_SETTINGS, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
    setSettingsOpen(false);
  };

  const handleTestConnection = async () => {
    setTestStatus("testing");
    setTestMessage("Pinging OpenRouter API...");
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey.trim()}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "GameNation Gaming Cafe",
        },
        body: JSON.stringify({
          model: settings.model || "google/gemini-2.0-flash-001",
          messages: [{ role: "user", content: "Reply strictly with: PONG" }],
          max_tokens: 10,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error?.message || `HTTP ${response.status}`);
      }

      setTestStatus("success");
      setTestMessage("Connection Verified! OpenRouter is ready.");
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      setTestStatus("error");
      setTestMessage(`Failed: ${errStr}`);
    }
  };

  return (
    <>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          onClick={onOpen}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-gradient-to-r from-brand-600 via-indigo-600 to-cyan-500 px-4 py-3 text-white font-medium shadow-xl shadow-brand-500/30 transition-all duration-300 hover:scale-105 active:scale-95 group"
          aria-label="Open AI Floor Monitor"
        >
          <span className="relative flex h-3 w-3">
            <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-400" />
          </span>
          <Bot className="h-5 w-5 transition-transform group-hover:rotate-12" />
          <span className="font-display font-bold tracking-tight text-sm">Floor AI</span>

          {floorSnapshot.alerts.length > 0 && (
            <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow-sm">
              {floorSnapshot.alerts.length}
            </span>
          )}
        </button>
      )}

      {/* Slide-out Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop on mobile */}
          <div
            className="fixed inset-0 bg-ink-950/60 backdrop-blur-xs transition-opacity sm:hidden"
            onClick={onClose}
          />

          <aside className="relative flex h-full w-full sm:w-[500px] lg:w-[540px] flex-col border-l border-brand-500/30 bg-ink-900/95 text-slate-100 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3.5 bg-ink-950/80">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-brand-600 to-cyan-500 shadow-md shadow-brand-500/30">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-sm font-bold tracking-tight text-white">
                      AI Floor Monitor
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Live Sync
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Grounded with live stations & active sessions
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-brand-300"
                  title="AI Provider Settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <button
                  onClick={handleClearHistory}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-rose-400"
                  title="Clear Chat History"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                  title="Close AI Monitor"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Telemetry Quick Glance Bar */}
            <div className="grid grid-cols-3 border-b border-slate-800 bg-ink-950/40 px-4 py-2 text-center text-xs">
              <div className="border-r border-slate-800/80 pr-2">
                <span className="text-[10px] uppercase font-semibold text-slate-500">Empty / Free</span>
                <p className="font-mono text-sm font-bold text-emerald-400">
                  {floorSnapshot.availableCount}
                  <span className="text-[10px] font-normal text-slate-400"> / {floorSnapshot.totalDevices}</span>
                </p>
              </div>
              <div className="border-r border-slate-800/80 px-2">
                <span className="text-[10px] uppercase font-semibold text-slate-500">Booked / In Use</span>
                <p className="font-mono text-sm font-bold text-brand-300">
                  {floorSnapshot.inUseCount}
                  <span className="text-[10px] font-normal text-slate-400"> / {floorSnapshot.totalDevices}</span>
                </p>
              </div>
              <div className="pl-2">
                <span className="text-[10px] uppercase font-semibold text-slate-500">Floor Occupancy</span>
                <p className="font-mono text-sm font-bold text-cyan-300">
                  {floorSnapshot.occupancyPercent}%
                </p>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"} group`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-[10px] font-semibold text-slate-500">
                        {isUser ? "Operator" : "Floor AI"}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {!isUser && (
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="opacity-0 group-hover:opacity-100 transition p-1 text-slate-500 hover:text-slate-300"
                          title="Copy message"
                        >
                          {copiedId === msg.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>

                    <div
                      className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm shadow-md ${
                        isUser
                          ? "bg-brand-600 text-white rounded-tr-xs"
                          : msg.error
                          ? "bg-rose-950/40 border border-rose-800/60 text-rose-200 rounded-tl-xs"
                          : "bg-ink-800/90 border border-slate-700/60 text-slate-200 rounded-tl-xs backdrop-blur-sm"
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <FormattedMessage text={msg.content} />
                      )}
                    </div>

                    {/* Optional Suggestion Chips below assistant messages */}
                    {!isUser && msg.suggestedQueries && msg.suggestedQueries.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.suggestedQueries.map((sq, i) => (
                          <button
                            key={i}
                            onClick={() => handleSend(sq)}
                            className="rounded-full border border-slate-700/70 bg-ink-800/60 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-brand-400 hover:text-brand-300 hover:bg-brand-500/10"
                          >
                            {sq}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div className="flex items-center gap-2.5 rounded-xl border border-slate-700/50 bg-ink-800/60 px-4 py-3 text-xs text-slate-300">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500/20 text-brand-300 animate-pulse">
                    <Sparkles className="h-3.5 w-3.5 animate-spin" />
                  </div>
                  <span>Analyzing floor telemetry & generating response...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Action Prompt Chips */}
            <div className="border-t border-slate-800/60 bg-ink-950/60 px-4 py-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                <button
                  onClick={() => handleSend("Which devices are empty right now?")}
                  className="shrink-0 flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 transition hover:bg-emerald-500/20"
                >
                  🟢 Empty Devices
                </button>
                <button
                  onClick={() => handleSend("What is the duration of all booked devices?")}
                  className="shrink-0 flex items-center gap-1 rounded-lg border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-xs text-brand-300 transition hover:bg-brand-500/20"
                >
                  ⏱️ Booked Durations
                </button>
                <button
                  onClick={() => handleSend("Are there any sessions expired or about to expire?")}
                  className="shrink-0 flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 transition hover:bg-amber-500/20"
                >
                  ⚠️ Expiring Sessions
                </button>
                <button
                  onClick={() => handleSend("Show all available Gaming PCs in Arena zones")}
                  className="shrink-0 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300 transition hover:border-slate-600"
                >
                  🎮 Arena PCs
                </button>
              </div>
            </div>

            {/* Input Form */}
            <div className="border-t border-slate-800/90 bg-ink-950/90 p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="Ask about empty stations, booked durations, alerts... (Enter to send)"
                  className="flex-1 resize-none rounded-xl border border-slate-700/80 bg-ink-800 px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/30 transition hover:bg-brand-500 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-slate-500">
                <span>Model: {settings.model}</span>
                <span>OpenRouter Active</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-ink-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-brand-400" />
                <h3 className="font-display text-base font-bold text-white">
                  AI Monitor Settings
                </h3>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  OpenRouter API Key
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showKey ? "text" : "password"}
                    value={settings.apiKey}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, apiKey: e.target.value }))
                    }
                    placeholder="sk-or-v1-..."
                    className="w-full rounded-lg border border-slate-700 bg-ink-800 px-3 py-2 pr-10 text-xs text-slate-100 focus:border-brand-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 text-slate-400 hover:text-slate-200"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Stored securely in your local browser storage.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Model Selection
                </label>
                <select
                  value={settings.model}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, model: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-ink-800 px-3 py-2 text-xs text-slate-100 focus:border-brand-500 focus:outline-none"
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.id})
                    </option>
                  ))}
                </select>
              </div>

              {testStatus !== "idle" && (
                <div
                  className={`rounded-lg p-3 text-xs flex items-start gap-2 ${
                    testStatus === "testing"
                      ? "bg-brand-950/50 border border-brand-800 text-brand-300"
                      : testStatus === "success"
                      ? "bg-emerald-950/50 border border-emerald-800 text-emerald-300"
                      : "bg-rose-950/50 border border-rose-800 text-rose-300"
                  }`}
                >
                  {testStatus === "testing" && <RefreshCw className="h-4 w-4 animate-spin shrink-0" />}
                  {testStatus === "success" && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
                  {testStatus === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />}
                  <span>{testMessage}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testStatus === "testing"}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-ink-800 px-3 py-2 text-xs font-medium text-slate-200 hover:border-brand-500 hover:text-brand-300 transition"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  Test Key
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-500"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
