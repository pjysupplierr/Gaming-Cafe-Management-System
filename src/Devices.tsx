import { useMemo, useState } from "react";
import { Download, Pencil, Play, Plus, Search, Trash2, Upload, Wrench } from "lucide-react";
import { useStore } from "./store";
import { DEVICE_META, STATUS_META, type DeviceStatus, type DeviceType } from "./types";
import { downloadCSV, money } from "./utils";
import { btnGhost, btnPrimary, cardCls, DeviceIcon, EmptyState, StatusBadge, inputCls } from "./ui";
import { ConfirmModal, DeviceFormModal, ImportDevicesModal, StartSessionModal } from "./modals";

export function Devices() {
  const { state, isAdmin, toast, setDeviceStatus, deleteDevice } = useStore();
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState<"all" | DeviceType>("all");
  const [statusF, setStatusF] = useState<"all" | DeviceStatus>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [startFor, setStartFor] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      state.devices.filter(
        (d) =>
          (typeF === "all" || d.type === typeF) &&
          (statusF === "all" || d.status === statusF) &&
          (q.trim() === "" ||
            `${d.name} ${d.zone} ${d.specs}`.toLowerCase().includes(q.trim().toLowerCase()))
      ),
    [state.devices, q, typeF, statusF]
  );

  const gate = () => {
    if (!isAdmin) {
      toast("Staff role can't modify the fleet — switch to Admin.", "error");
      return false;
    }
    return true;
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((d) => d.id))));
  };

  const bulkStatus = (status: DeviceStatus) => {
    if (!gate()) return;
    let n = 0;
    selected.forEach((id) => {
      const d = state.devices.find((x) => x.id === id);
      if (d && d.status !== "in_use") {
        setDeviceStatus(id, status);
        n++;
      }
    });
    toast(`${n} device${n === 1 ? "" : "s"} → ${STATUS_META[status].label}`);
    setSelected(new Set());
  };

  const exportCSV = () => {
    downloadCSV("GameNation-devices.csv", [
      ["Name", "Type", "Zone", "Hourly rate", "Status", "Specs"],
      ...filtered.map((d) => [d.name, DEVICE_META[d.type].label, d.zone, d.hourlyRate, STATUS_META[d.status].label, d.specs]),
    ]);
    toast(`Exported ${filtered.length} devices to CSV`);
  };

  const editingDevice = editing ? state.devices.find((d) => d.id === editing) : undefined;

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Search name, zone, specs…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className={`${inputCls} w-auto`} value={typeF} onChange={(e) => setTypeF(e.target.value as typeof typeF)}>
          <option value="all">All types</option>
          {(Object.keys(DEVICE_META) as DeviceType[]).map((t) => (
            <option key={t} value={t}>{DEVICE_META[t].plural}</option>
          ))}
        </select>
        <select className={`${inputCls} w-auto`} value={statusF} onChange={(e) => setStatusF(e.target.value as typeof statusF)}>
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_META) as DeviceStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
        <button className={btnGhost} onClick={exportCSV}>
          <Download className="h-4 w-4" /> Export
        </button>
        <button className={btnGhost} onClick={() => gate() && setImporting(true)}>
          <Upload className="h-4 w-4" /> Import
        </button>
        <button className={btnPrimary} onClick={() => gate() && setAdding(true)}>
          <Plus className="h-4 w-4" /> Add device
        </button>
      </div>

      {/* bulk bar */}
      {selected.size > 0 && (
        <div className="pop-in flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 dark:border-brand-500/30 dark:bg-brand-500/10">
          <span className="text-sm font-semibold text-brand-800 dark:text-brand-300">
            {selected.size} selected
          </span>
          <span className="mx-1 h-4 w-px bg-brand-200 dark:bg-brand-500/30" />
          <button
            onClick={() => bulkStatus("maintenance")}
            className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-600 shadow-sm transition hover:bg-amber-50 dark:bg-ink-800 dark:text-amber-400"
          >
            <Wrench className="h-3.5 w-3.5" /> Send to maintenance
          </button>
          <button
            onClick={() => bulkStatus("available")}
            className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-600 shadow-sm transition hover:bg-emerald-50 dark:bg-ink-800 dark:text-emerald-400"
          >
            <Plus className="h-3.5 w-3.5" /> Mark available
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            Clear
          </button>
        </div>
      )}

      {/* table */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] tracking-[0.08em] text-slate-400 uppercase dark:border-ink-700">
                <th className="px-4 py-3 font-semibold">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    className="h-4 w-4 accent-brand-600"
                    aria-label="Select all devices"
                  />
                </th>
                <th className="px-2 py-3 font-semibold">Device</th>
                <th className="px-2 py-3 font-semibold">Zone</th>
                <th className="px-2 py-3 font-semibold">Rate</th>
                <th className="px-2 py-3 font-semibold">Status</th>
                <th className="px-2 py-3 font-semibold">Specs</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-ink-700/60">
              {filtered.map((d) => (
                <tr key={d.id} className="group transition hover:bg-slate-50/70 dark:hover:bg-ink-800/50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(d.id)) next.delete(d.id);
                          else next.add(d.id);
                          return next;
                        })
                      }
                      className="h-4 w-4 accent-brand-600"
                      aria-label={`Select ${d.name}`}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                        <DeviceIcon type={d.type} className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{d.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {DEVICE_META[d.type].label}
                          {d.type === "console" && d.playerCount ? ` · ${d.playerCount} Players` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-slate-500 dark:text-slate-400">{d.zone}</td>
                  <td className="px-2 py-3 font-mono font-semibold text-slate-800 dark:text-slate-100">
                    {money(d.hourlyRate)}<span className="text-slate-400">/h</span>
                  </td>
                  <td className="px-2 py-3"><StatusBadge status={d.status} /></td>
                  <td className="max-w-[220px] truncate px-2 py-3 text-xs text-slate-400">{d.specs || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      {d.status === "available" && (
                        <button
                          onClick={() => setStartFor(d.id)}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10"
                          aria-label={`Start session on ${d.name}`}
                          title="Start session"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => gate() && setEditing(d.id)}
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10"
                        aria-label={`Edit ${d.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => gate() && setDeleting(d.id)}
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                        aria-label={`Delete ${d.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-6">
            <EmptyState
              title="No devices match"
              sub="Adjust the filters, or add a new station to the floor."
              action={
                <button className={btnPrimary} onClick={() => gate() && setAdding(true)}>
                  <Plus className="h-4 w-4" /> Add device
                </button>
              }
            />
          </div>
        )}
      </div>

      {(adding || editingDevice) && (
        <DeviceFormModal device={editingDevice} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {importing && <ImportDevicesModal onClose={() => setImporting(false)} />}
      {deleting && (
        <ConfirmModal
          title="Remove device?"
          sub={`${state.devices.find((d) => d.id === deleting)?.name} will be removed from the floor. Transaction history is kept.`}
          confirmLabel="Remove device"
          onConfirm={() => {
            const res = deleteDevice(deleting);
            if (!res.ok) toast(res.reason, "error");
            else toast("Device removed from the floor");
          }}
          onClose={() => setDeleting(null)}
        />
      )}
      {startFor && <StartSessionModal deviceId={startFor} onClose={() => setStartFor(null)} />}
    </div>
  );
}
