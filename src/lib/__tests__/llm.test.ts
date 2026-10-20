import { describe, expect, it } from "vitest";
import { APICallError, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import {
  LINE_SCATTERED,
  LINE_SEALED,
  LINE_SILENT,
  LINE_STRAINED,
  LINE_TRAILOFF,
  LINES_SEARCHING,
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_CALLS,
  buildRequest,
  runTurn,
  type TurnOptions,
  type TurnResult,
} from "../llm";
import { connectedPlayerNote, getSystemPrompt } from "../prompt";

type Unified = "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";

function finish(unified: Unified, raw?: string, providerMetadata?: Record<string, unknown>) {
  return {
    type: "finish" as const,
    finishReason: { unified, raw },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    ...(providerMetadata ? { providerMetadata } : {}),
  } as LanguageModelV4StreamPart;
}

function text(id: string, ...deltas: string[]): LanguageModelV4StreamPart[] {
  return [
    { type: "text-start", id },
    ...deltas.map((delta) => ({ type: "text-delta" as const, id, delta })),
    { type: "text-end", id },
  ];
}

function toolCall(query: string): LanguageModelV4StreamPart {
  return {
    type: "tool-call",
    toolCallId: "call-1",
    toolName: "search_knowledge",
    input: JSON.stringify({ query }),
  };
}

function stepsModel(steps: LanguageModelV4StreamPart[][]) {
  let i = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const chunks = steps[Math.min(i, steps.length - 1)];
      i++;
      return { stream: simulateReadableStream({ chunks }) };
    },
  });
  return model;
}

function throwingModel(err: unknown) {
  return new MockLanguageModelV4({
    doStream: async () => {
      throw err;
    },
  });
}

async function collect(stream: ReadableStream<string>): Promise<string> {
  let out = "";
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += value;
  }
  return out;
}

function opts(model: LanguageModelV4, extra: Partial<TurnOptions> = {}): TurnOptions {
  return {
    model,
    effort: "medium",
    systemPrompt: "You are Fragment.",
    history: [{ role: "user", content: "Hello" }],
    search: () => "[From Sharn]\nCity of Towers.",
    ...extra,
  };
}

async function run(model: LanguageModelV4, extra: Partial<TurnOptions> = {}) {
  let result: TurnResult | undefined;
  const shown = await collect(
    runTurn(opts(model, extra), {
      onDone: (r) => {
        result = r;
      },
      pickSearchingLine: () => LINES_SEARCHING[0],
    })
  );
  if (!result) throw new Error("onDone was not called");
  return { shown, result };
}

describe("buildRequest", () => {
  it("contains none of the parameters the 5.5 models reject", () => {
    const req = buildRequest(opts(stepsModel([])) as TurnOptions) as Record<string, unknown>;
    for (const key of ["temperature", "topP", "topK", "toolChoice", "seed", "stopSequences"]) {
      expect(req, key).not.toHaveProperty(key);
    }
    const anthropic = (req.providerOptions as { anthropic: Record<string, unknown> }).anthropic;
    expect(anthropic).not.toHaveProperty("fallbacks");
    expect(anthropic).not.toHaveProperty("thinking");
    expect(anthropic.effort).toBe("medium");
    expect(req.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  });

  it("caches the main system prompt and keeps extras in separate uncached messages", () => {
    const req = buildRequest(
      opts(stepsModel([]), { extraInstructions: ["## Current state", "", "greet them"] })
    );
    expect(req.instructions).toHaveLength(3);
    expect(req.instructions[0]).toMatchObject({
      role: "system",
      content: "You are Fragment.",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    });
    expect(req.instructions[1]).toEqual({ role: "system", content: "## Current state" });
    expect(req.instructions[2]).not.toHaveProperty("providerOptions");
  });

  it("sends the same cached block to every player; the name rides in an uncached extra", () => {
    const forPlayer = (name: string) =>
      buildRequest(
        opts(stepsModel([]), {
          systemPrompt: getSystemPrompt(),
          extraInstructions: [connectedPlayerNote(name) ?? ""],
        })
      ).instructions;
    const a = forPlayer("Soryn");
    const b = forPlayer("Rynel");
    expect(a[0]).toEqual(b[0]);
    expect(a[0].content).toBe(getSystemPrompt());
    expect(a[1].content).toContain('"Soryn"');
    expect(a[1]).not.toHaveProperty("providerOptions");
  });

  it("forces a final answer only once the search budget is spent", () => {
    const req = buildRequest(opts(stepsModel([])));
    expect(req.prepareStep({ stepNumber: 0 })).toBeUndefined();
    expect(req.prepareStep({ stepNumber: MAX_TOOL_CALLS - 1 })).toBeUndefined();
    expect(req.prepareStep({ stepNumber: MAX_TOOL_CALLS })).toEqual({ toolChoice: "none" });
  });
});

describe("runTurn", () => {
  it("streams a plain answer and stores it", async () => {
    const { shown, result } = await run(stepsModel([[...text("t", "I ", "remember."), finish("stop")]]));
    expect(shown).toBe("I remember.");
    expect(result).toEqual({ storedText: "I remember.", outcome: "ok" });
  });

  it("sends the request the wire expects: cached system block, effort, no sampling", async () => {
    const model = stepsModel([[...text("t", "ok"), finish("stop")]]);
    await run(model, { extraInstructions: ["cue"] });
    const call = model.doStreamCalls[0];
    expect(call.temperature).toBeUndefined();
    expect(call.topP).toBeUndefined();
    expect(call.topK).toBeUndefined();
    expect(call.toolChoice?.type ?? "auto").toBe("auto");
    expect(call.providerOptions?.anthropic).toMatchObject({ effort: "medium" });
    const systems = call.prompt.filter((m) => m.role === "system");
    expect(systems).toHaveLength(2);
    expect(systems[0].providerOptions?.anthropic).toEqual({ cacheControl: { type: "ephemeral" } });
    expect(systems[1].providerOptions).toBeUndefined();
  });

  it("searches, separates the remark from the answer, stores only the final step", async () => {
    const model = stepsModel([
      [...text("a", "That name stirs something..."), toolCall("Sharn"), finish("tool-calls")],
      [...text("b", "Sharn. City of Towers."), finish("stop")],
    ]);
    const { shown, result } = await run(model);
    expect(shown).toBe("That name stirs something...\n\nSharn. City of Towers.");
    expect(result).toEqual({ storedText: "Sharn. City of Towers.", outcome: "ok" });
    expect(model.doStreamCalls).toHaveLength(2);
  });

  it("covers the search pause when the tool call arrives with no text", async () => {
    const model = stepsModel([
      [toolCall("Sharn"), finish("tool-calls")],
      [...text("b", "Found it."), finish("stop")],
    ]);
    const { shown, result } = await run(model);
    expect(shown).toBe(`${LINES_SEARCHING[0]}\n\nFound it.`);
    expect(result.storedText).toBe("Found it.");
  });

  it("ends a refusal with the sealed line and stores it", async () => {
    const model = stepsModel([
      [
        ...text("a", "I..."),
        finish("content-filter", "refusal", {
          anthropic: { stopDetails: { type: "refusal", category: "cyber" } },
        }),
      ],
    ]);
    const { shown, result } = await run(model);
    expect(shown).toBe(`I...\n\n${LINE_SEALED}`);
    // The cut-off partial text is display-only; only the sealed line is stored.
    expect(result).toEqual({ storedText: LINE_SEALED, outcome: "refusal" });
  });

  it("speaks the silent line when the final step produced no text", async () => {
    const model = stepsModel([
      [...text("a", "One moment..."), toolCall("x"), finish("tool-calls")],
      [finish("stop")],
    ]);
    const { shown, result } = await run(model);
    expect(shown).toBe(`One moment...\n\n${LINE_SILENT}`);
    expect(result).toEqual({ storedText: LINE_SILENT, outcome: "silent" });
  });

  it("trails off when the output cap is hit", async () => {
    const { shown, result } = await run(stepsModel([[...text("a", "The towers"), finish("length")]]));
    expect(shown).toBe(`The towers${LINE_TRAILOFF}`);
    expect(result).toEqual({ storedText: `The towers${LINE_TRAILOFF}`, outcome: "trailoff" });
  });

  it("maps an exhausted-retries 529 to the strained line and stores nothing", async () => {
    const err = new APICallError({
      message: "overloaded",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: { system: "SECRET PROMPT" },
      statusCode: 529,
      isRetryable: true,
    });
    const model = throwingModel(err);
    const { shown, result } = await run(model, { maxRetries: 0 });
    expect(shown).toBe(LINE_STRAINED);
    expect(result).toEqual({ storedText: null, outcome: "strained" });
  });

  it("maps a retryable error wrapped in a RetryError to strained and logs the cause", async () => {
    const logged: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    };
    try {
      const err = new APICallError({
        message: "rate limited",
        url: "https://api.anthropic.com/v1/messages",
        requestBodyValues: { system: "SECRET PROMPT" },
        statusCode: 429,
        isRetryable: true,
        responseHeaders: { "request-id": "req_429" },
      });
      // One retry with no retry-after header: the SDK's backoff is short.
      const { shown, result } = await run(throwingModel(err), { maxRetries: 1 });
      expect(shown).toBe(LINE_STRAINED);
      expect(result.outcome).toBe("strained");
    } finally {
      console.error = orig;
    }
    const line = logged.join("\n");
    expect(line).toContain('"status":429');
    expect(line).toContain("req_429");
    expect(line).toContain('"attempts":2');
    expect(line).not.toContain("SECRET PROMPT");
  }, 15000);

  it("maps a mid-stream overload to strained after the partial text, storing nothing", async () => {
    const model = stepsModel([
      [
        ...text("a", "The towers"),
        {
          type: "error",
          error: { type: "overloaded_error", message: "Overloaded", statusCode: 529, isRetryable: true },
        } as unknown as LanguageModelV4StreamPart,
      ],
    ]);
    const { shown, result } = await run(model, { maxRetries: 0 });
    expect(shown).toBe(`The towers\n\n${LINE_STRAINED}`);
    expect(result).toEqual({ storedText: null, outcome: "strained" });
  });

  it("forces a final answer on the fourth step when the model keeps searching", async () => {
    const searching: LanguageModelV4StreamPart[] = [toolCall("again"), finish("tool-calls")];
    const model = stepsModel([searching, searching, searching, [...text("z", "Enough."), finish("stop")]]);
    const { shown, result } = await run(model);
    expect(model.doStreamCalls).toHaveLength(MAX_TOOL_CALLS + 1);
    expect(model.doStreamCalls[MAX_TOOL_CALLS].toolChoice).toEqual({ type: "none" });
    for (let i = 0; i < MAX_TOOL_CALLS; i++) {
      expect(model.doStreamCalls[i].toolChoice?.type ?? "auto").toBe("auto");
    }
    expect(shown.endsWith("Enough.")).toBe(true);
    expect(result).toEqual({ storedText: "Enough.", outcome: "ok" });
  });

  it("maps a 4xx to the scattered line and stores nothing", async () => {
    const err = new APICallError({
      message: "bad request",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 400,
      isRetryable: false,
    });
    const { shown, result } = await run(throwingModel(err));
    expect(shown).toBe(LINE_SCATTERED);
    expect(result).toEqual({ storedText: null, outcome: "scattered" });
  });

  it("never logs the request body on error", async () => {
    const logged: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    };
    try {
      const err = new APICallError({
        message: "bad request",
        url: "https://api.anthropic.com/v1/messages",
        requestBodyValues: { system: "SECRET PROMPT" },
        statusCode: 400,
        isRetryable: false,
        responseHeaders: { "request-id": "req_123" },
      });
      await run(throwingModel(err));
    } finally {
      console.error = orig;
    }
    expect(logged.join("\n")).not.toContain("SECRET PROMPT");
    expect(logged.join("\n")).toContain("req_123");
  });
});
