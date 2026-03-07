export type PuzzleState = "initial" | "stage_2";

export function checkUnlockPhrase(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("bound in sundering") && lower.includes("loosed by memory");
}
