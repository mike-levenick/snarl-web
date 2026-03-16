"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface User {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  conversationCount: number;
}

export default function AdminPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
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
    loadUsers();
  }, [loadUsers]);

  const clearMessages = () => {
    setActionError(null);
    setActionSuccess(null);
  };

  const handleResetPassword = async (userId: string) => {
    clearMessages();
    if (newPassword.length < 6) {
      setActionError("Password must be at least 6 characters");
      return;
    }

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });

    if (res.ok) {
      setActionSuccess("Password reset successfully");
      setResetUserId(null);
      setNewPassword("");
    } else {
      const data = await res.json();
      setActionError(data.error ?? "Failed to reset password");
    }
  };

  const handleDelete = async (userId: string, username: string) => {
    clearMessages();
    if (
      !window.confirm(
        `Delete account "${username}" and all their data? This cannot be undone.`
      )
    )
      return;

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setActionSuccess(`Deleted ${username}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } else {
      const data = await res.json();
      setActionError(data.error ?? "Failed to delete user");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-lg font-mono text-gray-300">
            ADMIN :: User Management
          </h1>
          <Link
            href="/chat"
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors font-mono"
          >
            &larr; Back to chat
          </Link>
        </div>

        {/* Status messages */}
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

        {/* Users table */}
        {loading ? (
          <div className="text-gray-600 font-mono text-sm">Loading...</div>
        ) : error ? (
          <div className="text-red-400 font-mono text-sm">{error}</div>
        ) : (
          <div className="border border-gray-800 rounded overflow-hidden">
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="bg-gray-900 text-gray-500 text-left">
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Conversations</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-gray-800 hover:bg-gray-900/50"
                  >
                    <td className="px-4 py-3">
                      {user.username}
                      {user.role === "admin" && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-accent-600/20 text-accent-400 rounded">
                          admin
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{user.role}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {user.conversationCount}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {resetUserId === user.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="New password"
                              className="bg-gray-800 text-gray-100 text-sm px-2 py-1 rounded outline-none w-36 border border-gray-700 focus:border-gray-600"
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleResetPassword(user.id);
                                if (e.key === "Escape") {
                                  setResetUserId(null);
                                  setNewPassword("");
                                }
                              }}
                              autoFocus
                            />
                            <button
                              onClick={() => handleResetPassword(user.id)}
                              className="text-xs text-green-400 hover:text-green-300"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setResetUserId(null);
                                setNewPassword("");
                              }}
                              className="text-xs text-gray-500 hover:text-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            {user.role !== "admin" && (
                              <>
                                <button
                                  onClick={() => {
                                    clearMessages();
                                    setResetUserId(user.id);
                                  }}
                                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                  Reset password
                                </button>
                                <button
                                  onClick={() =>
                                    handleDelete(user.id, user.username)
                                  }
                                  className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
