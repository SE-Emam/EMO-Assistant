import { DEFAULT_LIMITS, DEFAULT_MEMORY_HISTORY, DEFAULT_MODEL, type Settings } from "@emo/shared";
import { describe, expect, it } from "vitest";
import { createConfiguredProvider } from "../src/ai/configured";
import type { Env } from "../src/env";
import { inAgent } from "./helpers";

const settings = (patch: Partial<Settings> = {}): Settings => ({
  agentName: "EMO",
  timezone: "UTC",
  theme: "system",
  model: DEFAULT_MODEL,
  aiProvider: "workers-ai",
  aiBaseUrl: "",
  temperature: 0.4,
  limits: { ...DEFAULT_LIMITS },
  autoMemory: true,
  demoMode: false,
  memoryHistory: { ...DEFAULT_MEMORY_HISTORY },
  updateCheck: true,
  ...patch,
});

const env = {} as Env;

describe("configured chat provider", () => {
  it("needs the Workers AI binding for workers-ai", () => {
    expect(createConfiguredProvider(settings(), null, env)).toBeNull();
  });

  it("requires an API key for hosted providers but not for local Ollama", () => {
    expect(createConfiguredProvider(settings({ aiProvider: "openrouter", model: "openai/gpt-4.1-mini" }), null, env)).toBeNull();
    const openrouter = createConfiguredProvider(settings({ aiProvider: "openrouter", model: "openai/gpt-4.1-mini" }), "sk-test", env);
    expect(openrouter?.id).toBe("openrouter");
    expect(openrouter?.model).toBe("openai/gpt-4.1-mini");
    expect(createConfiguredProvider(settings({ aiProvider: "ollama", model: "llama3.1" }), null, env)?.id).toBe("ollama");
    expect(createConfiguredProvider(settings({ aiProvider: "opencode-zen", model: "deepseek-v4.1-flash-free" }), "zen-key", env)?.id).toBe("opencode-zen");
  });

  it("uses a custom base URL when supplied", () => {
    const custom = createConfiguredProvider(
      settings({ aiProvider: "custom", model: "my-model", aiBaseUrl: "https://example.com/v1" }),
      "key",
      env,
    );
    expect(custom?.id).toBe("custom");
    expect(createConfiguredProvider(settings({ aiProvider: "custom", model: "my-model" }), "key", env)).toBeNull();
  });
});

describe("provider API key storage", () => {
  it("round-trips a key and keeps only ciphertext in SQLite", async () => {
    await inAgent(async (agent) => {
      const { aiKeys, db } = agent.services;
      await aiKeys.set("sk-secret-value-1234567890");
      expect(await aiKeys.get()).toBe("sk-secret-value-1234567890");
      expect(aiKeys.configured()).toBe(true);
      const row = db.one<{ value: string }>(`SELECT value FROM tal_settings WHERE key = 'ai.providerKey'`);
      expect(row?.value ?? "").not.toContain("sk-secret-value-1234567890");
      await aiKeys.set(null);
      expect(await aiKeys.get()).toBeNull();
      expect(aiKeys.configured()).toBe(false);
    });
  });
});
