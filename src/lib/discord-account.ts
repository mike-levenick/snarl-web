/**
 * Map a Discord identity onto a row in `users`.
 *
 * Order: an account already linked to this Discord id wins; otherwise a valid
 * link request attaches the Discord id to the signed-in password account;
 * otherwise a new password-less account is created with a free username.
 *
 * The store is injected so the rules can be unit-tested without Postgres.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ADMIN_USERNAMES, adminDiscordIds } from "./admin-accounts";

export interface DbUser {
  id: string;
  username: string;
  role: "user" | "admin";
}

export interface DiscordUserStore {
  findByDiscordId(discordId: string): Promise<DbUser | null>;
  /** Sets discord_id on the row only if it has none; returns the row on success. */
  linkIfUnlinked(userId: string, discordId: string): Promise<DbUser | null>;
  isUsernameTaken(username: string): Promise<boolean>;
  create(username: string, discordId: string, admin: boolean): Promise<DbUser>;
  /** Make an existing row admin + admitted. */
  promote(userId: string): Promise<DbUser | null>;
}

/** Thrown when the link request and the Discord identity disagree; Auth.js
 * turns it into a redirect to /login?error=... */
export class DiscordLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscordLinkError";
  }
}

const USERNAME_MAX = 30;

/** Pure: pick a username from Discord's names that `isTaken` does not reject. */
export async function pickUsername(
  preferred: string | null | undefined,
  fallback: string,
  discordId: string,
  isTaken: (name: string) => Promise<boolean>
): Promise<string> {
  const clean = (s: string) => s.replace(/[\r\n\x00-\x1f"\\]/g, "").trim().slice(0, USERNAME_MAX);
  let base = clean(preferred ?? "") || clean(fallback) || "student";
  if (base.length < 2) base = `student-${discordId.slice(-4)}`;

  const candidates = [
    base,
    `${base.slice(0, USERNAME_MAX - 5)}-${discordId.slice(-4)}`,
    `student-${discordId}`.slice(0, USERNAME_MAX),
  ];
  for (const c of candidates) {
    if (ADMIN_USERNAMES.includes(c.toLowerCase())) continue;
    if (!(await isTaken(c))) return c;
  }
  // Every guessable name is taken (someone squatted them): random suffix.
  for (;;) {
    const c = `student-${Math.random().toString(36).slice(2, 8)}`;
    if (!(await isTaken(c))) return c;
  }
}

export interface ResolveInput {
  discordId: string;
  globalName: string | null | undefined;
  username: string;
  /** User id a verified link request vouches for, or null. */
  linkUserId: string | null;
  /** User id of the session live on the callback request, or null. A link is
   * honoured only when both agree, so a stale link cookie on a shared browser
   * cannot bind the next visitor's Discord to someone else's account. */
  sessionUserId: string | null;
  /** Discord ids that are admins by configuration; defaults to the env list. */
  adminIds?: Set<string>;
}

export async function resolveDiscordUser(
  input: ResolveInput,
  store: DiscordUserStore = dbStore
): Promise<DbUser> {
  const linkUserId =
    input.linkUserId && input.sessionUserId === input.linkUserId ? input.linkUserId : null;
  const isConfiguredAdmin = (input.adminIds ?? adminDiscordIds()).has(input.discordId);

  const linked = await store.findByDiscordId(input.discordId);
  if (linked) {
    if (linkUserId && linked.id !== linkUserId) {
      throw new DiscordLinkError("That Discord account is already bound to another student.");
    }
    if (isConfiguredAdmin && linked.role !== "admin") {
      return (await store.promote(linked.id)) ?? linked;
    }
    return linked;
  }

  if (linkUserId) {
    const result = await store.linkIfUnlinked(linkUserId, input.discordId);
    if (result) {
      if (isConfiguredAdmin && result.role !== "admin") {
        return (await store.promote(result.id)) ?? result;
      }
      return result;
    }
    throw new DiscordLinkError("This account is already bound to a different Discord account.");
  }

  const username = await pickUsername(input.globalName, input.username, input.discordId, (n) =>
    store.isUsernameTaken(n)
  );
  try {
    return await store.create(username, input.discordId, isConfiguredAdmin);
  } catch (err) {
    // Two first sign-ins at once (double click) or a username race: the
    // other request may have won, in which case its row is ours.
    const again = await store.findByDiscordId(input.discordId);
    if (again) return again;
    throw err;
  }
}

const cols = { id: users.id, username: users.username, role: users.role };

export const dbStore: DiscordUserStore = {
  async findByDiscordId(discordId) {
    const [row] = await db.select(cols).from(users).where(eq(users.discordId, discordId)).limit(1);
    return row ?? null;
  },
  async linkIfUnlinked(userId, discordId) {
    const [row] = await db
      .update(users)
      .set({ discordId })
      .where(and(eq(users.id, userId), isNull(users.discordId)))
      .returning(cols);
    return row ?? null;
  },
  async isUsernameTaken(username) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    return !!row;
  },
  async create(username, discordId, admin) {
    const [row] = await db
      .insert(users)
      .values({ username, discordId, ...(admin && { role: "admin", approved: true }) })
      .returning(cols);
    return row;
  },
  async promote(userId) {
    const [row] = await db
      .update(users)
      .set({ role: "admin", approved: true })
      .where(eq(users.id, userId))
      .returning(cols);
    return row ?? null;
  },
};
