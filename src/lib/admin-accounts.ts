export const ADMIN_ACCOUNTS = [
  { username: "thessarian", envVar: "ADMIN_THESSARIAN_PASSWORD" },
  { username: "marcus", envVar: "ADMIN_MARCUS_PASSWORD" },
  { username: "lyralei", envVar: "ADMIN_LYRALEI_PASSWORD" },
  { username: "kess", envVar: "ADMIN_KESS_PASSWORD" },
  { username: "velani", envVar: "ADMIN_VELANI_PASSWORD" },
] as const;

export const ADMIN_USERNAMES: string[] = ADMIN_ACCOUNTS.map((a) => a.username);

/** Discord user ids that are admins the moment they sign in (comma-separated
 * `ADMIN_DISCORD_IDS`). Survives a player wipe because admins are kept. */
export function adminDiscordIds(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.ADMIN_DISCORD_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{5,}$/.test(s))
  );
}
