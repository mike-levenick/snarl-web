/**
 * Admission: a Discord sign-in creates an account that cannot chat until an
 * admin admits it and gives it the character's name. Admins are always
 * admitted so the seeded accounts need no data fix.
 */
import { ADMIN_USERNAMES } from "./admin-accounts";

export function isAdmitted(row: { approved: boolean; role: string }): boolean {
  return row.approved || row.role === "admin";
}

/** The name Fragment is told and the UI shows. */
export function displayName(row: { username: string; characterName: string | null }): string {
  return row.characterName?.trim() || row.username;
}

export const NAME_MIN = 2;
export const NAME_MAX = 30;

/** Returns a cleaned name, or an error message. Names are what Fragment is
 * told about the connected student, so they must be plain text. */
export function validateCharacterName(
  input: unknown
): { name: string; error?: never } | { error: string; name?: never } {
  if (typeof input !== "string") return { error: "Name is required" };
  const name = input.replace(/\s+/g, " ").trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { error: `Name must be ${NAME_MIN}-${NAME_MAX} characters` };
  }
  if (/[\x00-\x1f"\\<>]/.test(name)) return { error: "Name contains characters that cannot be used" };
  if (ADMIN_USERNAMES.includes(name.toLowerCase())) return { error: "That name is reserved" };
  return { name };
}
