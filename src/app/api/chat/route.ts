import { auth } from "@/lib/auth";
import { db } from "@/db";
import { conversations, messages, users } from "@/db/schema";
import { eq, asc, isNull, and, count } from "drizzle-orm";
import { getSystemPrompt } from "@/lib/prompt";
import { getContext } from "@/lib/knowledge-base";
import { checkUnlockPhrase } from "@/lib/puzzle";
import { shapeHistory } from "@/lib/history";
import { displayName, isAdmitted } from "@/lib/approval";
import { getModelConfig, TITLE_MODEL_ID } from "@/lib/model-config";
import {
  LINE_TOO_LONG,
  LINE_UNADMITTED,
  MAX_INPUT_CHARS,
  STAGE_2_NOTE,
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

  const stage2 = puzzleState === "stage_2";
  const historyMessages = shapeHistory(
    history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    stage2
  );

  // Volatile instructions go in separate system messages after the cached
  // prompt so the cache prefix stays byte-stable across turns.
  const extraInstructions: string[] = [];
  if (stage2) extraInstructions.push(STAGE_2_NOTE);
  if (isNewConversation && userName) {
    if (priorSessionCount === 0) {
      extraInstructions.push("This is the student's very first session ever — they are a newcomer. Open your response with a single brief in-character greeting welcoming them by name as a new visitor to the archives, then address their question. One sentence maximum for the greeting.");
    } else if (priorSessionCount <= 3) {
      extraInstructions.push("This student has visited a few times before. Open your response with a single brief in-character welcome back using their name, then address their question. One sentence maximum for the greeting.");
    } else {
      extraInstructions.push(`This student is a regular — this is session #${priorSessionCount + 1}. Open your response with a single brief in-character greeting using their name that acknowledges their familiarity with the archives, then address their question. One sentence maximum for the greeting.`);
    }
  }

  const { modelId, effort, debug } = getModelConfig();
  const conversationIdForTurn = convId;

  const stream = runTurn(
    {
      model: anthropic(modelId),
      effort,
      systemPrompt: getSystemPrompt(userName),
      extraInstructions,
      history: historyMessages,
      search: (query) => getContext(query, 1500, stage2),
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
