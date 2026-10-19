import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  // Null for accounts created through Discord sign-in.
  passwordHash: text("password_hash"),
  // Discord snowflake, set by Discord sign-in or by linking an existing account.
  discordId: text("discord_id").unique(),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  // Set by an admin in /admin ("Admit"). Admins count as admitted regardless.
  approved: boolean("approved").default(false).notNull(),
  // What Fragment calls them; set by an admin on admission. `username` stays
  // the login key for password accounts and is never shown to the model once
  // this is set.
  characterName: text("character_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  puzzleState: text("puzzle_state").default("initial").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
