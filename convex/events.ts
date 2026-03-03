/**
 * Event mutations — interactive mode only.
 *
 * Events are an immutable, append-only log of user interactions.
 * Each event drives the Director's worldState update + next panel batch.
 *
 * Usage examples:
 *
 *   // User clicks "Trust the wizard":
 *   const id = await logEvent({
 *     sessionId,
 *     type: "choice",
 *     payload: { choiceId: "a", choiceLabel: "Trust the wizard" },
 *   });
 *
 *   // Voice conversation completes:
 *   await logEvent({
 *     sessionId,
 *     type: "voice",
 *     payload: { characterId: "wizard", transcript: "Can you help me?", npcReply: "Of course." },
 *   });
 *
 *   // Player walks to a hotspot on the 2D map:
 *   await logEvent({
 *     sessionId,
 *     type: "hotspot",
 *     payload: { hotspotId: "ancient_door", hotspotLabel: "Ancient Door" },
 *   });
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * logEvent — append a user interaction to the session's event log.
 *
 * payload is stored as-is; runtime shape validation is handled by the
 * orchestration layer via zod, not here.
 *
 * Returns the new event's document ID.
 */
export const logEvent = mutation({
  args: {
    sessionId: v.id("sessions"),
    type: v.union(
      v.literal("choice"),
      v.literal("voice"),
      v.literal("hotspot"),
    ),
    payload: v.any(),
  },
  handler: async (ctx, { sessionId, type, payload }) => {
    return await ctx.db.insert("events", {
      sessionId,
      type,
      payload,
      createdAt: Date.now(),
    });
  },
});

/**
 * listEvents — return all events for a session in chronological order.
 *
 * Useful for replaying / auditing the interactive session.
 *
 * Example:
 *   const events = useQuery(api.events.listEvents, { sessionId });
 */
export const listEvents = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const rows = await ctx.db
      .query("events")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("asc")
      .collect();
    return rows;
  },
});
