"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
              className="w-full bg-gray-900 border border-gray-800 rounded px-4 py-3 text-gray-100 font-mono text-sm placeholder:text-gray-700 focus:outline-none focus:border-indigo-600 transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full bg-gray-900 border border-gray-800 rounded px-4 py-3 text-gray-100 font-mono text-sm placeholder:text-gray-700 focus:outline-none focus:border-indigo-600 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-mono text-sm py-3 rounded transition-colors"
          >
            {loading ? "Connecting..." : "Connect"}
          </button>
        </form>

        <p className="text-center text-gray-600 text-sm font-mono mt-6">
          No account?{" "}
          <Link href="/register" className="text-indigo-400 hover:text-indigo-300">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
