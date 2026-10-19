import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Chat from "@/components/chat";
import Waiting from "@/components/waiting";
import { displayName, isAdmitted } from "@/lib/approval";

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [row] = await db
    .select({
      username: users.username,
      characterName: users.characterName,
      role: users.role,
      approved: users.approved,
      discordId: users.discordId,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  // Deleted while signed in: the token is invalidated on its next re-check.
  if (!row) redirect("/login");

  // Read from the row, not the token, so an admin's "Admit" (and the new
  // character name) takes effect on the player's next refresh.
  if (!isAdmitted(row)) return <Waiting username={row.username} />;

  return (
    <Chat
      username={displayName(row)}
      role={row.role}
      discordLinked={!!row.discordId}
    />
  );
}
