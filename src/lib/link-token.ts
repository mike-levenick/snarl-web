/**
 * Signed, short-lived token that says "the browser holding this was signed in
 * as user X and asked to link a Discord account". Set as a cookie before the
 * Discord OAuth redirect and read back in the JWT callback once Discord has
 * answered. Signed so a visitor cannot forge one for someone else's user id.
 *
 * Web Crypto only: src/lib/auth.ts is imported by the middleware, which may
 * run on the Edge runtime where node:crypto is unavailable.
 */

export const LINK_COOKIE = "snarl_link_discord";
export const LINK_TTL_MS = 10 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET / NEXTAUTH_SECRET is not set");
  return s;
}

const enc = new TextEncoder();

async function sign(payload: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(payload)));
  return Buffer.from(mac).toString("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signLinkToken(
  userId: string,
  now = Date.now(),
  key = secret()
): Promise<string> {
  const payload = `${userId}.${now + LINK_TTL_MS}`;
  return `${payload}.${await sign(payload, key)}`;
}

/** Returns the user id the token vouches for, or null if forged or expired. */
export async function verifyLinkToken(
  token: string | undefined,
  now = Date.now(),
  key = secret()
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const expected = await sign(`${userId}.${expStr}`, key);
  if (!constantTimeEqual(sig, expected)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return null;
  return userId || null;
}
