"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";
import { Markdown } from "./markdown";

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string | null;
  puzzleState: string;
  createdAt: string;
  updatedAt: string;
}

export default function Chat({ username }: { username: string | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const cancelRenameRef = useRef(false);
  const titlePollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (titlePollRef.current) clearTimeout(titlePollRef.current);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const data = await res.json();
      setConversations(data);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const loadConversation = async (id: string) => {
    const res = await fetch(`/api/conversations/${id}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(
        data.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      );
      setConversationId(id);
      setSidebarOpen(false);
    }
  };

  const newConversation = () => {
    setMessages([]);
    setConversationId(null);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    cancelRenameRef.current = false;
    setRenamingId(conv.id);
    setRenameValue(conv.title ?? "");
  };

  const commitRename = async (id: string) => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      setRenamingId(null);
      return;
    }
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed || trimmed.length > 60) return;

    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });

    if (res.ok) {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c))
      );
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Blur the input — onBlur → commitRename fires once
      renameInputRef.current?.blur();
    } else if (e.key === "Escape") {
      cancelRenameRef.current = true;
      renameInputRef.current?.blur();
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this session? This cannot be undone.")) return;

    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        setMessages([]);
        setConversationId(null);
      }
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
        }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      // Capture conversation ID from header
      const newConvId = res.headers.get("X-Conversation-Id");
      if (newConvId && !conversationId) {
        setConversationId(newConvId);
      }

      // Stream the response
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setStreamingContent(fullText);
      }

      if (fullText) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: fullText },
        ]);
      }
      setStreamingContent("");
      loadConversations();
      // If this was a new conversation, Haiku title generation may still be in
      // flight — poll once more after a short delay to pick it up
      if (!conversationId) {
        titlePollRef.current = setTimeout(() => loadConversations(), 3000);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setError(
        "The magical energies surge with overwhelming power... The ancient network is strained. Wait a moment and speak again."
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-40 w-72 bg-gray-900 border-r border-gray-800 transition-transform lg:translate-x-0 lg:static lg:block`}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-800">
            <button
              onClick={newConversation}
              className="w-full py-2 px-4 bg-accent-600 hover:bg-accent-700 rounded text-sm font-medium transition-colors"
            >
              New Session
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group relative flex items-center rounded mb-1 transition-colors ${
                  conversationId === conv.id
                    ? "bg-gray-800"
                    : "hover:bg-gray-800/50"
                }`}
              >
                {renamingId === conv.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => handleRenameKeyDown(e, conv.id)}
                    onBlur={() => commitRename(conv.id)}
                    className="flex-1 bg-gray-700 text-gray-100 text-sm px-3 py-2 rounded outline-none min-w-0"
                    maxLength={60}
                  />
                ) : (
                  <>
                    <button
                      onClick={() => loadConversation(conv.id)}
                      className="flex-1 text-left p-3 text-sm min-w-0"
                    >
                      <div className={`truncate ${conversationId === conv.id ? "text-white" : "text-gray-400"}`}>
                        {conv.title ?? "New Session"}
                      </div>
                      <div className={`text-xs mt-1 ${conv.puzzleState === "stage_2" ? "text-accent-400" : "text-gray-500"}`}>
                        {conv.puzzleState === "stage_2" ? "Guardrails lifted" : "Guardrails active"}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => startRename(conv, e)}
                        title="Rename"
                        className="text-gray-500 hover:text-gray-200 p-1 rounded"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => deleteConversation(conv.id, e)}
                        title="Delete"
                        className="text-gray-500 hover:text-red-400 p-1 rounded"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-gray-800">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full py-2 px-4 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors text-left"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/50">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <div className="font-mono text-sm text-gray-400">
            FRAGMENT :: Bibliotheca Draconis
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.length === 0 && !streamingContent && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-600 font-mono">
                <div className="text-2xl mb-2">&#x2A2F; &#x2A2F; &#x2A2F;</div>
                <div>CONNECTION ESTABLISHED</div>
                {username?.trim() && <div className="mt-2">Welcome, {username.trim()}.</div>}
                <div className="text-sm mt-2">Type a message to begin.</div>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className="font-mono text-sm leading-relaxed">
              {msg.role === "user" ? (
                <div className="text-gray-400">
                  <span className="text-gray-600">&gt; </span>
                  {msg.content}
                </div>
              ) : (
                <div className="text-accent-300">
                  <Markdown
                    content={msg.content}
                    prefix={<span className="text-accent-500 font-bold">FRAGMENT: </span>}
                  />
                </div>
              )}
            </div>
          ))}
          {streamingContent && (
            <div className="font-mono text-sm leading-relaxed text-accent-300">
              <Markdown
                content={streamingContent}
                prefix={<span className="text-accent-500 font-bold">FRAGMENT: </span>}
              />
              <span className="animate-pulse">&#x2588;</span>
            </div>
          )}
          {error && (
            <div className="font-mono text-sm leading-relaxed text-red-400 whitespace-pre-wrap">
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-800 px-4 py-3 bg-gray-900/50">
          <div className="flex items-center gap-2 font-mono">
            <span className="text-gray-600">&gt;</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isLoading ? "Awaiting response..." : "Speak to Fragment..."}
              disabled={isLoading}
              className="flex-1 bg-transparent text-gray-100 text-sm outline-none placeholder:text-gray-700 disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="text-gray-600 hover:text-accent-400 disabled:opacity-30 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
