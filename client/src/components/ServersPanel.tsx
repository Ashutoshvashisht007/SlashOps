import { useState } from "react";
import { api, type GuildRow } from "../lib/api";
import { Badge, Button, Card, EmptyState, Input, SkeletonTile } from "./ui";

function GuildCard({ guild, onChanged }: { guild: GuildRow; onChanged: () => void }) {
  const [webhook, setWebhook] = useState("");
  const [channel, setChannel] = useState(guild.postChannelId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await api.updateGuild(guild.id, {
        postChannelId: channel || null,
        ...(webhook ? { mirrorWebhookUrl: webhook } : {}),
      });
      setWebhook("");
      setSaved(true);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card interactive className="animate-rise">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {guild.iconUrl ? (
            <img src={guild.iconUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
          ) : (
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent-soft font-bold text-accent">
              {guild.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-ink">{guild.name}</p>
            <p className="font-mono text-xs text-slate-400">{guild.id}</p>
          </div>
        </div>
        <Badge tone={guild.mirrorConfigured ? "success" : "warn"}>
          {guild.mirrorConfigured ? "mirror set" : "no mirror"}
        </Badge>
      </div>

      <div className="mt-5 grid gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mirror webhook URL {guild.mirrorConfigured && "(replace)"}
          </label>
          <Input
            type="password"
            placeholder="https://discord.com/api/webhooks/…"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
          />
          <p className="text-xs text-slate-400">Stored server-side; never shown back.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Post channel ID (optional)
          </label>
          <Input
            placeholder="defaults to the invoking channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          {saved && <span className="text-xs font-medium text-emerald-700">Saved ✓</span>}
          <button
            onClick={async () => {
              if (confirm(`Disconnect ${guild.name}?`)) {
                await api.disconnectGuild(guild.id);
                onChanged();
              }
            }}
            className="ml-auto text-xs font-medium text-slate-400 transition-colors hover:text-red-600"
          >
            Disconnect
          </button>
        </div>
      </div>
    </Card>
  );
}

export function ServersPanel({ guilds, onChanged }: { guilds: GuildRow[]; onChanged: () => void }) {
  return (
    <div className="space-y-5">
      {/* Section header — emphasized card, like the reference design */}
      <Card emphasis className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-ink">Connected Servers</h2>
          <p className="mt-1 text-sm text-slate-500">
            Authorize and configure SlashOps integration with individual Discord servers.
          </p>
        </div>
        <a href="/api/connect/start" className="shrink-0">
          <Button variant="outline">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Connect a server
          </Button>
        </a>
      </Card>

      {guilds.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon={<span aria-hidden>🔌</span>} title="No servers connected">
            Add the bot to a server to start mirroring channels and applying AI triage rules.
            No data to display yet.
          </EmptyState>
          <div className="grid gap-3 px-8 pb-8 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonTile label="Sample Server Alpha" />
            <SkeletonTile label="Server Beta" />
            <SkeletonTile label="Server Gamma" />
            <SkeletonTile label="Sample Server" />
            <SkeletonTile label="Server Delta" />
            <SkeletonTile label="Server Epsilon" />
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {guilds.map((g) => (
            <GuildCard key={g.id} guild={g} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}
