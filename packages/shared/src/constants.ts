export const EMO_VERSION = "0.1.7";

/** Stable identity of the single owner's agent inside the private DO namespace. */
export const AGENT_INSTANCE_NAME = "personal-agent";

/**
 * Default Workers AI model. Verified on developers.cloudflare.com/workers-ai/models:
 * Cloudflare-hosted, supports function calling and streaming, 131k context.
 */
export const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

export const BACKUP_FORMAT = "emo-backup";
export const BACKUP_VERSION = 1;

export const SESSION_COOKIE = "__Host-emo_session";
export const DEV_SESSION_COOKIE = "emo_session";

/** Header sent by the SPA on every API call. Simple-request CSRF can't set custom headers. */
export const CSRF_HEADER = "x-emo-request";

export const GITHUB_URL = "https://github.com/rociiu/talorys";

/** Chat providers EMO can use. `workers-ai` stays the default. */
export const AI_PROVIDER_IDS = [
  "workers-ai",
  "openai",
  "openrouter",
  "groq",
  "nvidia",
  "opencode-zen",
  "gemini",
  "ollama",
  "custom",
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export interface AiProviderPreset {
  id: AiProviderId;
  label: string;
  description: string;
  /** OpenAI-compatible base URL; null for the native Workers AI binding. */
  baseUrl: string | null;
  defaultModel: string;
  /** Whether requests work without an API key (local Ollama, Workers AI). */
  keyless: boolean;
  docsUrl?: string;
  /** Extra headers sent on every request, for providers with a client gate. */
  headers?: Record<string, string>;
}

/**
 * Presets for the OpenAI-compatible providers plus Workers AI. Every preset except
 * Workers AI speaks the OpenAI Chat Completions protocol, so one implementation serves them all.
 * Model ids are only placeholders: the owner can type any model the provider serves.
 */
export const AI_PROVIDERS: readonly AiProviderPreset[] = [
  {
    id: "workers-ai",
    label: "Cloudflare Workers AI",
    description: "Runs inside your own Cloudflare account. No API key needed.",
    baseUrl: null,
    defaultModel: DEFAULT_MODEL,
    keyless: true,
    docsUrl: "https://developers.cloudflare.com/workers-ai/models/",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT models through the official OpenAI API.",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    keyless: false,
    docsUrl: "https://platform.openai.com/docs/models",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "One key for models from many providers. Embedding models are available on some routes.",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
    keyless: false,
    docsUrl: "https://openrouter.ai/models",
  },
  {
    id: "groq",
    label: "Groq",
    description: "Very fast inference for open models.",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    keyless: false,
    docsUrl: "https://console.groq.com/docs/models",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM (free tier)",
    description: "NVIDIA's hosted NIM API, including a free trial tier.",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "meta/llama-3.3-70b-instruct",
    keyless: false,
    docsUrl: "https://build.nvidia.com/explore/discover",
  },
  {
    id: "opencode-zen",
    label: "OpenCode Zen",
    description: "OpenCode's model gateway. Requests carry the OpenCode client headers.",
    baseUrl: "https://opencode.ai/inference/openai/v1",
    defaultModel: "deepseek-v4.1-flash-free",
    keyless: false,
    docsUrl: "https://opencode.ai/docs/zen",
    headers: {
      "User-Agent": "opencode/latest/2.0.22/cli",
      "x-opencode-client": "cli",
      "x-opencode-project": "global",
    },
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Gemini through Google's OpenAI-compatible endpoint.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    keyless: false,
    docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    description: "Models running on your own machine. No API key needed.",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    keyless: true,
    docsUrl: "https://ollama.com/library",
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    description: "Any endpoint that speaks the OpenAI Chat Completions protocol.",
    baseUrl: null,
    defaultModel: "",
    keyless: false,
  },
] as const;

export function aiProviderPreset(id: AiProviderId): AiProviderPreset {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0]!;
}

export const DEFAULT_LIMITS = {
  maxOutputTokens: 1024,
  maxToolCalls: 6,
  maxAgentIterations: 4,
  maxContextTokens: 6000,
  maxScheduledAiRunsPerDay: 6,
  maxAiRequestsPerDay: 200,
} as const;

/** Memory history defaults: rule-based conflict detection on, AI conflict check off. */
export const DEFAULT_MEMORY_HISTORY = {
  conflictReview: true,
  aiConflictCheck: false,
} as const;

/** Hard ceilings the owner cannot exceed through settings. */
export const LIMIT_CEILINGS = {
  maxOutputTokens: 4096,
  maxToolCalls: 20,
  maxAgentIterations: 10,
  maxContextTokens: 32000,
  maxScheduledAiRunsPerDay: 48,
  maxAiRequestsPerDay: 2000,
} as const;
