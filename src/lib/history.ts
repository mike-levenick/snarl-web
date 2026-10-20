import type { ModelMessage } from "ai";
import { MAX_HISTORY } from "./llm";

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Shape stored rows into the model's history: trim to MAX_HISTORY and make
 * sure the window starts on a user turn, since a failed turn leaves no
 * assistant row and the alternation can break.
 */
export function shapeHistory(rows: StoredMessage[]): ModelMessage[] {
  let window = rows.slice(-MAX_HISTORY);
  while (window.length > 0 && window[0].role !== "user") window = window.slice(1);
  return window.map((m) => ({ role: m.role, content: m.content }));
}
