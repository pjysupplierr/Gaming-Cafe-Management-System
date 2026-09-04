import { useMemo, useState } from "react";
import { Banknote, CreditCard, Download, Printer, Search, Wallet as WalletIcon } from "lucide-react";
import { useStore } from "./store";
import type { PayMethod, Tx, TxKind } from "./types";
import { downloadCSV, fmtDate, fmtTime, isToday, METHOD_LABEL, money } from "./utils";
import { Badge, btnGhost, cardCls, EmptyState, inputCls, Modal, btnPrimary } from "./ui";

type Range = "today" | "7d" | "30d" | "all";

export function Billing() {
  const { state, now, toast } = useStore();
  const [q, setQ] = useState("");
  const [kindF, setKindF] = useState<"all" | TxKind>("all");
  const [methodF, setMethodF] = useState<"all" | PayMethod>("all");
  const [range, setRange] = useState<Range>("7d");
  const [receipt, setReceipt] = useState<Tx | null>(null);

  const filtered = useMemo(() => {
    const cutoff =
      range === "today"
        ? (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); })()
        : range === "7d"
          ? now - 7 * 86400000
          : range === "30d"
            ? now - 30 * 86400000
            : 0;
    return state.transactions.filter(
      (t) =>
        t.at >= cutoff &&
        (kindF === "all" || t.kind === kindF) &&
        (methodF === "all" || t.method === methodF) &&
        (q.trim() === "" || `${t.label} ${t.memberName} ${t.detail ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    );
  }, [state.transactions, q, kindF, methodF, range, now]);

  const sum = (txs: Tx[]) => txs.reduce((s, t) => s + t.amount, 0);
  const today = sum(state.transactions.filter((t) => isToday(t.at, now)));
  const week = sum(state.transactions.filter((t) => t.at >= now - 7 * 86400000));
  const walletLiability = state.members.reduce((s, m) => s + m.wallet, 0);

  const exportCSV = () => {
    downloadCSV("blueshift-transactions.csv", [
      ["Date", "Time", "Label", "Detail", "Member", "Type", "Method", "Amount"],
      ...filtered.map((t) => [
        fmtDate(t.at),
        fmtTime(t.at),
        t.label,
        t.detail ?? "",
        t.memberName,
        t.kind,
        METHOD_LABEL[t.method],
        t.amount.toFixed(2),
      ]),
    ]);
    toast(`Exported ${filtered.length} transactions to CSV`);
  };

  return (
    <div className="space-y-5">
      {/* totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: "Revenue today", v: money(today), s: "all payment methods" },
          { k: "Last 7 days", v: money(week), s: "gross collected" },
          { k: "Transactions", v: String(state.transactions.length), s: "in recorded history" },
          { k: "Wallet liability", v: money(walletLiability), s: `${state.members.length} member wallets` },
        ].map((x) => (
          <div key={x.k} className={`${cardCls} p-4`}>
            <p className="text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase">{x.k}</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular dark:text-white">{x.v}</p>
            <p className="mt-1 text-xs text-slate-400">{x.s}</p>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Search label, member, detail…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className={`${inputCls} w-auto`} value={range} onChange={(e) => setRange(e.target.value as Range)}>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
        <select className={`${inputCls} w-auto`} value={kindF} onChange={(e) => setKindF(e.target.value as typeof kindF)}>
          <option value="all">All types</option>
          <option value="session">Sessions</option>
          <option value="package">Packages</option>
          <option value="topup">Top-ups</option>
        </select>
        <select className={`${inputCls} w-auto`} value={methodF} onChange={(e) => setMethodF(e.target.value as typeof methodF)}>
          <option value="all">All methods</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="wallet">Wallet</option>
        </select>
        <button className={btnGhost} onClick={exportCSV}>
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* table */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-ink-700">
          <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
            {filtered.length} transactions · {money(sum(filtered))}
          </p>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-white dark:bg-ink-850">
              <tr className="border-b border-slate-200 text-[11px] tracking-[0.08em] text-slate-400 uppercase dark:border-ink-700">
                <th className="px-4 py-2.5 font-semibold">When</th>
                <th className="px-2 py-2.5 font-semibold">Item</th>
                <th className="px-2 py-2.5 font-semibold">Member</th>
                <th className="px-2 py-2.5 font-semibold">Type</th>
                <th className="px-2 py-2.5 font-semibold">Method</th>
                <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-ink-700/60">
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setReceipt(t)}
                  className="cursor-pointer transition hover:bg-brand-50/40 dark:hover:bg-brand-500/[0.06]"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs text-slate-400">
                    {fmtDate(t.at)} <span className="text-slate-300 dark:text-slate-500">{fmtTime(t.at)}</span>
                  </td>
                  <td className="px-2 py-2.5">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{t.label}</p>
                    {t.detail && <p className="text-xs text-slate-400">{t.detail}</p>}
                  </td>
                  <td className="px-2 py-2.5 text-slate-500 dark:text-slate-400">{t.memberName}</td>
                  <td className="px-2 py-2.5">
                    <Badge tone={t.kind === "topup" ? "green" : t.kind === "package" ? "amber" : "blue"}>{t.kind}</Badge>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t.method === "cash" ? (
                        <Banknote className="h-3.5 w-3.5" />
                      ) : t.method === "card" ? (
                        <CreditCard className="h-3.5 w-3.5" />
                      ) : (
                        <WalletIcon className="h-3.5 w-3.5" />
                      )}
                      {METHOD_LABEL[t.method]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 tabular dark:text-white">
                    {money(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-6">
              <EmptyState title="No transactions match" sub="Widen the date range or clear the filters." />
            </div>
          )}
        </div>
      </div>

      {receipt && <TxReceipt tx={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function TxReceipt({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  return (
    <Modal title="Receipt" sub={`${fmtDate(tx.at)} · ${fmtTime(tx.at)}`} onClose={onClose}>
      <div className="space-y-1.5 rounded-lg border border-dashed border-slate-300 p-4 font-mono text-xs text-slate-600 dark:border-ink-600 dark:text-slate-300">
        <p className="text-center text-sm font-bold tracking-widest text-slate-900 dark:text-white">BLUESHIFT GAMING</p>
        <p className="text-center text-[10px] text-slate-400">12 Volt Alley · License #GC-2214</p>
        <div className="my-2 border-t border-dashed border-slate-300 dark:border-ink-600" />
        <div className="flex justify-between"><span>Item</span><span className="font-semibold">{tx.label}</span></div>
        {tx.detail && <div className="flex justify-between"><span>Detail</span><span>{tx.detail}</span></div>}
        <div className="flex justify-between"><span>Member</span><span>{tx.memberName}</span></div>
        <div className="flex justify-between"><span>Type</span><span className="capitalize">{tx.kind}</span></div>
        <div className="flex justify-between"><span>Method</span><span>{METHOD_LABEL[tx.method]}</span></div>
        <div className="my-2 border-t border-dashed border-slate-300 dark:border-ink-600" />
        <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white">
          <span>AMOUNT</span><span>{money(tx.amount)}</span>
        </div>
        <p className="pt-1 text-center text-[10px] text-slate-400">Ref {tx.id.toUpperCase().slice(0, 10)} · GLHF!</p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btnGhost} onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </button>
        <button className={btnPrimary} onClick={onClose}>Close</button>
      </div>
      <div className="print-only">
        <h1 style={{ textAlign: "center", fontSize: 20, letterSpacing: 4 }}>BLUESHIFT GAMING</h1>
        <p style={{ textAlign: "center", fontSize: 11 }}>12 Volt Alley · License #GC-2214</p>
        <hr style={{ borderStyle: "dashed" }} />
        <p>Item .......... {tx.label}</p>
        {tx.detail && <p>Detail ........ {tx.detail}</p>}
        <p>Member ........ {tx.memberName}</p>
        <p>Type .......... {tx.kind} · {METHOD_LABEL[tx.method]}</p>
        <p>Date .......... {fmtDate(tx.at)} {fmtTime(tx.at)}</p>
        <hr style={{ borderStyle: "dashed" }} />
        <p style={{ fontSize: 16, fontWeight: 700 }}>AMOUNT ........ {money(tx.amount)}</p>
        <p style={{ textAlign: "center", marginTop: 16, fontSize: 11 }}>Ref {tx.id.toUpperCase().slice(0, 10)} · Thanks for playing!</p>
      </div>
    </Modal>
  );
}
