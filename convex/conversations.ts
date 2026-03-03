/**
 * Conversation queries and mutations — interactive mode only.
 *
 * Each (session, characterId) pair has at most one conversation row.
 * Turns are appended to the existing row; the row is created on first turn.
 *
 * Usage examples:
 *
 *   // Fetch conversation history for a character (subscribe for live updates):
 *   const turns = useQuery(api.conversations.getConversation, { sessionId, characterId: "wizard" });
 *
 *   // Append a single turn (e.g. after Speechmatics transcription):
 *   const count = await appendConversationTurn({
 *     sessionId,
 *     characterId: "wizard",
 *     turn: { role: "user", text: "Can you help me?", ts: Date.now() },
 *   });
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const conversationTurnValidator = v.object({
  role: v.union(v.literal("user"), v.literal("npc")),
  text: v.string(),
  ts: v.number(),
});

// ─────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────

/**
 * getConversation — return the full turn history for a (session, character) pair.
 *
 * Returns null if no conversation exists yet.
 *
 * Example:
 *   const turns = useQuery(api.conversations.getConversation, {
 *     sessionId,
 *     characterId: "wizard",
 *   });
 */
export const getConversation = query({
  args: {
    sessionId: v.id("sessions"),
    characterId: v.string(),
  },
  handler: async (ctx, { sessionId, characterId }) => {
    const row = await ctx.db
      .query("conversations")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("characterId"), characterId))
      .unique();

    return row ? row.turns : null;
  },
});

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

/**
 * appendConversationTurn — append a single turn to a character's conversation.
 *
 * Upserts: creates the conversation row if it doesn't exist yet.
 * Returns the total number of turns after the append.
 *
 * Example:
 *   const totalTurns = await appendConversationTurn({
 *     sessionId,
 *     characterId: "wizard",
 *     turn: { role: "user", text: "Hello!", ts: Date.now() },
 *   });
 */
export const appendConversationTurn = mutation({
  args: {
    sessionId: v.id("sessions"),
    characterId: v.string(),
    turn: conversationTurnValidator,
  },
  handler: async (ctx, { sessionId, characterId, turn }) => {
    if (!characterId.trim()) throw new Error("characterId must not be empty");
    if (!turn.text.trim()) throw new Error("turn text must not be empty");

    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("characterId"), characterId))
      .unique();

    if (existing) {
      const updated = [...existing.turns, turn];
      await ctx.db.patch(existing._id, { turns: updated });
      return updated.length;
    }

    await ctx.db.insert("conversations", {
      sessionId,
      characterId,
      turns: [turn],
    });
    return 1;
  },
});
