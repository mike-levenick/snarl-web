import { auth } from "@/lib/auth";
import { db } from "@/db";
import { conversations, messages, users } from "@/db/schema";
import { eq, asc, isNull, and, count } from "drizzle-orm";
import { connectedPlayerNote, getSystemPrompt } from "@/lib/prompt";
import { getContext } from "@/lib/knowledge-base";
import { shapeHistory } from "@/lib/history";
import { displayName, isAdmitted } from "@/lib/approval";
import { getModelConfig, TITLE_MODEL_ID } from "@/lib/model-config";
import {
  LINE_TOO_LONG,
  LINE_UNADMITTED,
  MAX_INPUT_CHARS,
  logError,
  runTurn,
} from "@/lib/llm";
import { anthropic } from "@ai-sdk/anthropic";
import { createTextStreamResponse, generateText } from "ai";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Admission and the character name come from the row, not the token, so an
  // admin's "Admit"/rename applies on the player's very next message.
  const [account] = await db
    .select({
      username: users.username,
      characterName: users.characterName,
      role: users.role,
      approved: users.approved,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!account) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isAdmitted(account)) {
    return jsonError(403, LINE_UNADMITTED);
  }

  let body: { message?: unknown; conversationId?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const { message, conversationId } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return jsonError(400, "Message is required");
  }
  if (message.length > MAX_INPUT_CHARS) {
    return jsonError(400, LINE_TOO_LONG);
  }

  if (conversationId && (typeof conversationId !== "string" || !UUID_RE.test(conversationId))) {
    return jsonError(400, "Invalid conversation ID");
  }

  const isNewConversation = !conversationId;
  const userName = displayName(account);
  let priorSessionCount = 0;

  // Get or create conversation
  let convId = conversationId as string | undefined;

  if (convId) {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId))
      .limit(1);

    if (!conv || conv.userId !== session.user.id) {
      return new Response("Conversation not found", { status: 404 });
    }
  } else {
    // Only count prior sessions when we have a username for the greeting
    if (userName) {
      const [{ value: existingCount }] = await db
        .select({ value: count() })
        .from(conversations)
        .where(eq(conversations.userId, session.user.id));
      priorSessionCount = existingCount;
    }

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
          model: anthropic(TITLE_MODEL_ID),
          prompt: `Generate a short title (3–6 words) for a conversation that begins with this message. Reply with only the title, no quotes, no trailing punctuation.\n\nMessage: ${msgForTitle}`,
          maxOutputTokens: 200,
          providerOptions: {
            anthropic: { effort: "low", thinking: { type: "disabled" } },
          },
        });
        const title = text.trim().slice(0, 60);
        if (title) {
          await db
            .update(conversations)
            .set({ title })
            .where(and(eq(conversations.id, conv.id), isNull(conversations.title)));
        }
      } catch (err) {
        logError("title_error", err);
      }
    })();
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

  const historyMessages = shapeHistory(
    history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
  );

  // Volatile instructions go in separate system messages after the cached
  // prompt so the cache prefix stays byte-stable across turns.
  const extraInstructions: string[] = [];
  const playerNote = connectedPlayerNote(userName);
  if (playerNote) extraInstructions.push(playerNote);
  if (isNewConversation && userName) {
    if (priorSessionCount === 0) {
      extraInstructions.push("This player has never reached you before. Open with one brief in-character sentence acknowledging them by name as a newcomer, in whatever mood takes you, then answer.");
    } else if (priorSessionCount <= 3) {
      extraInstructions.push("This player has reached you a few times before. Open with one brief in-character sentence acknowledging them by name as someone you have seen before, then answer.");
    } else {
      extraInstructions.push(`This player keeps coming back; this is visit ${priorSessionCount + 1}. Open with one brief in-character sentence using their name that shows you know them by now, then answer.`);
    }
  }

  const { modelId, effort, debug } = getModelConfig();
  const conversationIdForTurn = convId;

  const stream = runTurn(
    {
      model: anthropic(modelId),
      effort,
      systemPrompt: getSystemPrompt(),
      extraInstructions,
      history: historyMessages,
      // Unbound: the restricted archive is always open to Fragment.
      search: (query) => getContext(query, 1500, true),
      debug,
      abortSignal: req.signal,
    },
    {
      // Runs before the response stream closes, so the write completes
      // before the function is allowed to end. A failed turn leaves no
      // assistant row.
      onDone: async ({ storedText, outcome }) => {
        if (debug) console.log("llm_turn", JSON.stringify({ outcome, model: modelId, effort }));
        if (storedText === null) return;
        try {
          await db.insert(messages).values({
            conversationId: conversationIdForTurn,
            role: "assistant",
            content: storedText,
          });
          await db
            .update(conversations)
            .set({ updatedAt: new Date() })
            .where(eq(conversations.id, conversationIdForTurn));
        } catch (err) {
          logError("persist_error", err);
        }
      },
    }
  );

  return createTextStreamResponse({
    stream,
    headers: {
      "X-Conversation-Id": convId,
    },
  });
}
