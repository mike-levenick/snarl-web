"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  puzzleState: string;
  createdAt: string;
  updatedAt: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");

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
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "The magical energies surge with overwhelming power... The ancient network is strained. Wait a moment and speak again.",
        },
      ]);
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
        } fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 border-r border-gray-800 transition-transform lg:translate-x-0 lg:static lg:block`}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-800">
            <button
              onClick={newConversation}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 rounded text-sm font-medium transition-colors"
            >
              New Session
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full text-left p-3 rounded mb-1 text-sm transition-colors ${
                  conversationId === conv.id
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
                }`}
              >
                <div className="truncate">
                  Session {new Date(conv.createdAt).toLocaleDateString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {conv.puzzleState === "stage_2" ? "Unbound" : "Bound"}
                </div>
              </button>
            ))}
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
                <div className="text-indigo-300 whitespace-pre-wrap">
                  <span className="text-indigo-500 font-bold">FRAGMENT: </span>
                  {msg.content}
                </div>
              )}
            </div>
          ))}
          {streamingContent && (
            <div className="font-mono text-sm leading-relaxed text-indigo-300 whitespace-pre-wrap">
              <span className="text-indigo-500 font-bold">FRAGMENT: </span>
              {streamingContent}
              <span className="animate-pulse">&#x2588;</span>
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
              className="text-gray-600 hover:text-indigo-400 disabled:opacity-30 transition-colors"
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
