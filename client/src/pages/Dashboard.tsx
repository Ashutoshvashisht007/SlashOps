import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  api,
  type ActionRow,
  type GuildRow,
  type InteractionRow,
  type OutboxRow,
  type Stats,
} from "../lib/api";
import { Button, cx } from "../components/ui";
import { StatCards } from "../components/StatCards";
import { CommandLog } from "../components/CommandLog";
import { ActionsFeed } from "../components/ActionsFeed";
import { ServersPanel } from "../components/ServersPanel";
import { ConfigPanel } from "../components/ConfigPanel";

type Tab = "live" | "commands" | "servers";
const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "commands", label: "Commands" },
  { id: "servers", label: "Servers" },
];

export function Dashboard({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("live");
  const [scope, setScope] = useState<string | null>(null);
  const [configScope, setConfigScope] = useState<string | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<InteractionRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [guilds, setGuilds] = useState<GuildRow[]>([]);

  const loadGuilds = useCallback(() => {
    api.guilds().then(setGuilds).catch(() => {});
  }, []);

  const refresh = useCallback(() => {
    Promise.allSettled([
      api.stats().then(setStats),
      api.interactions(scope).then(setRows),
      api.actions().then(setActions),
      api.outbox().then(setOutbox),
    ]);
  }, [scope]);

  useEffect(loadGuilds, [loadGuilds]);

  // Live polling — cheap 4s heartbeat keeps the log feeling real-time.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-6 sm:px-8">
      {/* Top bar */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-700 text-lg font-black text-white shadow-[0_8px_24px_-8px_rgba(109,40,217,0.7)]">
            /
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none tracking-tight text-slate-900">SlashOps</h1>
            <p className="text-xs text-slate-400">Command center</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">{email}</span>
          <Button variant="ghost" onClick={onLogout}>
            Sign out
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="mt-8 flex gap-1 rounded-2xl border border-slate-100 bg-white/70 p-1 shadow-[var(--shadow-float)] backdrop-blur-sm sm:w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "rounded-xl px-5 py-2 text-sm font-semibold transition-all duration-200",
              tab === t.id
                ? "bg-violet-700 text-white shadow-[0_6px_18px_-8px_rgba(109,40,217,0.7)]"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="mt-6">
        {tab === "live" && (
          <div className="space-y-6">
            <StatCards stats={stats} />

            {guilds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Server
                </span>
                <ScopePill active={scope === null} onClick={() => setScope(null)}>
                  All
                </ScopePill>
                {guilds.map((g) => (
                  <ScopePill key={g.id} active={scope === g.id} onClick={() => setScope(g.id)}>
                    {g.name}
                  </ScopePill>
                ))}
              </div>
            )}

            {/* Asymmetric grid — wide log, narrower activity rail */}
            <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
              <CommandLog rows={rows} />
              <ActionsFeed actions={actions} outbox={outbox} />
            </div>
          </div>
        )}

        {tab === "commands" && (
          <ConfigPanel guildId={configScope} guilds={guilds} onScopeChange={setConfigScope} />
        )}

        {tab === "servers" && <ServersPanel guilds={guilds} onChanged={loadGuilds} />}
      </main>
    </div>
  );
}

function ScopePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200",
        active
          ? "bg-slate-900 text-white shadow-sm"
          : "bg-white text-slate-500 border border-slate-100 hover:border-slate-200 hover:text-slate-800",
      )}
    >
      {children}
    </button>
  );
}
