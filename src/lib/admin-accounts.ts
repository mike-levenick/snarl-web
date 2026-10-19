export const ADMIN_ACCOUNTS = [
  { username: "thessarian", envVar: "ADMIN_THESSARIAN_PASSWORD" },
  { username: "marcus", envVar: "ADMIN_MARCUS_PASSWORD" },
  { username: "lyralei", envVar: "ADMIN_LYRALEI_PASSWORD" },
  { username: "kess", envVar: "ADMIN_KESS_PASSWORD" },
  { username: "velani", envVar: "ADMIN_VELANI_PASSWORD" },
] as const;

export const ADMIN_USERNAMES: string[] = ADMIN_ACCOUNTS.map((a) => a.username);

function parseIdList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{5,}$/.test(s))
  );
}

/** Discord user ids that are admins the moment they sign in (comma-separated
 * `ADMIN_DISCORD_IDS`). Survives a player wipe because admins are kept. */
export function adminDiscordIds(env: Record<string, string | undefined> = process.env): Set<string> {
  return parseIdList(env.ADMIN_DISCORD_IDS);
}

/** Discord user ids admitted without waiting (comma-separated
 * `ALLOWED_DISCORD_IDS`). They keep their Discord name until renamed. */
export function allowedDiscordIds(env: Record<string, string | undefined> = process.env): Set<string> {
  return parseIdList(env.ALLOWED_DISCORD_IDS);
}
