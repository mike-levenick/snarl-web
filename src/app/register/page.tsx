"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      // Auto-login after registration
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Account created but login failed. Please try logging in.");
        setLoading(false);
      } else {
        router.push("/chat");
      }
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 font-mono">
          <div className="text-2xl text-gray-400 mb-2">&#x2A2F; &#x2A2F; &#x2A2F;</div>
          <h1 className="text-xl text-gray-200">Project SNARL</h1>
          <p className="text-sm text-gray-600 mt-1">
            Create your identity
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
              placeholder="Choose a username"
              required
              minLength={2}
              maxLength={30}
              className="w-full bg-gray-900 border border-gray-800 rounded px-4 py-3 text-gray-100 font-mono text-sm placeholder:text-gray-700 focus:outline-none focus:border-accent-600 transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Choose a password"
              required
              minLength={6}
              className="w-full bg-gray-900 border border-gray-800 rounded px-4 py-3 text-gray-100 font-mono text-sm placeholder:text-gray-700 focus:outline-none focus:border-accent-600 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white font-mono text-sm py-3 rounded transition-colors"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-gray-600 text-sm font-mono mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-accent-400 hover:text-accent-300">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
