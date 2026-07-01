import type { InteractionRow } from "../lib/api";
import { timeAgo, commandGlyph } from "../lib/format";
import { Badge, Card } from "./ui";

function statusTone(status: string): "success" | "warn" | "neutral" {
  if (status === "processed") return "success";
  if (status === "failed") return "warn";
  return "neutral";
}

export function CommandLog({ rows }: { rows: InteractionRow[] }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900">Command log</h2>
          <p className="text-xs text-slate-400">Live feed of every interaction</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          live
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-slate-400">
          No interactions yet. Run <code className="rounded bg-slate-100 px-1.5 py-0.5">/echo</code> or{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">/report</code> in Discord.
        </div>
      ) : (
        <ul className="divide-y divide-slate-50">
          {rows.map((r) => (
            <li
              key={r.id}
              className="group flex gap-4 px-6 py-4 transition-colors duration-200 hover:bg-slate-50/70"
            >
              <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 font-bold text-violet-700 transition-transform duration-200 group-hover:scale-110">
                {commandGlyph(r.commandName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold tracking-tight text-slate-900">
                    {r.commandName ?? "interaction"}
                  </span>
                  <span className="text-xs text-slate-400">· {r.userName ?? "unknown"}</span>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  {r.ruleResult?.flagged && <Badge tone="warn">⚠ {r.ruleResult.label}</Badge>}
                </div>
                {r.inputText && (
                  <p className="mt-1 truncate text-sm text-slate-500">{r.inputText}</p>
                )}
                {r.aiSummary && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span className="font-medium text-violet-600">🧠 {r.aiSummary}</span>
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
