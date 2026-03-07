import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Chat from "@/components/chat";

export default async function ChatPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return <Chat />;
}
