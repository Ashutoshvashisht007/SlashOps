import { env } from "../env";

export interface TriageResult {
  summary: string;
  tags: string[];
  severity: "low" | "medium" | "high";
}

export const aiEnabled = Boolean(env.GEMINI_API_KEY);

const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/**
 * Summarise + tag + triage a command's text with Gemini. Returns strict-ish
 * JSON. Throws on any failure so the outbox worker retries with backoff rather
 * than silently dropping the AI step. The API key travels only in the header —
 * never logged.
 */
export async function triage(text: string): Promise<TriageResult> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

  const prompt = [
    "You are a triage assistant for an operations bot.",
    "Given a user's report/command text, respond ONLY with minified JSON of the form:",
    '{"summary": string (<=140 chars), "tags": string[] (1-4 short lowercase tags), "severity": "low"|"medium"|"high"}.',
    "No markdown, no code fences, JSON only.",
    "",
    `TEXT: ${text}`,
  ].join("\n");

  const res = await fetch(`${ENDPOINT(env.GEMINI_MODEL)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256,
        // 2.5-flash is a "thinking" model; disable it so the whole token
        // budget produces our answer (faster + cheaper for short triage).
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseTriage(raw);
}

function parseTriage(raw: string): TriageResult {
  // Gemini sometimes wraps JSON in ```json fences despite instructions.
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`AI returned non-JSON: ${raw.slice(0, 120)}`);
  const parsed = JSON.parse(match[0]) as Partial<TriageResult>;
  const severity =
    parsed.severity === "high" || parsed.severity === "medium" ? parsed.severity : "low";
  return {
    summary: (parsed.summary ?? "").toString().slice(0, 200) || "No summary.",
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 4) : [],
    severity,
  };
}
