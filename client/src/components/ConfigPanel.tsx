import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type CommandRule,
  type ConfigRow,
  type GuildRow,
} from "../lib/api";
import { Badge, Button, Card, Input, Toggle } from "./ui";

interface CommandMeta {
  name: string;
  description: string;
}

function CommandConfigCard({
  meta,
  row,
  defaultRule,
  guildId,
  onSaved,
}: {
  meta: CommandMeta;
  row: ConfigRow | undefined;
  defaultRule: Required<CommandRule>;
  guildId: string | null;
  onSaved: () => void;
}) {
  const effective = useMemo<Required<CommandRule>>(
    () => ({ ...defaultRule, ...(row?.rule ?? {}) }),
    [defaultRule, row],
  );

  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [rule, setRule] = useState<Required<CommandRule>>(effective);
  const [keywords, setKeywords] = useState((effective.flagKeywords ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Guard against a background refetch clobbering in-progress edits: once the
  // user touches the form, server → state syncs are suspended until save.
  const dirty = useRef(false);

  useEffect(() => {
    if (dirty.current) return;
    setEnabled(row?.enabled ?? true);
    setRule(effective);
    setKeywords((effective.flagKeywords ?? []).join(", "));
  }, [effective, row]);

  function set<K extends keyof CommandRule>(key: K, value: Required<CommandRule>[K]) {
    dirty.current = true;
    setRule((r) => ({ ...r, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await api.saveConfig({
        guildId,
        commandName: meta.name,
        enabled,
        rule: {
          ...rule,
          flagKeywords: keywords
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      dirty.current = false; // saved — future server syncs are welcome again
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card interactive className="animate-rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-ink">/{meta.name}</h3>
            <Badge tone={row ? "accent" : "neutral"}>{row ? "configured" : "inherits default"}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">{meta.description}</p>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => {
            dirty.current = true;
            setEnabled(v);
          }}
          label={enabled ? "Enabled" : "Disabled"}
        />
      </div>

      <div className="mt-5 grid gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Reply template
          </label>
          <Input
            value={rule.replyTemplate}
            onChange={(e) => set("replyTemplate", e.target.value)}
            placeholder={defaultRule.replyTemplate}
          />
          <p className="text-xs text-slate-400">
            Placeholders: <code>{"{command}"}</code> <code>{"{user}"}</code>{" "}
            <code>{"{input}"}</code> <code>{"{labelNote}"}</code>
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Flag keywords (comma-separated)
            </label>
            <Input
              value={keywords}
              onChange={(e) => {
                dirty.current = true;
                setKeywords(e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Flag label
            </label>
            <Input value={rule.flagLabel} onChange={(e) => set("flagLabel", e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-xl bg-slate-50 px-4 py-3">
          <Toggle checked={rule.mirrorEnabled} onChange={(v) => set("mirrorEnabled", v)} label="Mirror" />
          <Toggle checked={rule.aiEnabled} onChange={(v) => set("aiEnabled", v)} label="AI triage" />
          <Toggle checked={rule.ephemeral} onChange={(v) => set("ephemeral", v)} label="Ephemeral reply" />
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save rule"}
          </Button>
          {saved && <span className="text-xs font-medium text-emerald-700">Saved ✓</span>}
        </div>
      </div>
    </Card>
  );
}

export function ConfigPanel({
  guildId,
  guilds,
  onScopeChange,
}: {
  guildId: string | null;
  guilds: GuildRow[];
  onScopeChange: (id: string | null) => void;
}) {
  const [commands, setCommands] = useState<CommandMeta[]>([]);
  const [defaultRule, setDefaultRule] = useState<Required<CommandRule> | null>(null);
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [configsLoaded, setConfigsLoaded] = useState(false);

  const load = () => {
    api
      .configs(guildId)
      .then(setConfigs)
      .catch(() => setConfigs([]))
      .finally(() => setConfigsLoaded(true));
  };

  useEffect(() => {
    api.commands().then((r) => {
      setCommands(r.commands);
      setDefaultRule(r.defaultRule);
    });
  }, []);
  useEffect(() => {
    setConfigsLoaded(false); // scope switch → hold cards until fresh rows land
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-ink">Command rules</h2>
          <p className="text-sm text-slate-500">
            Edit behavior globally, or override it per server. Changes apply instantly.
          </p>
        </div>
        <select
          value={guildId ?? ""}
          onChange={(e) => onScopeChange(e.target.value || null)}
          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
        >
          <option value="">🌐 Global defaults</option>
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Card>

      {defaultRule && configsLoaded && (
        <div className="grid gap-4 lg:grid-cols-2">
          {commands.map((meta) => (
            <CommandConfigCard
              key={`${guildId ?? "global"}:${meta.name}`}
              meta={meta}
              row={configs.find((c) => c.commandName === meta.name)}
              defaultRule={defaultRule}
              guildId={guildId}
              onSaved={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
