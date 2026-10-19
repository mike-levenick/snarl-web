import { auth } from "@/lib/auth";
import { LINK_COOKIE, LINK_TTL_MS, signLinkToken } from "@/lib/link-token";
import { cookies } from "next/headers";

/**
 * Step one of linking Discord to a password account: remember who is asking
 * in a signed, short-lived cookie. The client then starts the Discord sign-in
 * and the JWT callback attaches the Discord id to this user.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const jar = await cookies();
  jar.set(LINK_COOKIE, signLinkToken(session.user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(LINK_TTL_MS / 1000),
  });
  return Response.json({ success: true });
}
