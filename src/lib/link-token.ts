/**
 * Signed, short-lived token that says "the browser holding this was signed in
 * as user X and asked to link a Discord account". Set as a cookie before the
 * Discord OAuth redirect and read back in the JWT callback once Discord has
 * answered. Signed so a visitor cannot forge one for someone else's user id.
 */
import { createHmac, timingSafeEqual } from "crypto";

export const LINK_COOKIE = "snarl_link_discord";
export const LINK_TTL_MS = 10 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET / NEXTAUTH_SECRET is not set");
  return s;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function signLinkToken(userId: string, now = Date.now(), key = secret()): string {
  const payload = `${userId}.${now + LINK_TTL_MS}`;
  return `${payload}.${sign(payload, key)}`;
}

/** Returns the user id the token vouches for, or null if forged or expired. */
export function verifyLinkToken(
  token: string | undefined,
  now = Date.now(),
  key = secret()
): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const expected = sign(`${userId}.${expStr}`, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return null;
  return userId || null;
}
