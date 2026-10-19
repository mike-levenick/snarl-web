"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { DiscordButton } from "@/components/discord-button";

function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const oauthError = useSearchParams().get("error");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid username or password");
      setLoading(false);
    } else {
      router.push("/chat");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 font-mono">
          <div className="text-2xl text-gray-400 mb-2">&#x2A2F; &#x2A2F; &#x2A2F;</div>
          <h1 className="text-xl text-gray-200">Project SNARL</h1>
          <p className="text-sm text-gray-600 mt-1">
            Connect to the Weave
          </p>
        </div>

        <DiscordButton />
        {oauthError && !error && (
          <div className="text-red-400 text-sm font-mono text-center mt-4">
            Discord could not confirm who you are, or that Discord is already bound to another student. Try again, or use a password below.
          </div>
        )}

        <div className="flex items-center gap-3 my-6 text-gray-700 font-mono text-xs">
          <div className="flex-1 border-t border-gray-800" />
          Praetors and old accounts
          <div className="flex-1 border-t border-gray-800" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-red-400 text-sm font-mono text-center">
              {error}
            </div>
          )}
          <div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              required
              className="w-full bg-gray-900 border border-gray-800 rounded px-4 py-3 text-gray-100 font-mono text-sm placeholder:text-gray-700 focus:outline-none focus:border-accent-600 transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full bg-gray-900 border border-gray-800 rounded px-4 py-3 text-gray-100 font-mono text-sm placeholder:text-gray-700 focus:outline-none focus:border-accent-600 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white font-mono text-sm py-3 rounded transition-colors"
          >
            {loading ? "Connecting..." : "Connect"}
          </button>
        </form>

        <p className="text-center text-gray-600 text-xs font-mono mt-6">
          New here? Connect with Discord, then tell your DM so the Praetor can admit you.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
