/**
 * Panel queries and mutations.
 *
 * panelIndex is always monotonically increasing within a session.
 * insertPanels auto-assigns the next monotonic index so callers cannot
 * accidentally create gaps or duplicates.
 *
 * Usage examples:
 *
 *   // Subscribe to all panels in realtime:
 *   const panels = useQuery(api.panels.listPanels, { sessionId });
 *
 *   // Bulk-insert the initial 6 panels (indices auto-assigned):
 *   const indices = await insertPanels({ sessionId, panels: [...] });
 *
 *   // Append 1–2 panels after a choice/voice event:
 *   await insertPanels({ sessionId, panels: [newPanel] });
 *
 *   // Update imageUrl once image gen completes for panel 3:
 *   await setPanelImageUrl({ sessionId, panelIndex: 3, imageUrl: "https://…" });
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const panelScriptValidator = v.object({
  scene: v.string(),
  dialogue: v.array(
    v.object({
      speaker: v.string(),
      text: v.string(),
    }),
  ),
  camera: v.string(),
});

// ─────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────

/**
 * listPanels — return all panels for a session sorted by panelIndex.
 *
 * Subscribe for live updates as panels are generated:
 *   const panels = useQuery(api.panels.listPanels, { sessionId });
 */
export const listPanels = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const rows = await ctx.db
      .query("panels")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    return rows
      .sort((a, b) => a.panelIndex - b.panelIndex)
      .map((p) => ({
        panelIndex: p.panelIndex,
        pageNumber: p.pageNumber,
        script: p.script,
        imagePrompt: p.imagePrompt,
        imageUrl: p.imageUrl,
      }));
  },
});

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

/**
 * insertPanels — bulk-insert panels with monotonic panelIndex auto-assignment.
 *
 * The caller provides panels WITHOUT panelIndex; the mutation reads the current
 * maximum and assigns the next available indices, preventing gaps and duplicates
 * even when called concurrently.
 *
 * Returns the list of assigned panelIndex values in order.
 *
 * Example — initial 6 panels:
 *   const indices = await insertPanels({
 *     sessionId,
 *     panels: scripts.map((s, i) => ({
 *       pageNumber: 1,
 *       script: s,
 *       imagePrompt: prompts[i],
 *       imageUrl: null,
 *     })),
 *   });
 *   // indices === [0, 1, 2, 3, 4, 5]
 *
 * Example — appending 2 panels after a choice event:
 *   await insertPanels({
 *     sessionId,
 *     panels: [panel7, panel8],
 *   });
 */
export const insertPanels = mutation({
  args: {
    sessionId: v.id("sessions"),
    panels: v.array(
      v.object({
        pageNumber: v.number(),
        script: panelScriptValidator,
        imagePrompt: v.string(),
        imageUrl: v.union(v.string(), v.null()),
      }),
    ),
  },
  handler: async (ctx, { sessionId, panels }) => {
    if (panels.length === 0) return [];

    const existing = await ctx.db
      .query("panels")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    const nextIndex =
      existing.length === 0
        ? 0
        : Math.max(...existing.map((p) => p.panelIndex)) + 1;

    const now = Date.now();
    const assignedIndices: number[] = [];

    for (let i = 0; i < panels.length; i++) {
      const panelIndex = nextIndex + i;
      await ctx.db.insert("panels", {
        sessionId,
        panelIndex,
        pageNumber: panels[i].pageNumber,
        script: panels[i].script,
        imagePrompt: panels[i].imagePrompt,
        imageUrl: panels[i].imageUrl,
        createdAt: now + i, // distinct createdAt within the batch
      });
      assignedIndices.push(panelIndex);
    }

    return assignedIndices;
  },
});

/**
 * setPanelImageUrl — patch the imageUrl for a specific panel after image generation.
 *
 * The panel row already exists with imageUrl=null from insertPanels.
 * Call this once the image model returns a URL (or a Convex storage URL).
 *
 * Example:
 *   await setPanelImageUrl({ sessionId, panelIndex: 0, imageUrl: "https://…" });
 */
export const setPanelImageUrl = mutation({
  args: {
    sessionId: v.id("sessions"),
    panelIndex: v.number(),
    imageUrl: v.string(),
  },
  handler: async (ctx, { sessionId, panelIndex, imageUrl }) => {
    const row = await ctx.db
      .query("panels")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("panelIndex"), panelIndex))
      .unique();

    if (!row) {
      throw new Error(
        `Panel not found: sessionId=${sessionId} panelIndex=${panelIndex}`,
      );
    }

    await ctx.db.patch(row._id, { imageUrl });
    return null;
  },
});
