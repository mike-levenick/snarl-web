import { requireAdmin } from "@/lib/admin";
import { db } from "@/db";
import { users, conversations } from "@/db/schema";
import { eq, count, isNotNull } from "drizzle-orm";

export async function GET() {
  const result = await requireAdmin();
  if (result.error) return result.error;

  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
      discord: isNotNull(users.discordId),
      conversationCount: count(conversations.id),
    })
    .from(users)
    .leftJoin(conversations, eq(conversations.userId, users.id))
    .groupBy(users.id)
    .orderBy(users.createdAt);

  return Response.json(allUsers);
}
