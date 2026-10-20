# AI providers

EMO ships with Cloudflare Workers AI as the default chat provider and can use any
OpenAI-compatible endpoint instead. Everything else in EMO (tasks, notes, memories,
reminders) works without a provider.

## Choosing a provider

Open **Settings → AI**:

1. Pick a **Provider**. The model field moves to that provider's default model,
   but you can type any model id it serves.
2. Optionally set a **Base URL override** (required for the custom provider).
3. Paste the **API key** and press **Save model**. The key is written once and
   never returned by the API again; the status row shows whether it is set.
4. **Clear key** removes it. Changing provider does not carry a key across
   providers, so set the key for the provider you selected.

Keys are encrypted with AES-GCM before being written to the Durable Object's
SQLite storage. The encryption key is derived from `SESSION_SECRET` with
HKDF-SHA256, so a copy of the database alone is not enough to recover a key.
If `SESSION_SECRET` is rotated, stored keys become unreadable and must be entered
again. Keys are never included in backups.

## Supported presets

| Provider | Base URL | Notes |
| --- | --- | --- |
| Cloudflare Workers AI | native binding | Default; no key |
| OpenAI | `https://api.openai.com/v1` | |
| OpenRouter | `https://openrouter.ai/api/v1` | |
| Groq | `https://api.groq.com/openai/v1` | |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | Includes NVIDIA's free trial endpoints |
| OpenCode Zen | `https://opencode.ai/inference/openai/v1` | Adds the OpenCode client headers (below) |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | Google's OpenAI-compatible endpoint |
| Ollama | `http://localhost:11434/v1` | No key; the Worker must be able to reach the host |
| Custom | your URL | Any OpenAI-compatible Chat Completions endpoint |

A model must support streaming and tool calling, because the assistant uses tools
for tasks, notes, memories and automations.

## OpenCode Zen headers

OpenCode's gateway expects requests to look like they come from its own client.
The preset sends:

```
User-Agent: opencode/latest/2.0.22/cli
x-opencode-client: cli
x-opencode-project: global
x-opencode-session: ses_<12 hex><14 base62>
```

The session id is generated per request. Upstream may still restrict free-tier
models to the genuine OpenCode client (including extra body requirements), so a
rejected free model is expected behaviour rather than a bug in EMO. Paid Console
models with your own API key are the supported path. The headers are also visible
in `AI_PROVIDERS` in `packages/shared/src/constants.ts` if you need to update the
client version.

## Semantic recall

Semantic recall and memory embeddings always use Workers AI (`@cf/baai/bge-*`),
independently of the chat provider. If the Worker has no Workers AI binding,
semantic recall stays unavailable; chat on another provider is unaffected.

## Usage accounting

Every provider call is recorded with provider-reported tokens when available and
a ~4-characters-per-token estimate otherwise. Neuron and USD estimates are only
produced for models in the Workers AI price table (`ai/pricing.ts`). Other
providers show as unpriced; check their dashboards for billing.

## Without a provider

If the selected provider has no key, no base URL, or no Workers AI binding,
`aiProvider()` returns null. Chat replies with a clear configuration message and
the rest of the app keeps working. Demo mode still uses the deterministic local
responder.
