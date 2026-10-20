export const ADMIN_ACCOUNTS = [
  { username: "thessarian", envVar: "ADMIN_THESSARIAN_PASSWORD" },
  { username: "marcus", envVar: "ADMIN_MARCUS_PASSWORD" },
  { username: "lyralei", envVar: "ADMIN_LYRALEI_PASSWORD" },
  { username: "kess", envVar: "ADMIN_KESS_PASSWORD" },
  { username: "velani", envVar: "ADMIN_VELANI_PASSWORD" },
] as const;

export const ADMIN_USERNAMES: string[] = ADMIN_ACCOUNTS.map((a) => a.username);

/** `id, id=Name, ...` → id → name (null when none given). */
export function parseIdList(raw: string | undefined): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const entry of (raw ?? "").split(",")) {
    const [id, ...rest] = entry.split("=");
    const key = id.trim();
    if (!/^\d{5,}$/.test(key)) continue;
    const name = rest.join("=").trim();
    out.set(key, name || null);
  }
  return out;
}

/** Discord user ids that are admins the moment they sign in (comma-separated
 * `ADMIN_DISCORD_IDS`). Survives a player wipe because admins are kept. */
export function adminDiscordIds(env: Record<string, string | undefined> = process.env): Map<string, string | null> {
  return parseIdList(env.ADMIN_DISCORD_IDS);
}

/** Discord user ids admitted without waiting (comma-separated
 * `ALLOWED_DISCORD_IDS`, entries `id` or `id=Character Name`). */
export function allowedDiscordIds(env: Record<string, string | undefined> = process.env): Map<string, string | null> {
  return parseIdList(env.ALLOWED_DISCORD_IDS);
}
