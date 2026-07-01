import { useState } from "react";
import { api, type GuildRow } from "../lib/api";
import { Badge, Button, Card, Input } from "./ui";

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
            <img src={guild.iconUrl} alt="" className="h-11 w-11 rounded-xl object-cover" />
          ) : (
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 font-bold text-slate-500">
              {guild.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold tracking-tight text-slate-900">{guild.name}</p>
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
          <p className="text-xs text-slate-400">Stored encrypted-at-rest; never shown back.</p>
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
          <Button variant="subtle" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          {saved && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
          <button
            onClick={async () => {
              if (confirm(`Disconnect ${guild.name}?`)) {
                await api.disconnectGuild(guild.id);
                onChanged();
              }
            }}
            className="ml-auto text-xs font-medium text-slate-400 transition-colors hover:text-red-500"
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
      <Card className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900">Connected servers</h2>
          <p className="text-sm text-slate-500">
            Add SlashOps to a Discord server, then set that server's mirror channel.
          </p>
        </div>
        <a href="/api/connect/start">
          <Button>+ Connect a server</Button>
        </a>
      </Card>

      {guilds.length === 0 ? (
        <Card className="py-12 text-center text-sm text-slate-400">
          No servers connected yet. Click <b>Connect a server</b> to add the bot.
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
