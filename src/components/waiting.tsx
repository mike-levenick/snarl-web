"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

/** Holding page for an account that has not been admitted yet. */
export default function Waiting({ username }: { username: string | null }) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center font-mono">
        <div className="text-2xl text-gray-400 mb-2">&#x2A2F; &#x2A2F; &#x2A2F;</div>
        <h1 className="text-xl text-gray-200 mb-6">Project SNARL</h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          The wards do not know you yet{username ? `, ${username}` : ""}. The Praetor
          must speak your name before the archive will open to you.
        </p>
        <p className="text-gray-600 text-xs mt-4">
          Tell your DM you have connected. Once admitted, this page lets you through.
        </p>
        <div className="flex items-center justify-center gap-4 mt-8 text-sm">
          <button
            onClick={() => router.refresh()}
            className="bg-accent-600 hover:bg-accent-700 text-white px-4 py-2 rounded transition-colors"
          >
            Try the wards again
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
