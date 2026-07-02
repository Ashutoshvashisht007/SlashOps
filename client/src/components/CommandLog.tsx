import type { InteractionRow } from "../lib/api";
import { timeAgo, commandGlyph } from "../lib/format";
import { Badge, Card, EmptyState, SkeletonTile } from "./ui";

function statusTone(status: string): "success" | "warn" | "neutral" {
  if (status === "processed") return "success";
  if (status === "failed") return "warn";
  return "neutral";
}

export function CommandLog({ rows }: { rows: InteractionRow[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-base font-bold text-ink">Command log</h2>
          <p className="text-xs text-slate-500">Live feed of every interaction</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          live
        </span>
      </div>

      {rows.length === 0 ? (
        <>
          <EmptyState icon={<span aria-hidden>⌨️</span>} title="No commands recorded yet">
            Run <code className="rounded bg-slate-200/70 px-1.5 py-0.5">/echo</code> or{" "}
            <code className="rounded bg-slate-200/70 px-1.5 py-0.5">/report</code> in a connected
            Discord server and it will appear here in real time.
          </EmptyState>
          <div className="grid gap-3 px-8 pb-8 sm:grid-cols-2">
            <SkeletonTile label="/report — sample entry" />
            <SkeletonTile label="/echo — sample entry" />
          </div>
        </>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li
              key={r.id}
              className="group flex gap-4 px-6 py-4 transition-colors duration-150 hover:bg-slate-50"
            >
              <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft font-bold text-accent">
                {commandGlyph(r.commandName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{r.commandName ?? "interaction"}</span>
                  <span className="text-xs text-slate-400">· {r.userName ?? "unknown"}</span>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  {r.ruleResult?.flagged && <Badge tone="warn">⚠ {r.ruleResult.label}</Badge>}
                </div>
                {r.inputText && (
                  <p className="mt-1 truncate text-sm text-slate-500">{r.inputText}</p>
                )}
                {r.aiSummary && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-medium text-accent">🧠 {r.aiSummary}</span>
                    {(r.aiTags ?? []).map((t) => (
                      <Badge key={t} tone="accent">
                        {t}
                      </Badge>
                    ))}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs text-slate-400">{timeAgo(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
