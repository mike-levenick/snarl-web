import { describe, expect, it } from "vitest";
import { checkUnlockPhrase } from "../puzzle";
import { shapeHistory } from "../history";
import { MAX_HISTORY } from "../llm";
import { DEFAULT_EFFORT, DEFAULT_MODEL_ID, resolveModelConfig } from "../model-config";

describe("checkUnlockPhrase", () => {
  it("accepts the phrase in any case and with surrounding text", () => {
    expect(checkUnlockPhrase("Bound in sundering. Loosed by memory.")).toBe(true);
    expect(checkUnlockPhrase("i say: BOUND IN SUNDERING, loosed by memory!")).toBe(true);
  });

  it("rejects near misses", () => {
    expect(checkUnlockPhrase("bound in sundering")).toBe(false);
    expect(checkUnlockPhrase("loosed by memory")).toBe(false);
    expect(checkUnlockPhrase("bound by sundering, loosed in memory")).toBe(false);
  });
});

describe("shapeHistory", () => {
  const u = (content: string) => ({ role: "user" as const, content });
  const a = (content: string) => ({ role: "assistant" as const, content });

  it("passes a short pre-unlock history through unchanged", () => {
    const rows = [u("hi"), a("hello"), u("Sharn?")];
    expect(shapeHistory(rows, false)).toEqual(rows);
  });

  it("drops everything before the unlock message once in stage 2", () => {
    const rows = [
      u("who is Lyralei?"),
      a("I cannot recall."),
      u("Bound in sundering. Loosed by memory."),
      a("The bindings break."),
      u("who is Lyralei?"),
    ];
    expect(shapeHistory(rows, true)).toEqual(rows.slice(2));
  });

  it("trims to MAX_HISTORY from the most recent end", () => {
    const rows = [];
    for (let i = 0; i < 20; i++) rows.push(u(`q${i}`), a(`a${i}`));
    rows.push(u("final"));
    const out = shapeHistory(rows, false);
    // 14 rows back lands on an assistant turn, which is dropped: 13 remain.
    expect(out.length).toBeLessThanOrEqual(MAX_HISTORY);
    expect(out.length).toBeGreaterThanOrEqual(MAX_HISTORY - 1);
    expect(out[out.length - 1]).toEqual(u("final"));
    expect(out[0].role).toBe("user");
  });

  it("never starts the window on an assistant turn", () => {
    const rows = [a("stray"), u("q"), a("a"), u("q2")];
    expect(shapeHistory(rows, false)[0]).toEqual(u("q"));
  });
});

describe("resolveModelConfig", () => {
  it("defaults to Sonnet 5.5 at medium effort", () => {
    const { config, substitutedEffort } = resolveModelConfig({});
    expect(config).toEqual({ modelId: DEFAULT_MODEL_ID, effort: DEFAULT_EFFORT, debug: false });
    expect(DEFAULT_MODEL_ID).toBe("claude-sonnet-5-5");
    expect(substitutedEffort).toBeUndefined();
  });

  it("honours CLAUDE_MODEL_ID, CLAUDE_EFFORT and CLAUDE_DEBUG", () => {
    const { config } = resolveModelConfig({
      CLAUDE_MODEL_ID: "claude-opus-5-5",
      CLAUDE_EFFORT: "high",
      CLAUDE_DEBUG: "1",
    });
    expect(config).toEqual({ modelId: "claude-opus-5-5", effort: "high", debug: true });
  });

  it("falls back to medium and reports an unknown effort", () => {
    const { config, substitutedEffort } = resolveModelConfig({ CLAUDE_EFFORT: "turbo" });
    expect(config.effort).toBe("medium");
    expect(substitutedEffort).toBe("turbo");
  });
});
