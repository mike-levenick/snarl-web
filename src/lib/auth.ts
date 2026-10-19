import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import { getToken } from "next-auth/jwt";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { resolveDiscordUser } from "./discord-account";
import { LINK_COOKIE, verifyLinkToken } from "./link-token";

// Players sign in rarely; keep them signed in for half a year...
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 180;
// ...but re-check the row this often so a deleted user or a changed role
// does not ride a stale token for six months.
const REVALIDATE_MS = 15 * 60 * 1000;

const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";

/** The link cookie is set by /api/auth/link-discord right before the OAuth
 * redirect. Single use: it is cleared as soon as it has been read. */
async function pendingLinkUserId(): Promise<string | null> {
  let jar: Awaited<ReturnType<typeof cookies>>;
  try {
    jar = await cookies();
  } catch {
    return null;
  }
  const userId = await verifyLinkToken(jar.get(LINK_COOKIE)?.value);
  if (userId) {
    try {
      jar.delete(LINK_COOKIE);
    } catch {
      // Expires on its own in ten minutes; the session check still guards it.
    }
  }
  return userId;
}

/** The session that was live when the Discord callback arrived (the password
 * session of a player who clicked "Link Discord"), or null. */
async function liveSessionUserId(): Promise<string | null> {
  try {
    const h = await headers();
    const secure = h.get("x-forwarded-proto") === "https" || process.env.NODE_ENV === "production";
    const token = await getToken({ req: { headers: h }, secret: SECRET, secureCookie: secure });
    return typeof token?.id === "string" ? token.id : null;
  } catch {
    return null;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_S },
  providers: [
    Discord({
      // Discord echoes `iss=https://discord.com` on the callback; without this
      // Auth.js compares it to a placeholder and every sign-in fails with
      // "unexpected iss (issuer) response parameter value".
      issuer: "https://discord.com",
      // Identity only; no email scope, nothing else is read.
      authorization: { params: { scope: "identify" } },
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const username = credentials.username as string;
        const password = credentials.password as string;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        // Discord-only accounts have no password to check.
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.username, role: user.role };
      },
    }),
  ],
  callbacks: {
    authorized({ auth: session, request }) {
      const isLoggedIn = !!session?.user;
      const pathname = request.nextUrl.pathname;
      const isProtectedPage =
        pathname.startsWith("/chat") || pathname.startsWith("/admin");
      const isProtectedApi =
        pathname.startsWith("/api/chat") ||
        pathname.startsWith("/api/conversations") ||
        pathname.startsWith("/api/admin");
      if (!isLoggedIn && (isProtectedPage || isProtectedApi)) {
        if (isProtectedApi) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        return false;
      }
      return true;
    },
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "discord" && profile) {
        // `user.id` here is Discord's id; swap in our own row. A thrown
        // DiscordLinkError ends up as /login?error=Callback.
        const p = profile as { id?: string; username?: string; global_name?: string | null };
        const dbUser = await resolveDiscordUser({
          discordId: String(p.id ?? account.providerAccountId),
          globalName: p.global_name,
          username: p.username ?? "student",
          linkUserId: await pendingLinkUserId(),
          sessionUserId: await liveSessionUserId(),
        });
        token.id = dbUser.id;
        token.name = dbUser.username;
        token.role = dbUser.role;
        token.checkedAt = Date.now();
      } else if (user) {
        token.id = user.id;
        token.name = user.name;
        token.role = user.role ?? "user";
        token.checkedAt = Date.now();
      } else if (
        typeof token.id === "string" &&
        Date.now() - (typeof token.checkedAt === "number" ? token.checkedAt : 0) > REVALIDATE_MS
      ) {
        const [row] = await db
          .select({ username: users.username, role: users.role })
          .from(users)
          .where(eq(users.id, token.id))
          .limit(1);
        if (!row) return null; // deleted: session ends
        token.name = row.username;
        token.role = row.role;
        token.checkedAt = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        if (typeof token.name === "string") {
          session.user.name = token.name;
        }
        session.user.role = (token.role as string) ?? "user";
      }
      return session;
    },
  },
  events: {
    async signOut() {
      try {
        (await cookies()).delete(LINK_COOKIE);
      } catch {
        // Not in a request scope; nothing to clear.
      }
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
