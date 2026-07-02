import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  api,
  type ActionRow,
  type GuildRow,
  type InteractionRow,
  type OutboxRow,
  type Stats,
} from "../lib/api";
import { cx } from "../components/ui";
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
    <div className="flex min-h-screen flex-col">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="bg-brand text-white">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="relative text-3xl font-black leading-none" aria-hidden>
              /
              <svg
                viewBox="0 0 24 24"
                className="absolute -bottom-0.5 -right-3 h-3.5 w-3.5 fill-white/90"
              >
                <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9.4 4 1.9-1.5-2-3.4-2.3.8a8 8 0 0 0-1.7-1L17 4.5h-4l-.3 2.4a8 8 0 0 0-1.7 1l-2.3-.8-2 3.4L8.6 12l-1.9 1.5 2 3.4 2.3-.8a8 8 0 0 0 1.7 1l.3 2.4h4l.3-2.4a8 8 0 0 0 1.7-1l2.3.8 2-3.4L21.4 12Z" />
              </svg>
            </span>
            <h1 className="ml-2 text-xl leading-none tracking-tight">
              <span className="font-bold">SlashOps</span>{" "}
              <span className="font-light text-white/85">Command Center</span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-white/85 sm:inline">{email}</span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-sm font-bold uppercase">
              {email.slice(0, 1)}
            </span>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              Log Out
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
                <path d="M15 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Tab strip ────────────────────────────────────────────────────── */}
      <nav className="border-b border-slate-300 bg-chrome">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-8 px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "-mb-px border-b-4 py-3.5 text-base font-semibold transition-colors duration-150",
                tab === t.id
                  ? "border-ink text-ink"
                  : "border-transparent text-slate-600 hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {tab === "live" && (
          <div className="space-y-6">
            <StatCards stats={stats} />

            {guilds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
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

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="py-5 text-center text-sm text-slate-500">
        Copyright © <span className="font-semibold text-slate-600">slashops</span> · All rights
        reserved.
      </footer>
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
        "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-150",
        active
          ? "bg-brand text-white"
          : "border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
