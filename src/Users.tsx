import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Wallet as WalletIcon } from "lucide-react";
import { useStore } from "./store";
import { TIER_META, type Member, type Tier } from "./types";
import { fmtDateFull, money, timeAgo } from "./utils";
import { Badge, btnGhost, btnPrimary, cardCls, EmptyState, inputCls, Modal } from "./ui";
import { ConfirmModal, MemberFormModal, TopUpModal } from "./modals";

const tierTone: Record<Tier, "slate" | "blue" | "amber"> = {
  regular: "slate",
  premium: "blue",
  vip: "amber",
};

export function Users() {
  const { state, isAdmin, toast, deleteMember } = useStore();
  const [q, setQ] = useState("");
  const [tierF, setTierF] = useState<"all" | Tier>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [topUpFor, setTopUpFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const gate = () => {
    if (!isAdmin) {
      toast("Staff role can't modify member profiles — switch to Admin.", "error");
      return false;
    }
    return true;
  };

  const filtered = useMemo(
    () =>
      state.members.filter(
        (m) =>
          (tierF === "all" || m.tier === tierF) &&
          (q.trim() === "" || `${m.name} ${m.email} ${m.phone}`.toLowerCase().includes(q.trim().toLowerCase()))
      ),
    [state.members, q, tierF]
  );

  const sessionsOf = (id: string) => state.transactions.filter((t) => t.memberId === id && t.kind === "session").length;
  const spendOf = (id: string) =>
    state.transactions.filter((t) => t.memberId === id && t.kind !== "topup").reduce((s, t) => s + t.amount, 0);

  const editingMember = editing ? state.members.find((m) => m.id === editing) : undefined;
  const historyMember = historyFor ? state.members.find((m) => m.id === historyFor) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Search name, email, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className={`${inputCls} w-auto`} value={tierF} onChange={(e) => setTierF(e.target.value as typeof tierF)}>
          <option value="all">All tiers</option>
          {(Object.keys(TIER_META) as Tier[]).map((t) => (
            <option key={t} value={t}>{TIER_META[t].label}</option>
          ))}
        </select>
        <button className={btnPrimary} onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Register member
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((m) => {
          const live = state.sessions.some((s) => s.memberId === m.id && s.status !== "settled");
          const initials = m.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
          return (
            <div key={m.id} className={`${cardCls} p-4 transition hover:shadow-md`}>
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${
                    m.tier === "vip"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                      : m.tier === "premium"
                        ? "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                        : "bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-slate-300"
                  }`}
                >
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-display text-sm font-bold text-slate-900 dark:text-white">{m.name}</p>
                    <Badge tone={tierTone[m.tier]}>{TIER_META[m.tier].label}</Badge>
                    {live && (
                      <span className="relative flex h-2 w-2 shrink-0" title="On the floor now">
                        <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-400">{m.email} · {m.phone}</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-mist-50 p-2.5 text-center dark:bg-ink-900">
                <div>
                  <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">{money(m.wallet)}</p>
                  <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">Wallet</p>
                </div>
                <div>
                  <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">{sessionsOf(m.id)}</p>
                  <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">Sessions</p>
                </div>
                <div>
                  <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">{money(spendOf(m.id))}</p>
                  <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">Lifetime</p>
                </div>
              </div>

              <p className="mt-2 text-[11px] text-slate-400">
                {TIER_META[m.tier].blurb} · member since {fmtDateFull(m.joinedAt)}
              </p>

              <div className="mt-3 flex gap-1.5">
                <button
                  onClick={() => setTopUpFor(m.id)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-2 py-1.5 text-xs font-bold text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-700 active:scale-[0.98]"
                >
                  <WalletIcon className="h-3.5 w-3.5" /> Top up
                </button>
                <button
                  onClick={() => setHistoryFor(m.id)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-600 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-300"
                >
                  Activity
                </button>
                <button
                  onClick={() => gate() && setEditing(m.id)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-400 transition hover:border-brand-300 hover:text-brand-600 dark:border-ink-600 dark:bg-ink-800"
                  aria-label={`Edit ${m.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => gate() && setDeleting(m.id)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-400 transition hover:border-rose-300 hover:text-rose-600 dark:border-ink-600 dark:bg-ink-800"
                  aria-label={`Delete ${m.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          title="No members found"
          sub="Try a different search, or register a new player."
          action={
            <button className={btnPrimary} onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Register member
            </button>
          }
        />
      )}

      {(adding || editingMember) && (
        <MemberFormModal member={editingMember} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {topUpFor && <TopUpModal memberId={topUpFor} onClose={() => setTopUpFor(null)} />}
      {historyMember && <MemberHistory member={historyMember} onClose={() => setHistoryFor(null)} />}
      {deleting && (
        <ConfirmModal
          title="Remove member?"
          sub={`${state.members.find((m) => m.id === deleting)?.name}'s profile and wallet will be removed. Transaction history is kept.`}
          confirmLabel="Remove member"
          onConfirm={() => {
            const res = deleteMember(deleting);
            if (!res.ok) toast(res.reason, "error");
            else toast("Member removed");
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function MemberHistory({ member, onClose }: { member: Member; onClose: () => void }) {
  const { state, now } = useStore();
  const txs = state.transactions.filter((t) => t.memberId === member.id);
  return (
    <Modal title={`${member.name} — activity`} sub={`${txs.length} transactions · wallet ${money(member.wallet)}`} onClose={onClose} wide>
      {txs.length === 0 ? (
        <EmptyState title="No activity yet" sub="Transactions will appear here after their first session or top-up." />
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-ink-700/60">
          {txs.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5">
              <Badge tone={t.kind === "topup" ? "green" : t.kind === "package" ? "amber" : "blue"}>
                {t.kind}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{t.label}</p>
                <p className="truncate text-xs text-slate-400">{t.detail ?? t.method} · {timeAgo(t.at, now)}</p>
              </div>
              <span className="font-mono text-sm font-bold text-slate-900 tabular dark:text-white">{money(t.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button className={btnGhost} onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
