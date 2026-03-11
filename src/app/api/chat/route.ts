import { auth } from "@/lib/auth";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { eq, asc, isNull, and } from "drizzle-orm";
import { getSystemPrompt } from "@/lib/prompt";
import { getContext } from "@/lib/knowledge-base";
import { checkUnlockPhrase } from "@/lib/puzzle";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, generateText, tool, stepCountIs } from "ai";
import { z } from "zod";

const MAX_HISTORY = 14;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { message?: unknown; conversationId?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { message, conversationId } = body;

  if (!message || typeof message !== "string") {
    return new Response("Message is required", { status: 400 });
  }

  if (conversationId && (typeof conversationId !== "string" || !UUID_RE.test(conversationId))) {
    return new Response("Invalid conversation ID", { status: 400 });
  }

  const isNewConversation = !conversationId;

  // Get or create conversation
  let convId = conversationId as string | undefined;
  let puzzleState = "initial";

  if (convId) {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId))
      .limit(1);

    if (!conv || conv.userId !== session.user.id) {
      return new Response("Conversation not found", { status: 404 });
    }
    puzzleState = conv.puzzleState;
  } else {
    const [conv] = await db
      .insert(conversations)
      .values({ userId: session.user.id })
      .returning();
    convId = conv.id;

    // Fire-and-forget: generate a title from the opening message via Haiku
    const msgForTitle = message.slice(0, 200);
    void (async () => {
      try {
        const { text } = await generateText({
          model: anthropic(process.env.CLAUDE_MODEL_ID ?? "claude-haiku-4-5-20251001"),
          prompt: `Generate a short title (3–6 words) for a conversation that begins with this message. Reply with only the title, no quotes, no trailing punctuation.\n\nMessage: ${msgForTitle}`,
          maxOutputTokens: 20,
        });
        const title = text.trim().slice(0, 60);
        if (title) {
          await db
            .update(conversations)
            .set({ title })
            .where(and(eq(conversations.id, conv.id), isNull(conversations.title)));
        }
      } catch (err) {
        console.error("Failed to generate conversation title:", err);
      }
    })();
  }

  // Check for unlock phrase
  if (checkUnlockPhrase(message)) {
    puzzleState = "stage_2";
    await db
      .update(conversations)
      .set({ puzzleState: "stage_2", updatedAt: new Date() })
      .where(eq(conversations.id, convId));
  }

  // Save user message
  await db.insert(messages).values({
    conversationId: convId,
    role: "user",
    content: message,
  });

  // Load conversation history
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, convId))
    .orderBy(asc(messages.createdAt));

  // Trim to MAX_HISTORY (most recent messages)
  const trimmedHistory = history.slice(-MAX_HISTORY);

  const historyMessages = trimmedHistory.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const allowRestricted = puzzleState === "stage_2";
  const systemPrompt = getSystemPrompt(session.user.name ?? undefined)
    + (isNewConversation
        ? "\n\n**This is the student's first message of this session. Open your response with a single brief in-character greeting using their name, then address their question. One sentence maximum for the greeting.**"
        : "");

  const modelId =
    process.env.CLAUDE_MODEL_ID || "claude-haiku-4-5-20251001";
  const model = anthropic(modelId);

  const result = streamText({
    model,
    system: systemPrompt,
    messages: historyMessages,
    maxOutputTokens: 1000,
    stopWhen: stepCountIs(4),
    tools: {
      search_knowledge: tool({
        description:
          "Search Fragment's knowledge for information about people, places, lore, and more. ALWAYS use this tool when someone asks about specific people/NPCs by name, locations, religions, organizations, historical events, or any proper nouns.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "The name, term, or topic to search for (e.g., 'Rynel Daetoris', 'Sovereign Host', 'Sharn')"
            ),
        }),
        execute: async ({ query }) => {
          const context = getContext(query, 1500, allowRestricted);
          return (
            context ??
            "No relevant information found in the archives for this query. Try different search terms."
          );
        },
      }),
    },
    onFinish: async ({ text }) => {
      if (text) {
        try {
          await db.insert(messages).values({
            conversationId: convId,
            role: "assistant",
            content: text,
          });
          await db
            .update(conversations)
            .set({ updatedAt: new Date() })
            .where(eq(conversations.id, convId));
        } catch (err) {
          console.error("Failed to persist assistant message:", err);
        }
      }
    },
  });

  return result.toTextStreamResponse({
    headers: {
      "X-Conversation-Id": convId,
    },
  });
}
