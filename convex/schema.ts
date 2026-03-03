import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * StoryQuest — Convex schema.
 *
 * Field names and table names here must stay in sync with:
 *   convex/_generated/dataModel.ts   (canonical TypeScript types)
 *   src/lib/server/generate.ts        (bridge layer — defines ConvexPanel etc.)
 *
 * Complex nested objects (storyBible, styleGuide, characterSheets, worldState)
 * use v.any() so the bridge layer can store agent-facing shapes without a
 * rigid validator mismatch.  Structure is documented in src/lib/shared/types.ts.
 */

// Re-used sub-validators
const dialogueLine = v.object({
  speaker: v.string(),
  text: v.string(),
});

const panelScript = v.object({
  scene: v.string(),
  dialogue: v.array(dialogueLine),
  camera: v.string(),
});

const choiceOption = v.object({
  id: v.string(),
  label: v.string(),
  consequenceHint: v.string(),
});

const conversationTurn = v.object({
  role: v.union(v.literal("user"), v.literal("npc")),
  text: v.string(),
  ts: v.number(),
});

export default defineSchema({
  /**
   * sessions
   * One row per story generation session (normal or interactive).
   *
   * Example:
   *   const id = await ctx.db.insert("sessions", {
   *     premise: "A knight finds a talking sword",
   *     vibe: "fantasy",
   *     mode: "normal",
   *     status: "creating",
   *     progress: { stage: "init", detail: "Starting…" },
   *     storyBible: null,
   *     styleGuide: null,
   *     characterSheets: [],
   *     worldState: null,
   *     createdAt: Date.now(),
   *   });
   */
  sessions: defineTable({
    premise: v.string(),
    vibe: v.string(),
    mode: v.union(v.literal("normal"), v.literal("interactive")),
    status: v.union(
      v.literal("creating"),
      v.literal("ready"),
      v.literal("error"),
    ),
    progress: v.object({ stage: v.string(), detail: v.string() }),
    /**
     * Stored as-is from the bridge layer (ConvexStoryBible shape).
     * See src/lib/server/generate.ts → ConvexStoryBible.
     */
    storyBible: v.union(v.any(), v.null()),
    /** See src/lib/server/generate.ts → ConvexStyleGuide. */
    styleGuide: v.union(v.any(), v.null()),
    /** Array of character objects (id, name, appearance, …). */
    characterSheets: v.array(v.any()),
    /**
     * See src/lib/server/generate.ts → ConvexWorldState.
     * Shape: { location, inventory, flags, conversationLog }
     * Null until Director completes.
     */
    worldState: v.union(v.any(), v.null()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  /**
   * panels
   * One row per generated comic panel.
   * panelIndex is monotonically increasing within a session.
   *
   * Example:
   *   await ctx.db.insert("panels", {
   *     sessionId,
   *     panelIndex: 0,
   *     pageNumber: 1,
   *     script: { scene: "…", dialogue: [], camera: "wide" },
   *     imagePrompt: "…",
   *     imageUrl: null,   // filled by setPanelImageUrl once image gen completes
   *     createdAt: Date.now(),
   *   });
   */
  panels: defineTable({
    sessionId: v.id("sessions"),
    panelIndex: v.number(),
    pageNumber: v.number(),
    script: panelScript,
    imagePrompt: v.string(),
    /** null while image generation is pending; string URL once done. */
    imageUrl: v.union(v.string(), v.null()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_index", ["sessionId", "panelIndex"]),

  /**
   * choices  (interactive-only)
   * Two-option choice sets shown to the reader after a panel batch.
   *
   * consumed=false → currently active choices.
   * consumed=true  → reader already acted on these; historical record.
   *
   * Example:
   *   await ctx.db.insert("choices", {
   *     sessionId,
   *     panelIndexAnchor: 5,
   *     options: [
   *       { id: "a", label: "Trust the wizard", consequenceHint: "gains ally" },
   *       { id: "b", label: "Run away", consequenceHint: "unlocks shortcut" },
   *     ],
   *     consumed: false,
   *     createdAt: Date.now(),
   *   });
   */
  choices: defineTable({
    sessionId: v.id("sessions"),
    /** Index of the last panel when these choices are presented. */
    panelIndexAnchor: v.number(),
    options: v.array(choiceOption),
    /** true once submitChoice has consumed this set. */
    consumed: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_anchor", ["sessionId", "panelIndexAnchor"]),

  /**
   * events  (interactive-only)
   * Immutable append-only log of user interactions.
   *
   * Example:
   *   await ctx.db.insert("events", {
   *     sessionId,
   *     type: "choice",
   *     payload: { choiceId: "a", choiceLabel: "Trust the wizard" },
   *     createdAt: Date.now(),
   *   });
   */
  events: defineTable({
    sessionId: v.id("sessions"),
    type: v.union(
      v.literal("choice"),
      v.literal("voice"),
      v.literal("hotspot"),
    ),
    payload: v.any(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  /**
   * conversations  (interactive-only)
   * Per-character conversation history.  One row per (session, characterId).
   * Turns are appended in place.
   *
   * Example:
   *   await ctx.db.insert("conversations", {
   *     sessionId,
   *     characterId: "wizard",
   *     turns: [{ role: "user", text: "Hello!", ts: Date.now() }],
   *   });
   */
  conversations: defineTable({
    sessionId: v.id("sessions"),
    characterId: v.string(),
    turns: v.array(conversationTurn),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_character", ["sessionId", "characterId"]),
});
