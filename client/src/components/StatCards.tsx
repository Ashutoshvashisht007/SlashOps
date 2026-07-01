import type { Stats } from "../lib/api";
import { Card } from "./ui";

const CARDS: { key: keyof Stats; label: string; hint: string }[] = [
  { key: "interactions", label: "Interactions", hint: "commands received" },
  { key: "processed", label: "Processed", hint: "replied end-to-end" },
  { key: "mirrors", label: "Mirrored", hint: "sent to 2nd channel" },
  { key: "servers", label: "Servers", hint: "connected" },
  { key: "failures", label: "Failures", hint: "exhausted retries" },
];

export function StatCards({ stats }: { stats: Stats | null }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {CARDS.map((c, i) => {
        const value = stats ? stats[c.key] : 0;
        const isFailure = c.key === "failures";
        return (
          <Card
            key={c.key}
            interactive
            className="animate-rise p-5"
          >
            <div style={{ animationDelay: `${i * 40}ms` }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {c.label}
              </p>
              <p
                className={
                  "mt-2 text-3xl font-bold tracking-tight " +
                  (isFailure && value > 0 ? "text-red-600" : "text-slate-900")
                }
              >
                {stats ? value : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-400">{c.hint}</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
