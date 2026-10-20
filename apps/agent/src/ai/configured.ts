import { aiProviderPreset, type Settings } from "@emo/shared";
import type { Env } from "../env";
import { OpenAICompatibleProvider } from "./openai-compatible";
import type { AIProvider } from "./provider";
import { CloudflareWorkersAIProvider } from "./workers-ai";

/** Base URL for a settings record: the owner's override wins, otherwise the preset's. */
export function providerBaseUrl(settings: Settings): string | null {
  if (settings.aiBaseUrl) return settings.aiBaseUrl;
  return aiProviderPreset(settings.aiProvider).baseUrl;
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A structurally valid OpenCode session id (`ses_` + 12 hex + 14 base62). */
function openCodeSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(13));
  let hex = "";
  for (let i = 0; i < 6; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  let tail = "";
  for (let i = 6; i < 13; i++) tail += BASE62[bytes[i]! % BASE62.length];
  return `ses_${hex}${tail}`;
}

/**
 * Builds the chat provider from settings. Returns null when the owner has not finished
 * configuring it (Workers AI binding missing, or a provider that still needs a key),
 * so the rest of EMO keeps working without AI.
 */
export function createConfiguredProvider(settings: Settings, apiKey: string | null, env: Env): AIProvider | null {
  if (settings.aiProvider === "workers-ai") {
    return env.AI ? new CloudflareWorkersAIProvider(env.AI, settings.model) : null;
  }
  const preset = aiProviderPreset(settings.aiProvider);
  const baseURL = providerBaseUrl(settings);
  if (!baseURL) return null;
  if (!preset.keyless && !apiKey) return null;
  const headers =
    preset.id === "opencode-zen"
      ? { ...preset.headers, "x-opencode-session": openCodeSessionId() }
      : preset.headers;
  return new OpenAICompatibleProvider(
    {
      id: preset.id,
      label: preset.label,
      baseURL,
      apiKey: apiKey ?? undefined,
      ...(headers ? { headers } : {}),
      billable: preset.id !== "ollama",
    },
    settings.model,
  );
}
