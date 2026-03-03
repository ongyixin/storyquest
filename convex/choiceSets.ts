/**
 * Choice-set mutations — interactive mode only.
 *
 * A choice set represents the two branch choices shown to the reader after the
 * current panel batch.  Each generation cycle writes a new row; the active set
 * is always the most-recent *unconsumed* row for the session.
 *
 * This module provides a clean public API (`setChoiceSet`) that mirrors the
 * spec contract. Sessions.ts also exposes `addChoiceSet` for internal pipeline use.
 *
 * Usage examples:
 *
 *   // After initial 6 panels are generated:
 *   await setChoiceSet({
 *     sessionId,
 *     choiceSet: {
 *       anchorPanelIndex: 5,
 *       options: [
 *         { id: "a", label: "Trust the wizard", consequenceHint: "gains ally" },
 *         { id: "b", label: "Sneak past the guard", consequenceHint: "unlocks shortcut" },
 *       ],
 *     },
 *   });
 *
 *   // After appending 2 more panels following a choice event:
 *   await setChoiceSet({
 *     sessionId,
 *     choiceSet: { anchorPanelIndex: 7, options: [...] },
 *   });
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const choiceOptionValidator = v.object({
  id: v.string(),
  label: v.string(),
  consequenceHint: v.string(),
});

// ─────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────

/**
 * getActiveChoiceSet — return the current (unconsumed) choice set, or null.
 *
 * Example:
 *   const choices = useQuery(api.choiceSets.getActiveChoiceSet, { sessionId });
 */
export const getActiveChoiceSet = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const row = await ctx.db
      .query("choices")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .filter((q) => q.eq(q.field("consumed"), false))
      .first();

    if (!row) return null;
    return {
      anchorPanelIndex: row.panelIndexAnchor,
      options: row.options,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

/**
 * setChoiceSet — write the latest choice set for an interactive session.
 *
 * Inserts a new row; old rows are retained for audit purposes.
 * The active choice set is always the most-recent unconsumed row,
 * as resolved by getSession / getActiveChoiceSet.
 *
 * Validates:
 * - anchorPanelIndex >= 0
 * - at least 2 options with non-empty id and label
 */
export const setChoiceSet = mutation({
  args: {
    sessionId: v.id("sessions"),
    choiceSet: v.object({
      anchorPanelIndex: v.number(),
      options: v.array(choiceOptionValidator),
    }),
  },
  handler: async (ctx, { sessionId, choiceSet }) => {
    const { anchorPanelIndex, options } = choiceSet;

    if (anchorPanelIndex < 0) throw new Error("anchorPanelIndex must be >= 0");
    if (options.length < 2) throw new Error("choiceSet must have at least 2 options");
    for (const opt of options) {
      if (!opt.id.trim()) throw new Error("choice option id must not be empty");
      if (!opt.label.trim()) throw new Error("choice option label must not be empty");
    }

    await ctx.db.insert("choices", {
      sessionId,
      panelIndexAnchor: anchorPanelIndex,
      options,
      consumed: false,
      createdAt: Date.now(),
    });

    return null;
  },
});
