/**
 * Model configuration, read from the environment once per process.
 *
 * Any of claude-sonnet-5-5 / claude-opus-5-5 / claude-haiku-5-5 is a drop-in:
 * the request shape in llm.ts stays valid on all three (adaptive thinking at
 * the API default, no sampling params, no forced tool choice, no fallbacks).
 * Switch with CLAUDE_MODEL_ID; tune depth with CLAUDE_EFFORT.
 */

export const VALID_EFFORT = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof VALID_EFFORT)[number];

export const DEFAULT_MODEL_ID = "claude-sonnet-5-5";
export const DEFAULT_EFFORT: Effort = "medium";

/** Cheap model for side jobs (conversation titles). */
export const TITLE_MODEL_ID = "claude-haiku-5-5";

export interface ModelConfig {
  modelId: string;
  effort: Effort;
  debug: boolean;
}

export function isEffort(value: string): value is Effort {
  return (VALID_EFFORT as readonly string[]).includes(value);
}

/**
 * Pure: resolve a config from an env-like record. Returns the config and, if
 * CLAUDE_EFFORT was unusable, the value that was substituted.
 */
export function resolveModelConfig(env: Record<string, string | undefined>): {
  config: ModelConfig;
  substitutedEffort?: string;
} {
  const modelId = env.CLAUDE_MODEL_ID?.trim() || DEFAULT_MODEL_ID;
  const requested = env.CLAUDE_EFFORT?.trim();
  const effort: Effort = requested && isEffort(requested) ? requested : DEFAULT_EFFORT;
  const substitutedEffort = requested && !isEffort(requested) ? requested : undefined;
  return {
    config: { modelId, effort, debug: env.CLAUDE_DEBUG === "1" },
    substitutedEffort,
  };
}

let cached: ModelConfig | null = null;

export function getModelConfig(): ModelConfig {
  if (!cached) {
    const { config, substitutedEffort } = resolveModelConfig(process.env);
    if (substitutedEffort !== undefined) {
      console.warn(
        `config_substituted: CLAUDE_EFFORT=${JSON.stringify(substitutedEffort)} is not one of ${VALID_EFFORT.join("|")}; using ${config.effort}`
      );
    }
    cached = config;
  }
  return cached;
}
