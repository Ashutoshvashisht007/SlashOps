/**
 * The configurable rule engine. An admin edits a command's `rule` JSON in the
 * dashboard; this pure function turns that config + the user's input into a
 * decision. Kept side-effect free so it's trivial to reason about and test.
 */
export interface CommandRule {
  enabled?: boolean;
  replyTemplate?: string; // {input}, {user}, {label} placeholders
  ephemeral?: boolean;
  mirrorEnabled?: boolean;
  aiEnabled?: boolean;
  flagKeywords?: string[];
  flagLabel?: string;
  /**
   * Gate: if set, only members holding this Discord role id may run the command.
   * Empty string / unset = open to everyone. Copy the id from Discord via
   * Developer Mode → right-click role → Copy Role ID.
   */
  requiredRoleId?: string;
}

export const DEFAULT_RULE: Required<Omit<CommandRule, "replyTemplate">> & {
  replyTemplate: string;
} = {
  enabled: true,
  replyTemplate: "✅ Recorded your {command}. {labelNote}",
  ephemeral: false,
  mirrorEnabled: true,
  aiEnabled: true,
  flagKeywords: ["urgent", "outage", "down", "security", "breach", "hack", "critical"],
  flagLabel: "priority",
  requiredRoleId: "",
};

export interface RuleResult {
  flagged: boolean;
  label: string | null;
  reason: string | null;
}

export function evaluateRule(rule: CommandRule, input: string): RuleResult {
  const keywords = rule.flagKeywords ?? DEFAULT_RULE.flagKeywords;
  const label = rule.flagLabel ?? DEFAULT_RULE.flagLabel;
  const haystack = input.toLowerCase();
  const hit = keywords.find((k) => k && haystack.includes(k.toLowerCase()));
  if (hit) {
    return { flagged: true, label, reason: `matched keyword "${hit}"` };
  }
  return { flagged: false, label: null, reason: null };
}

/** Merge a stored (possibly partial) rule over the defaults. */
export function withDefaults(rule: CommandRule | null | undefined): Required<CommandRule> {
  return {
    enabled: rule?.enabled ?? DEFAULT_RULE.enabled,
    replyTemplate: rule?.replyTemplate ?? DEFAULT_RULE.replyTemplate,
    ephemeral: rule?.ephemeral ?? DEFAULT_RULE.ephemeral,
    mirrorEnabled: rule?.mirrorEnabled ?? DEFAULT_RULE.mirrorEnabled,
    aiEnabled: rule?.aiEnabled ?? DEFAULT_RULE.aiEnabled,
    flagKeywords: rule?.flagKeywords ?? DEFAULT_RULE.flagKeywords,
    flagLabel: rule?.flagLabel ?? DEFAULT_RULE.flagLabel,
    requiredRoleId: rule?.requiredRoleId ?? DEFAULT_RULE.requiredRoleId,
  };
}

export function renderTemplate(
  template: string,
  vars: { command: string; user: string; input: string; label: string | null },
): string {
  const labelNote = vars.label ? `Flagged as **${vars.label}**.` : "No flags — looks routine.";
  return template
    .replaceAll("{command}", vars.command)
    .replaceAll("{user}", vars.user)
    .replaceAll("{input}", vars.input)
    .replaceAll("{label}", vars.label ?? "none")
    .replaceAll("{labelNote}", labelNote);
}
