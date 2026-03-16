import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Chat from "@/components/chat";

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return <Chat username={session.user.name ?? null} role={session.user.role ?? "user"} />;
}
