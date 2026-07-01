/** Thin fetch wrapper. Cookies (the session) ride along automatically. */
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Stats {
  interactions: number;
  processed: number;
  failures: number;
  mirrors: number;
  servers: number;
}

export interface InteractionRow {
  id: string;
  type: number;
  guildId: string | null;
  channelId: string | null;
  userName: string | null;
  commandName: string | null;
  inputText: string | null;
  ruleResult: { flagged?: boolean; label?: string | null } | null;
  aiSummary: string | null;
  aiTags: string[] | null;
  status: string;
  responseText: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface ActionRow {
  id: number;
  guildId: string | null;
  interactionId: string | null;
  kind: string;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: string;
}

export interface OutboxRow {
  id: number;
  kind: string;
  interactionId: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
}

export interface GuildRow {
  id: string;
  name: string;
  iconUrl: string | null;
  postChannelId: string | null;
  mirrorConfigured: boolean;
  createdAt: string;
}

export interface CommandRule {
  enabled?: boolean;
  replyTemplate?: string;
  ephemeral?: boolean;
  mirrorEnabled?: boolean;
  aiEnabled?: boolean;
  flagKeywords?: string[];
  flagLabel?: string;
}

export interface ConfigRow {
  id: number;
  guildId: string | null;
  commandName: string;
  enabled: boolean;
  rule: CommandRule;
  updatedAt: string;
}

export const api = {
  me: () => req<{ email: string }>("/api/auth/me"),
  login: (email: string, password: string) =>
    req<{ ok: true; email: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => req<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  stats: () => req<Stats>("/api/stats"),
  interactions: (guildId?: string | null) =>
    req<InteractionRow[]>(`/api/interactions${guildId ? `?guildId=${guildId}` : ""}`),
  actions: () => req<ActionRow[]>("/api/actions"),
  outbox: () => req<OutboxRow[]>("/api/outbox"),
  guilds: () => req<GuildRow[]>("/api/guilds"),
  updateGuild: (id: string, body: { postChannelId?: string | null; mirrorWebhookUrl?: string | null }) =>
    req<{ ok: true }>(`/api/guilds/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  disconnectGuild: (id: string) =>
    req<{ ok: true }>(`/api/connect/${id}`, { method: "DELETE" }),

  commands: () =>
    req<{ commands: { name: string; description: string }[]; defaultRule: Required<CommandRule> }>(
      "/api/commands",
    ),
  configs: (guildId?: string | null) =>
    req<ConfigRow[]>(`/api/configs${guildId ? `?guildId=${guildId}` : ""}`),
  saveConfig: (body: {
    guildId: string | null;
    commandName: string;
    enabled?: boolean;
    rule?: CommandRule;
  }) => req<{ ok: true }>("/api/configs", { method: "PUT", body: JSON.stringify(body) }),
};
