import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Chat from "@/components/chat";

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [row] = await db
    .select({ discordId: users.discordId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return (
    <Chat
      username={session.user.name ?? null}
      role={session.user.role ?? "user"}
      discordLinked={!!row?.discordId}
    />
  );
}
