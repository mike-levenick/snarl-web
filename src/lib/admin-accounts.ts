export const ADMIN_ACCOUNTS = [
  { username: "thessarian", envVar: "ADMIN_THESSARIAN_PASSWORD" },
  { username: "marcus", envVar: "ADMIN_MARCUS_PASSWORD" },
  { username: "lyralei", envVar: "ADMIN_LYRALEI_PASSWORD" },
  { username: "kess", envVar: "ADMIN_KESS_PASSWORD" },
  { username: "velani", envVar: "ADMIN_VELANI_PASSWORD" },
] as const;

export const ADMIN_USERNAMES: string[] = ADMIN_ACCOUNTS.map((a) => a.username);
