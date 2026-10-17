import type { ModelMessage } from "ai";
import { MAX_HISTORY } from "./llm";
import { checkUnlockPhrase } from "./puzzle";

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Shape stored rows into the model's history.
 *
 * After an unlock, only messages from the unlock message onward are sent, so
 * pre-unlock "I don't know" answers don't anchor the model (the rows stay in
 * Postgres; the player can still scroll up). Then trim to MAX_HISTORY and make
 * sure the window starts on a user turn, since a failed turn leaves no
 * assistant row and the alternation can break.
 */
export function shapeHistory(rows: StoredMessage[], stage2: boolean): ModelMessage[] {
  let window = rows;
  if (stage2) {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].role === "user" && checkUnlockPhrase(rows[i].content)) {
        window = rows.slice(i);
        break;
      }
    }
  }
  window = window.slice(-MAX_HISTORY);
  while (window.length > 0 && window[0].role !== "user") window = window.slice(1);
  return window.map((m) => ({ role: m.role, content: m.content }));
}
