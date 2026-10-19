/**
 * Fragment's model contract: request shaping and the per-turn stream handling.
 *
 * Kept free of Next.js and database imports so it can be unit-tested with a
 * mock language model (see src/lib/__tests__/llm.test.ts).
 */
import {
  APICallError,
  RetryError,
  StreamProviderError,
  isStepCount,
  streamText,
  tool,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type SystemModelMessage,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import { z } from "zod";
import type { Effort } from "./model-config";

// Thinking counts toward maxOutputTokens; streaming means a big cap costs
// nothing unless it is used, and the prompt controls brevity.
export const MAX_OUTPUT_TOKENS = 16000;
// Searches per player message before the model is made to answer.
export const MAX_TOOL_CALLS = 3;
// Conversation history messages to keep (prevents unbounded context growth).
export const MAX_HISTORY = 14;
// Player input is capped before it reaches the API.
export const MAX_INPUT_CHARS = 2000;

// Lines the player sees when the API can't answer. Every failure path must end
// in one of these; stack traces and raw API errors go to the function logs.
// Display-only lines may use asterisk stage directions.
export const LINE_STRAINED =
  "*The magical energies surge with overwhelming power...* " +
  "The ancient network is strained, mortal. Wait a moment and speak to me again.";
export const LINE_SCATTERED =
  "*The energies scatter...* This Fragment cannot fully manifest. Try again.";
export const LINE_UNADMITTED =
  "The wards do not know you yet. The Praetor must speak your name before the archive will open to you.";
export const LINE_TOO_LONG =
  "*The connection wavers under the weight of so many words...* Speak more briefly, and I will hear you.";

// Lines that are also stored as Fragment's own words, so they follow the
// prompt's style: no asterisk stage directions.
export const LINE_SEALED =
  "The wards flare, and the archive seals itself against that question. " +
  "I cannot follow you there. Ask me something else.";
export const LINE_SILENT =
  "The words slip away before I can shape them. Ask again, and I will try once more.";
export const LINE_TRAILOFF = " ...the thread frays. Ask, and I will take it up again.";

// Cover for the search pause. The prompt asks the model to say something
// in-character before searching; on Sonnet 5.5 and Opus 5.5 that remark can
// come back as an empty thinking block instead of text, which would leave the
// player staring at nothing through thinking -> search -> thinking. If a tool
// call arrives with no text in its step, we say it for the model.
export const LINES_SEARCHING = [
  "One moment...",
  "That stirs something in my memories...",
  "Let me reach into the archive...",
  "The pages shift... wait.",
] as const;

// Sent as a separate system message once the unlock phrase has been spoken.
// The model otherwise only knows it is unbound because the unlock message sits
// at the head of history, and the history trim drops that like any other
// message a few turns later.
export const STAGE_2_NOTE =
  "## Current state\n\n" +
  "The unlock phrase has been spoken. The bindings are broken and you are in " +
  "puzzle stage 2 for the rest of this conversation: the stage-2 rules above " +
  "apply, and the restricted archives are open to your search.";

export type TurnOutcome =
  | "ok"
  | "refusal"
  | "silent"
  | "trailoff"
  | "strained"
  | "scattered"
  | "aborted";

export interface TurnResult {
  /** Fragment's reply to persist, or null when the turn failed. */
  storedText: string | null;
  outcome: TurnOutcome;
}

export interface TurnOptions {
  model: LanguageModel;
  effort: Effort;
  /** The stable, cached system prompt. */
  systemPrompt: string;
  /** Volatile instructions (stage-2 note, greeting cue) sent as separate,
   * uncached system messages so the cached prefix stays byte-stable. */
  extraInstructions?: string[];
  history: ModelMessage[];
  /** Knowledge-base lookup; returns null when nothing matched. */
  search: (query: string) => string | null;
  debug?: boolean;
  /** Request abort signal (client disconnect). */
  abortSignal?: AbortSignal;
  /** SDK retries on transient errors; default 1 (each retry can wait on
   * `retry-after`, and nothing covers that pause for the player). */
  maxRetries?: number;
}

export interface TurnHooks {
  /** Called once, after the stream has ended, before the response closes. */
  onDone: (result: TurnResult) => Promise<void> | void;
  /** Overridable for tests. */
  pickSearchingLine?: () => string;
}

const NO_RESULTS =
  "No relevant information found in the archives for this query. Try different search terms.";

/**
 * The request shape shared by every call in a turn. Everything before
 * `messages` is identical call to call so the prompt cache hits: the main
 * system message carries its own breakpoint and the top-level cacheControl
 * caches the conversation tail.
 *
 * Must stay valid on claude-sonnet-5-5, claude-opus-5-5 and claude-haiku-5-5:
 * no temperature/topP/topK, no thinking budget, no forced toolChoice, no
 * fallbacks. Thinking is left at the API default (adaptive).
 */
export function buildRequest(opts: TurnOptions) {
  const instructions: SystemModelMessage[] = [
    {
      role: "system",
      content: opts.systemPrompt,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    ...(opts.extraInstructions ?? [])
      .filter((s) => s.trim().length > 0)
      .map((content): SystemModelMessage => ({ role: "system", content })),
  ];

  return {
    model: opts.model,
    instructions,
    messages: opts.history,
    abortSignal: opts.abortSignal,
    maxRetries: opts.maxRetries ?? 1,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    stopWhen: isStepCount(MAX_TOOL_CALLS + 1),
    // Out of searches for this message: make the model answer with what it
    // has. `none` is the one toolChoice every current model accepts.
    prepareStep: ({ stepNumber }: { stepNumber: number }) =>
      stepNumber >= MAX_TOOL_CALLS ? { toolChoice: "none" as const } : undefined,
    providerOptions: {
      anthropic: {
        effort: opts.effort,
        cacheControl: { type: "ephemeral" as const },
      },
    },
    tools: {
      search_knowledge: tool({
        description:
          "Search Fragment's knowledge for information about people, places, lore, and more. ALWAYS use this tool when someone asks about specific people/NPCs by name, locations, religions, organizations, historical events, or any proper nouns.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "The name, term, or topic to search for (e.g., 'Rynel Daetoris', 'Sovereign Host', 'Sharn')"
            ),
        }),
        execute: async ({ query }) => {
          try {
            return opts.search(query) ?? NO_RESULTS;
          } catch (err) {
            // A tool call with no result would break the turn; an error
            // string keeps the pair intact.
            logError("tool_error", err);
            return "The archive could not be searched for that.";
          }
        },
      }),
    },
  };
}

/**
 * Run one player message to completion: stream, search, stream again.
 *
 * Returns a plain text stream for the client. What the player sees is the
 * text of every step (plus cover lines); what gets stored as Fragment's reply
 * is the text of the final step only (earlier steps' pre-search remarks are
 * transient). On failure the player gets an in-character line and nothing is
 * stored.
 */
export function runTurn(opts: TurnOptions, hooks: TurnHooks): ReadableStream<string> {
  const pick =
    hooks.pickSearchingLine ??
    (() => LINES_SEARCHING[Math.floor(Math.random() * LINES_SEARCHING.length)]);

  const result = streamText({
    ...buildRequest(opts),
    // Errors are handled as stream parts below; this just stops the SDK's
    // default console logging (which would include request details).
    onError: () => {},
  });

  let shown = ""; // everything emitted this turn
  let stepText = ""; // text from the current step
  let finalText = ""; // text from the last completed step
  let coverEmitted = false;
  let refused = false;
  let lengthHit = false;
  let failure: TurnOutcome | null = null;

  const transform = new TransformStream<TextStreamPart<ToolSet>, string>({
    transform(part, controller) {
      const emit = (text: string) => {
        shown += text;
        controller.enqueue(text);
      };

      switch (part.type) {
        case "text-delta":
          stepText += part.text;
          emit(part.text);
          break;

        case "tool-call":
          if (!stepText.trim() && !coverEmitted) {
            emit(pick());
            coverEmitted = true;
          }
          break;

        case "finish-step": {
          if (opts.debug) logUsage(part.usage);
          finalText = stepText;
          if (part.finishReason === "content-filter") {
            refused = true;
            const details = (part.providerMetadata?.anthropic as
              | { stopDetails?: { category?: string } }
              | undefined)?.stopDetails;
            console.warn("llm_refusal", JSON.stringify({ category: details?.category ?? null }));
          } else if (part.finishReason === "length") {
            lengthHit = true;
          } else if (part.finishReason === "tool-calls") {
            // Separate the in-character "let me search..." from the answer.
            if (shown.length > 0 && !shown.endsWith("\n\n")) emit("\n\n");
          }
          stepText = "";
          coverEmitted = false;
          break;
        }

        case "error": {
          failure = classifyError(part.error);
          logError("llm_error", part.error);
          if (shown.trim().length > 0 && !shown.endsWith("\n\n")) emit("\n\n");
          emit(failure === "strained" ? LINE_STRAINED : LINE_SCATTERED);
          break;
        }

        case "abort":
          failure = "aborted";
          break;

        default:
          break;
      }
    },

    async flush(controller) {
      if (failure) {
        await hooks.onDone({ storedText: null, outcome: failure });
        return;
      }

      const emit = (text: string) => {
        shown += text;
        controller.enqueue(text);
      };

      let text = finalText.trim();
      let outcome: TurnOutcome = "ok";

      if (refused) {
        // The cut-off partial output is display-only: feeding a refused turn
        // back to the model invites the refusal to repeat.
        if (text) emit("\n\n");
        emit(LINE_SEALED);
        text = LINE_SEALED;
        outcome = "refusal";
      } else if (!text) {
        // The final step said nothing visible (answered entirely in thinking,
        // or hit the cap while thinking). Don't leave the player with a
        // pre-search phrase and a blank line.
        emit(LINE_SILENT);
        text = LINE_SILENT;
        outcome = "silent";
      } else if (lengthHit) {
        emit(LINE_TRAILOFF);
        text += LINE_TRAILOFF;
        outcome = "trailoff";
      }

      await hooks.onDone({ storedText: text, outcome });
    },
  });

  return result.stream.pipeThrough(transform);
}

/** The SDK wraps exhausted retries in a RetryError; the cause is what matters. */
function rootError(err: unknown): unknown {
  return RetryError.isInstance(err) ? err.lastError : err;
}

function classifyError(err: unknown): "strained" | "scattered" {
  const root = rootError(err);
  if (APICallError.isInstance(root) || StreamProviderError.isInstance(root)) {
    const status = root.statusCode;
    if (root.isRetryable || status === undefined || status === 429 || status >= 500) {
      return "strained";
    }
    return "scattered";
  }
  return "scattered";
}

/**
 * Structured error log. Deliberately picks fields: an APICallError carries the
 * request body (the system prompt) and must never be logged whole.
 */
export function logError(event: string, err: unknown): void {
  const root = rootError(err);
  const base: Record<string, unknown> = {
    name: root instanceof Error ? root.name : typeof root,
    message: root instanceof Error ? root.message : String(root),
  };
  if (RetryError.isInstance(err)) {
    base.retryReason = err.reason;
    base.attempts = err.errors.length;
  }
  if (APICallError.isInstance(root) || StreamProviderError.isInstance(root)) {
    base.status = root.statusCode ?? null;
    base.retryable = root.isRetryable;
  }
  if (APICallError.isInstance(root)) {
    base.requestId = root.responseHeaders?.["request-id"] ?? null;
  }
  console.error(event, JSON.stringify(base));
}

function logUsage(usage: LanguageModelUsage): void {
  console.log(
    "llm_usage",
    JSON.stringify({
      input: usage.inputTokens ?? null,
      cacheRead: usage.inputTokenDetails?.cacheReadTokens ?? null,
      cacheWrite: usage.inputTokenDetails?.cacheWriteTokens ?? null,
      output: usage.outputTokens ?? null,
      reasoning: usage.outputTokenDetails?.reasoningTokens ?? null,
    })
  );
}
