import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, streamText, type LanguageModelUsage, type ToolSet } from "ai";
import {
  type AgentEvent,
  type AIProvider,
  classifyAiError,
  estimateTokens,
  type GenerateRequest,
  modelUsage,
  tokenCount,
  tokens,
  type ToolRequest,
  type Usage,
  withUsage,
} from "./provider";

export interface OpenAICompatibleConfig {
  id: string;
  /** Human-readable name used in error messages. */
  label: string;
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;
  /** False for local/free endpoints. */
  billable?: boolean;
}

/**
 * Any provider that speaks the OpenAI Chat Completions protocol: OpenAI, OpenRouter,
 * Groq, NVIDIA NIM, Gemini's compatibility endpoint, OpenCode Zen, Ollama and custom URLs.
 * Token counts come from the provider when it reports them and are estimated otherwise.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly billable: boolean;
  private readonly client: ReturnType<typeof createOpenAICompatible>;

  constructor(
    private readonly config: OpenAICompatibleConfig,
    readonly model: string,
  ) {
    this.id = config.id;
    this.billable = config.billable ?? true;
    this.client = createOpenAICompatible({
      name: config.id,
      baseURL: config.baseURL,
      // Some local servers reject an empty Authorization header, so send a harmless placeholder.
      apiKey: config.apiKey || "not-required",
      ...(config.headers ? { headers: config.headers } : {}),
      includeUsage: true,
    });
  }

  private createModel() {
    return this.client(this.model);
  }

  private usage(usage: LanguageModelUsage | undefined, inputEstimate: number, outputChars: number): Usage {
    return modelUsage(
      this.model,
      this.billable,
      tokens(tokenCount(usage?.inputTokens), inputEstimate),
      tokens(tokenCount(usage?.outputTokens), estimateTokens(outputChars)),
      tokenCount(usage?.inputTokenDetails?.cacheReadTokens) ?? 0,
    );
  }

  private inputEstimate(req: GenerateRequest): number {
    return estimateTokens(req.system) + req.messages.reduce((total, m) => total + estimateTokens(m.content), 0);
  }

  async generate(req: GenerateRequest) {
    const input = this.inputEstimate(req);
    try {
      const result = await generateText({
        model: this.createModel(),
        instructions: req.system,
        messages: req.messages,
        maxOutputTokens: req.maxOutputTokens,
        temperature: req.temperature,
        abortSignal: req.signal,
        // Retries would be model calls the daily budget cannot see; the UI offers Retry instead.
        maxRetries: 0,
      });
      return {
        text: result.text,
        usage: this.usage(result.usage, input, result.text.length + (result.reasoningText?.length ?? 0)),
      };
    } catch (error) {
      throw withUsage(
        classifyAiError(error, this.config.label),
        modelUsage(this.model, this.billable, tokens(undefined, input)),
      );
    }
  }

  async *stream(req: GenerateRequest): AsyncIterable<AgentEvent> {
    yield* this.generateWithTools({ ...req, tools: [], maxIterations: 1, toolBudgetExhausted: () => true });
  }

  async *generateWithTools(req: ToolRequest): AsyncIterable<AgentEvent> {
    const tools: ToolSet = {};
    for (const t of req.tools) {
      tools[t.name] = {
        description: t.description,
        inputSchema: t.inputSchema,
        execute: async (input: unknown, options: { toolCallId: string }) => t.execute(input, options.toolCallId),
      } as ToolSet[string];
    }
    const hasTools = req.tools.length > 0;
    const input = this.inputEstimate(req);
    let streamError: unknown = null;
    let startedSteps = 0;
    let finishedSteps = 0;
    let stepOutputChars = 0;

    const result = streamText({
      model: this.createModel(),
      instructions: req.system,
      messages: req.messages,
      maxOutputTokens: req.maxOutputTokens,
      temperature: req.temperature,
      abortSignal: req.signal,
      // Retries would be model calls the daily budget cannot see; the UI offers Retry instead.
      maxRetries: 0,
      ...(hasTools
        ? {
            tools,
            stopWhen: ({ steps }: { steps: unknown[] }) =>
              steps.length >= req.maxIterations || (req.reserveNextStep ? !req.reserveNextStep() : false),
            prepareStep: ({ stepNumber }: { stepNumber: number }) =>
              stepNumber >= req.maxIterations - 1 || req.toolBudgetExhausted() ? { toolChoice: "none" as const } : {},
          }
        : {}),
      onError: ({ error }: { error: unknown }) => {
        streamError = error;
      },
    });

    let failure: unknown = null;
    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case "start-step":
            startedSteps++;
            stepOutputChars = 0;
            break;
          case "reasoning-delta":
            stepOutputChars += part.text.length;
            break;
          case "text-delta":
            stepOutputChars += part.text.length;
            if (part.text) yield { type: "text", delta: part.text };
            break;
          case "tool-call":
            stepOutputChars += JSON.stringify({ name: part.toolName, input: part.input }).length;
            yield { type: "tool-start", id: part.toolCallId, name: part.toolName, input: part.input };
            break;
          case "tool-result":
            yield { type: "tool-end", id: part.toolCallId, name: part.toolName, output: part.output };
            break;
          case "tool-error":
            yield {
              type: "tool-end",
              id: part.toolCallId,
              name: part.toolName,
              output: null,
              error: part.error instanceof Error ? part.error.message : String(part.error),
            };
            break;
          case "finish-step":
            finishedSteps++;
            yield { type: "usage", usage: this.usage(part.usage, input, stepOutputChars) };
            stepOutputChars = 0;
            break;
          case "error":
            throw part.error;
          default:
            break;
        }
      }
    } catch (error) {
      failure = error;
    }
    failure ??= streamError;
    // A step that started but produced no finish part still consumed its prompt: meter it before rethrowing.
    for (; finishedSteps < startedSteps; finishedSteps++) {
      yield {
        type: "usage",
        usage: modelUsage(this.model, this.billable, tokens(undefined, input), tokens(undefined, stepOutputChars)),
      };
      stepOutputChars = 0;
    }
    if (failure) throw classifyAiError(failure, this.config.label);
  }
}
