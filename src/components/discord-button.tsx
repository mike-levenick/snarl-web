"use client";

import { signIn } from "next-auth/react";

export function DiscordButton({ label = "Connect with Discord" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => signIn("discord", { callbackUrl: "/chat" })}
      className="w-full flex items-center justify-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white font-mono text-sm py-3 rounded transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a18 18 0 0 1 4.4 2.2 15.2 15.2 0 0 0-15.2 0A18 18 0 0 1 8.8 3.4L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.6 9.1-.2 13.6.2 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4a12.9 12.9 0 0 1-2 1l1.3 2a19.9 19.9 0 0 0 6-3c.5-5.2-.8-9.7-3.7-13.7ZM8.5 15.4c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" />
      </svg>
      {label}
    </button>
  );
}
