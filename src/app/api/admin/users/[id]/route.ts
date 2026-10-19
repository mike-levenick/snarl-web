import { requireAdmin } from "@/lib/admin";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { validateCharacterName } from "@/lib/approval";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Edit one account. Body may carry any of:
 *   newPassword  - reset a password (not another admin's)
 *   characterName - the name Fragment is told (non-admin accounts); login name untouched
 *   approved     - admit (true) or un-admit (false) a non-admin account
 */
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

  let body: { newPassword?: unknown; characterName?: unknown; approved?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const patch: Partial<typeof users.$inferInsert> = {};

  if (body.newPassword !== undefined) {
    const { newPassword } = body;
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return Response.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }
    if (user.role === "admin" && user.id !== result.session.user.id) {
      return Response.json(
        { error: "Cannot reset another admin's password" },
        { status: 403 }
      );
    }
    patch.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  if (body.characterName !== undefined) {
    if (user.role === "admin") {
      return Response.json({ error: "Admin accounts keep their seeded names" }, { status: 403 });
    }
    const v = validateCharacterName(body.characterName);
    if (v.error) return Response.json({ error: v.error }, { status: 400 });
    patch.characterName = v.name;
  }

  if (body.approved !== undefined) {
    if (typeof body.approved !== "boolean") {
      return Response.json({ error: "approved must be true or false" }, { status: 400 });
    }
    if (user.role === "admin") {
      return Response.json({ error: "Admins are always admitted" }, { status: 403 });
    }
    patch.approved = body.approved;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to change" }, { status: 400 });
  }

  await db.update(users).set(patch).where(eq(users.id, id));

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
