"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface User {
  id: string;
  username: string;
  characterName: string | null;
  role: string;
  approved: boolean;
  createdAt: string;
  conversationCount: number;
  discord: boolean;
}

type Editing =
  | { kind: "password"; userId: string }
  | { kind: "name"; userId: string; admit: boolean }
  | null;

const shown = (u: { username: string; characterName: string | null }) =>
  u.characterName?.trim() || u.username;

const inputClass =
  "bg-gray-800 text-gray-100 text-sm px-2 py-1 rounded outline-none w-40 border border-gray-700 focus:border-gray-600";

export default function AdminPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [value, setValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      setUsers(await res.json());
    } else {
      setError("Failed to load users");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Fetch-on-mount; the loading flag flips before the await by design.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers();
  }, [loadUsers]);

  const clearMessages = () => {
    setActionError(null);
    setActionSuccess(null);
  };

  const stopEditing = () => {
    setEditing(null);
    setValue("");
  };

  const patch = async (userId: string, body: Record<string, unknown>, success: string) => {
    clearMessages();
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setActionSuccess(success);
      stopEditing();
      await loadUsers();
      return true;
    }
    const data = await res.json().catch(() => ({}));
    setActionError(data.error ?? "Request failed");
    return false;
  };

  const submitEdit = (user: User) => {
    if (!editing) return;
    if (editing.kind === "password") {
      if (value.length < 6) {
        setActionError("Password must be at least 6 characters");
        return;
      }
      patch(user.id, { newPassword: value }, `Password reset for ${user.username}`);
    } else {
      const name = value.trim();
      if (!name) {
        setActionError("Enter the character's name");
        return;
      }
      patch(
        user.id,
        editing.admit ? { characterName: name, approved: true } : { characterName: name },
        editing.admit ? `Admitted ${user.username} as ${name}` : `${shown(user)} is now ${name}`
      );
    }
  };

  const handleDelete = async (user: User) => {
    clearMessages();
    if (
      !window.confirm(
        `Delete account "${shown(user)}" and all their data? This cannot be undone.`
      )
    )
      return;

    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    if (res.ok) {
      setActionSuccess(`Deleted ${shown(user)}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } else {
      const data = await res.json().catch(() => ({}));
      setActionError(data.error ?? "Failed to delete user");
    }
  };

  const pending = users.filter((u) => !u.approved && u.role !== "admin");
  const admitted = users.filter((u) => u.approved || u.role === "admin");

  const editor = (user: User) => (
    <div className="flex items-center gap-2">
      <input
        type={editing?.kind === "password" ? "password" : "text"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={editing?.kind === "password" ? "New password" : "Character name"}
        maxLength={editing?.kind === "password" ? undefined : 30}
        className={inputClass}
        onKeyDown={(e) => {
          if (e.key === "Enter") submitEdit(user);
          if (e.key === "Escape") stopEditing();
        }}
        autoFocus
      />
      <button onClick={() => submitEdit(user)} className="text-xs text-green-400 hover:text-green-300">
        Save
      </button>
      <button onClick={stopEditing} className="text-xs text-gray-500 hover:text-gray-300">
        Cancel
      </button>
    </div>
  );

  const badge = (text: string, cls: string) => (
    <span className={`ml-2 px-1.5 py-0.5 text-xs rounded ${cls}`}>{text}</span>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-lg font-mono text-gray-300">ADMIN :: User Management</h1>
          <Link
            href="/chat"
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors font-mono"
          >
            &larr; Back to chat
          </Link>
        </div>

        {actionError && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-300 font-mono">
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-800 rounded text-sm text-green-300 font-mono">
            {actionSuccess}
          </div>
        )}

        {loading ? (
          <div className="text-gray-600 font-mono text-sm">Loading...</div>
        ) : error ? (
          <div className="text-red-400 font-mono text-sm">{error}</div>
        ) : (
          <>
            {/* Waiting at the wards */}
            <h2 className="text-sm font-mono text-gray-500 mb-2">
              Waiting at the wards ({pending.length})
            </h2>
            <div className="border border-gray-800 rounded overflow-hidden mb-8">
              {pending.length === 0 ? (
                <div className="px-4 py-3 text-sm font-mono text-gray-600">
                  No one is waiting. New Discord sign-ins appear here.
                </div>
              ) : (
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="bg-gray-900 text-gray-500 text-left">
                      <th className="px-4 py-3">Discord name</th>
                      <th className="px-4 py-3">Arrived</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((user) => (
                      <tr key={user.id} className="border-t border-gray-800 hover:bg-gray-900/50">
                        <td className="px-4 py-3">{user.username}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(user.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {editing?.userId === user.id ? (
                              editor(user)
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    clearMessages();
                                    setValue("");
                                    setEditing({ kind: "name", userId: user.id, admit: true });
                                  }}
                                  className="text-xs text-green-400 hover:text-green-300 transition-colors"
                                >
                                  Admit as...
                                </button>
                                <button
                                  onClick={() => handleDelete(user)}
                                  className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                                >
                                  Turn away
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Admitted */}
            <h2 className="text-sm font-mono text-gray-500 mb-2">Admitted ({admitted.length})</h2>
            <div className="border border-gray-800 rounded overflow-hidden">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="bg-gray-900 text-gray-500 text-left">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Conversations</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admitted.map((user) => (
                    <tr key={user.id} className="border-t border-gray-800 hover:bg-gray-900/50">
                      <td className="px-4 py-3">
                        {shown(user)}
                        {user.characterName && (
                          <span className="ml-2 text-xs text-gray-600">{user.username}</span>
                        )}
                        {user.role === "admin" && badge("admin", "bg-accent-600/20 text-accent-400")}
                        {user.discord && badge("discord", "bg-[#5865F2]/20 text-[#8891f5]")}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{user.conversationCount}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {editing?.userId === user.id ? (
                            editor(user)
                          ) : user.role !== "admin" ? (
                            <>
                              <button
                                onClick={() => {
                                  clearMessages();
                                  setValue(user.characterName ?? "");
                                  setEditing({ kind: "name", userId: user.id, admit: false });
                                }}
                                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                              >
                                Rename
                              </button>
                              {!user.discord && (
                                <button
                                  onClick={() => {
                                    clearMessages();
                                    setValue("");
                                    setEditing({ kind: "password", userId: user.id });
                                  }}
                                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                  Reset password
                                </button>
                              )}
                              <button
                                onClick={() => patch(user.id, { approved: false }, `${shown(user)} sent back to the wards`)}
                                className="text-xs text-gray-500 hover:text-yellow-400 transition-colors"
                              >
                                Revoke
                              </button>
                              <button
                                onClick={() => handleDelete(user)}
                                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
