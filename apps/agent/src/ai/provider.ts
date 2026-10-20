import type { z } from "zod";
import { AppError } from "../api/errors";

export interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  system: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface TokenUsage {
  reported: number;
  estimated: number;
}

/** Additive usage for one model step, never a cumulative turn total. */
export interface Usage {
  model: string;
  billable: boolean;
  inputTokens: TokenUsage;
  outputTokens: TokenUsage;
  /** Cache reads are a subset of reported input tokens, not additional tokens. */
  cachedInputTokens: number;
}

/** A tool as seen by a provider. Execution limits are enforced by the caller-supplied `execute`. */
export interface ProviderTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute: (input: unknown, callId: string) => Promise<unknown>;
}

export interface ToolRequest extends GenerateRequest {
  tools: ProviderTool[];
  /** Maximum model round-trips (each may contain several tool calls). */
  maxIterations: number;
  /** Returns true when no further tool calls are allowed; the model must then answer in text. */
  toolBudgetExhausted: () => boolean;
  /**
   * Called before every model call after the first; it records the call against the
   * daily budget and returns false when the budget is spent, which ends the turn.
   */
  reserveNextStep?: () => boolean;
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool-start"; id: string; name: string; input: unknown }
  | { type: "tool-end"; id: string; name: string; output: unknown; error?: string }
  | { type: "usage"; usage: Usage };

/**
 * Provider abstraction. Workers AI is the only production provider in the MVP;
 * others (OpenRouter, Gemini, ...) can implement this interface later.
 */
export interface AIProvider {
  readonly id: string;
  readonly model: string;
  readonly billable: boolean;
  generate(req: GenerateRequest): Promise<{ text: string; usage: Usage }>;
  stream(req: GenerateRequest): AsyncIterable<AgentEvent>;
  generateWithTools(req: ToolRequest): AsyncIterable<AgentEvent>;
}

/** Rough token estimate (≈4 chars/token) from text or an accumulated character count. */
export function estimateTokens(text: string | number): number {
  return Math.ceil((typeof text === "number" ? text : text.length) / 4);
}

/** A provider-reported token count, or undefined unless it is a non-negative safe integer. */
export function tokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function tokens(reported: number | undefined, estimate: number): TokenUsage {
  return reported === undefined ? { reported: 0, estimated: estimate } : { reported, estimated: 0 };
}

const failedCallUsage = new WeakMap<object, Usage>();

/** Attaches what a failed `generate()` call consumed, so its caller can record it. */
export function withUsage<E extends Error>(error: E, usage: Usage | undefined): E {
  if (usage) failedCallUsage.set(error, usage);
  return error;
}

/** Usage attached to a failed call by `withUsage`, if any. */
export function usageOfFailure(error: unknown): Usage | undefined {
  return typeof error === "object" && error !== null ? failedCallUsage.get(error) : undefined;
}

export function modelUsage(model: string, billable: boolean, inputTokens: TokenUsage, outputTokens = tokens(0, 0), cachedInputTokens = 0): Usage {
  return { model, billable, inputTokens, outputTokens, cachedInputTokens: Math.min(cachedInputTokens, inputTokens.reported) };
}

export function estimatedUsage(provider: Pick<AIProvider, "model" | "billable">, input: string | number, output: string | number): Usage {
  return modelUsage(provider.model, provider.billable, tokens(undefined, estimateTokens(input)), tokens(undefined, estimateTokens(output)));
}

/**
 * Maps provider failures onto stable application errors. Workers AI codes are kept
 * (4006: daily free allocation exhausted, 3040/429: capacity or rate limits), and the
 * same messages cover OpenAI-compatible providers such as OpenRouter, Groq and NVIDIA.
 */
export function classifyAiError(error: unknown, providerLabel = "Workers AI"): AppError {
  if (error instanceof AppError) return error;
  const message = errorMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes("4006") || lower.includes("free allocation") || lower.includes("neurons")) {
    return new AppError(
      "AI_QUOTA_EXHAUSTED",
      "Your Cloudflare account has used its Workers AI allocation for today. Tasks, notes, memories and reminders keep working; chat will resume when the quota resets.",
    );
  }
  if (lower.includes("email_verification") || lower.includes("verify your email") || lower.includes("confirmation link")) {
    return new AppError(
      "AI_UNAVAILABLE",
      `${providerLabel} requires you to verify your email before it will answer. Confirm your email with the provider, then retry.`,
    );
  }
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("invalid api key") ||
    lower.includes("incorrect api key")
  ) {
    return new AppError(
      "AI_UNAVAILABLE",
      `${providerLabel} rejected the API key. Check the key and provider in Settings → AI.`,
    );
  }
  if (lower.includes("3040") || lower.includes("capacity") || lower.includes("429") || lower.includes("rate limit") || lower.includes("too many")) {
    return new AppError("AI_UNAVAILABLE", `${providerLabel} is rate-limiting requests. Please try again in a moment.`);
  }
  if (lower.includes("5007") || lower.includes("no such model") || lower.includes("model not found") || lower.includes("404")) {
    return new AppError("AI_UNAVAILABLE", "The configured AI model is not available. Choose another model in Settings.");
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("enotfound") ||
    lower.includes("econnrefused") ||
    lower.includes("failed to fetch")
  ) {
    return new AppError("AI_UNAVAILABLE", `Could not reach ${providerLabel}. Check the base URL and your connection.`);
  }
  if (lower.includes("abort")) {
    return new AppError("AI_UNAVAILABLE", "The response was cancelled.");
  }
  console.error(`${providerLabel} error`, message);
  return new AppError("AI_UNAVAILABLE", "The AI model could not respond. Please try again.");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    return `${error.name}: ${error.message}${cause ? ` (${errorMessage(cause)})` : ""}`;
  }
  return String(error);
}
