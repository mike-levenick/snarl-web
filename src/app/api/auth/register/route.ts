import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const RESERVED_USERNAMES = ["thessarian", "marcus", "lyralei", "kess", "velani"];

export async function POST(req: Request) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { username, password } = body;

  if (!username || typeof username !== "string" || !password || typeof password !== "string") {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 }
    );
  }

  if (username.length < 2 || username.length > 30) {
    return NextResponse.json(
      { error: "Username must be 2-30 characters" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
    return NextResponse.json(
      { error: "Username already taken" },
      { status: 409 }
    );
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "Username already taken" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await db.insert(users).values({ username, passwordHash });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "Username already taken" },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ success: true });
}
