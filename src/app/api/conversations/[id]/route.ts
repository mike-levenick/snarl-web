import { auth } from "@/lib/auth";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { eq } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new Response("Invalid conversation ID", { status: 400 });
  }

  let body: { title?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { title } = body;
  if (!title || typeof title !== "string" || title.trim().length === 0 || title.trim().length > 60) {
    return new Response("Title must be 1–60 characters", { status: 400 });
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  if (!conv || conv.userId !== session.user.id) {
    return new Response("Not found", { status: 404 });
  }

  await db
    .update(conversations)
    .set({ title: title.trim(), updatedAt: new Date() })
    .where(eq(conversations.id, id));

  return Response.json({ success: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new Response("Invalid conversation ID", { status: 400 });
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  if (!conv || conv.userId !== session.user.id) {
    return new Response("Not found", { status: 404 });
  }

  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));

  return Response.json({ success: true });
}
