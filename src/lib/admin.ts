import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

type AdminResult =
  | { error: NextResponse; session?: never }
  | { error?: never; session: Session };

export async function requireAdmin(): Promise<AdminResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (session.user.role !== "admin") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session };
}
