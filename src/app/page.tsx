import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/chat");

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center font-mono">
        <div className="text-4xl text-gray-400 mb-4">&#x2A2F; &#x2A2F; &#x2A2F;</div>
        <h1 className="text-3xl text-gray-100 mb-2">Project SNARL</h1>
        <p className="text-gray-500 mb-8 max-w-md">
          A snarl in the Weave. A presence in the Bibliotheca.
          Connect to Fragment and seek what you will.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 bg-accent-600 hover:bg-accent-700 text-white rounded text-sm transition-colors"
          >
            Connect
          </Link>
          <Link
            href="/register"
            className="px-6 py-3 border border-gray-700 hover:border-gray-500 text-gray-300 rounded text-sm transition-colors"
          >
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
