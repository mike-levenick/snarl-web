import { requireAdmin } from "@/lib/admin";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin();
  if (result.error) return result.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid user ID" }, { status: 400 });
  }

  let body: { newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { newPassword } = body;
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    return Response.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (user.role === "admin" && user.id !== result.session.user.id) {
    return Response.json(
      { error: "Cannot reset another admin's password" },
      { status: 403 }
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));

  return Response.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin();
  if (result.error) return result.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (user.role === "admin") {
    return Response.json(
      { error: "Cannot delete admin accounts" },
      { status: 403 }
    );
  }

  // Conversations and messages cascade-delete via FK onDelete
  await db.delete(users).where(eq(users.id, id));

  return Response.json({ success: true });
}
