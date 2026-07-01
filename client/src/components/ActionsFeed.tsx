import type { ActionRow, OutboxRow } from "../lib/api";
import { timeAgo } from "../lib/format";
import { Badge, Card } from "./ui";

function levelDot(level: string): string {
  if (level === "error") return "bg-red-500";
  if (level === "warn") return "bg-amber-500";
  return "bg-violet-500";
}

export function ActionsFeed({ actions, outbox }: { actions: ActionRow[]; outbox: OutboxRow[] }) {
  const inFlight = outbox.filter((o) => o.status === "pending" || o.status === "processing");
  const failed = outbox.filter((o) => o.status === "failed");

  return (
    <div className="space-y-4">
      <Card className="p-0 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold tracking-tight text-slate-900">Actions taken</h2>
          <p className="text-xs text-slate-400">Replies, mirrors, AI triage, retries</p>
        </div>
        {actions.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">Nothing yet.</div>
        ) : (
          <ul className="max-h-[22rem] divide-y divide-slate-50 overflow-y-auto">
            {actions.map((a) => (
              <li key={a.id} className="flex gap-3 px-6 py-3 hover:bg-slate-50/70">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${levelDot(a.level)}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700">{a.message}</p>
                  <p className="text-xs text-slate-400">
                    {a.kind} · {timeAgo(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card interactive>
        <h2 className="text-base font-bold tracking-tight text-slate-900">Delivery health</h2>
        <p className="text-xs text-slate-400">Outbox — reliable retries for downstream calls</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-2xl font-bold tracking-tight text-slate-900">{inFlight.length}</p>
            <p className="text-xs text-slate-500">in flight / retrying</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p
              className={
                "text-2xl font-bold tracking-tight " +
                (failed.length ? "text-red-600" : "text-slate-900")
              }
            >
              {failed.length}
            </p>
            <p className="text-xs text-slate-500">gave up</p>
          </div>
        </div>
        {(inFlight.length > 0 || failed.length > 0) && (
          <ul className="mt-4 space-y-2">
            {[...failed, ...inFlight].slice(0, 5).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2">
                  <Badge tone={o.status === "failed" ? "danger" : "warn"}>{o.kind}</Badge>
                  <span className="text-slate-400">attempt {o.attempts}/{o.maxAttempts}</span>
                </span>
                {o.lastError && (
                  <span className="max-w-[10rem] truncate text-slate-400" title={o.lastError}>
                    {o.lastError}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
