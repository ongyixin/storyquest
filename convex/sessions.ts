/**
 * Session queries and mutations.
 *
 * Exports two groups of functions:
 *
 * A) PUBLIC CONTRACT (spec-required names, used by frontend + other agents):
 *    - getSession     — reactive subscription; returns session + panels + choiceSet
 *    - createSession  — init a new session
 *    - setProgress    — update pipeline progress indicator
 *    - setSessionAssets — persist storyBible/styleGuide/characterSheets/worldState
 *    - setChoiceSet   — write the active choice set for an interactive session
 *    - updateWorldState — overwrite worldState after an event is processed
 *    - setSessionStatus — mark session ready or errored
 *
 * B) PIPELINE FUNCTIONS (called by actions / scheduler):
 *    - startGeneration  — action: runs the initial comic pipeline
 *    - processChoice    — action: generates panels after a reader choice
 *    - processUtterance — action: generates NPC reply + panels after voice input
 *    - submitChoice     — mutation: log choice event, kick off processChoice
 *    - submitUtterance  — mutation: log voice event, kick off processUtterance
 *    - updateProgress   — internal alias for setProgress
 *    - markReady / markError — terminal status helpers
 *    - applyStoryMeta   — internal: persist Director output as a single patch
 *    - applyWorldState  — internal: overwrite worldState
 *    - addPanel         — internal: insert a single panel
 *    - addChoiceSet     — internal: insert a choice set row
 *    - appendConversationTurn — append two turns (user+npc) in one call
 */

import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// ─────────────────────────────────────────────────────────────
// A) PUBLIC CONTRACT
// ─────────────────────────────────────────────────────────────

/**
 * getSession — primary realtime subscription endpoint.
 *
 * Returns session metadata, all panels ordered by panelIndex, and the
 * most recent unconsumed choice set (interactive sessions only).
 *
 * Subscribe from the frontend to receive live progress + panel updates:
 *   const data = useQuery(api.sessions.getSession, { sessionId });
 *   // data.session.progress updates as the pipeline advances.
 */
export const getSession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    const panels = await ctx.db
      .query("panels")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("asc")
      .collect();

    // Most recent unconsumed choice set (interactive mode)
    const activeChoices = await ctx.db
      .query("choices")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .filter((q) => q.eq(q.field("consumed"), false))
      .first();

    return {
      session: { ...session, _id: session._id.toString() },
      panels: panels.map((p) => ({
        ...p,
        _id: p._id.toString(),
        sessionId: p.sessionId.toString(),
      })),
      choiceSet: activeChoices
        ? {
            ...activeChoices,
            _id: activeChoices._id.toString(),
            sessionId: activeChoices.sessionId.toString(),
          }
        : undefined,
    };
  },
});

/**
 * createSession — initialise a new generation session and kick off the pipeline.
 *
 * Example:
 *   const { sessionId } = await createSession({ mode: "normal", premise: "…", vibe: "fantasy" });
 */
export const createSession = mutation({
  args: {
    mode: v.union(v.literal("normal"), v.literal("interactive")),
    premise: v.string(),
    vibe: v.string(),
  },
  handler: async (ctx, { mode, premise, vibe }) => {
    if (!premise.trim()) throw new Error("premise must not be empty");
    if (!vibe.trim()) throw new Error("vibe must not be empty");

    const sessionId = await ctx.db.insert("sessions", {
      premise: premise.trim(),
      vibe: vibe.trim(),
      mode,
      createdAt: Date.now(),
      storyBible: null,
      styleGuide: null,
      characterSheets: [],
      worldState: null,
      status: "creating",
      progress: { stage: "initialising", detail: "Session created" },
    });

    // Kick off the generation pipeline immediately
    await ctx.scheduler.runAfter(0, api.sessions.startGeneration, {
      sessionId,
    });

    return { sessionId: sessionId.toString() };
  },
});

/**
 * setProgress — update the pipeline progress indicator.
 *
 * Called frequently so the frontend can display a live status message.
 *
 * Example:
 *   await setProgress({ sessionId, stage: "writing", detail: "SceneWriter generating scripts…" });
 */
export const setProgress = mutation({
  args: {
    sessionId: v.id("sessions"),
    stage: v.string(),
    detail: v.string(),
  },
  handler: async (ctx, { sessionId, stage, detail }) => {
    await ctx.db.patch(sessionId, { progress: { stage, detail } });
    return null;
  },
});

/**
 * setSessionAssets — persist storyBible, styleGuide, characterSheets, worldState
 * after the StoryDirectorAgent completes.
 *
 * Accepts any shape for the complex objects (validated by zod in the pipeline).
 *
 * Example:
 *   await setSessionAssets({ sessionId, storyBible, styleGuide, characterSheets, worldState });
 */
export const setSessionAssets = mutation({
  args: {
    sessionId: v.id("sessions"),
    storyBible: v.any(),
    styleGuide: v.any(),
    characterSheets: v.array(v.any()),
    worldState: v.union(v.any(), v.null()),
  },
  handler: async (ctx, { sessionId, storyBible, styleGuide, characterSheets, worldState }) => {
    await ctx.db.patch(sessionId, { storyBible, styleGuide, characterSheets, worldState });
    return null;
  },
});

/**
 * setChoiceSet — write the active choice set for an interactive session.
 *
 * Inserts a new choices row; old rows are kept for history.
 * The active set is always the most-recent unconsumed row.
 *
 * Example:
 *   await setChoiceSet({
 *     sessionId,
 *     choiceSet: {
 *       anchorPanelIndex: 5,
 *       options: [
 *         { id: "a", label: "Trust the wizard", consequenceHint: "gains ally" },
 *         { id: "b", label: "Run away", consequenceHint: "unlocks shortcut" },
 *       ],
 *     },
 *   });
 *
 * Note: the spec uses `anchorPanelIndex`; the DB column is `panelIndexAnchor`.
 * Both are accepted here for forward compatibility.
 */
export const setChoiceSet = mutation({
  args: {
    sessionId: v.id("sessions"),
    choiceSet: v.object({
      /** The last panel index when these choices appear. */
      anchorPanelIndex: v.optional(v.number()),
      /** Alias accepted for compatibility with legacy callers. */
      panelIndexAnchor: v.optional(v.number()),
      options: v.array(
        v.object({ id: v.string(), label: v.string(), consequenceHint: v.string() }),
      ),
    }),
  },
  handler: async (ctx, { sessionId, choiceSet }) => {
    const anchor =
      choiceSet.anchorPanelIndex ?? choiceSet.panelIndexAnchor ?? 0;
    if (choiceSet.options.length < 2) {
      throw new Error("choiceSet must have at least 2 options");
    }
    await ctx.db.insert("choices", {
      sessionId,
      panelIndexAnchor: anchor,
      options: choiceSet.options,
      consumed: false,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * updateWorldState — replace worldState after an interactive event is processed.
 *
 * Example:
 *   await updateWorldState({ sessionId, worldState: { location: "cave", … } });
 */
export const updateWorldState = mutation({
  args: { sessionId: v.id("sessions"), worldState: v.any() },
  handler: async (ctx, { sessionId, worldState }) => {
    await ctx.db.patch(sessionId, { worldState });
    return null;
  },
});

/**
 * setSessionStatus — mark session as ready or errored.
 *
 * Example:
 *   await setSessionStatus({ sessionId, status: "ready" });
 */
export const setSessionStatus = mutation({
  args: {
    sessionId: v.id("sessions"),
    status: v.union(v.literal("ready"), v.literal("error")),
  },
  handler: async (ctx, { sessionId, status }) => {
    await ctx.db.patch(sessionId, { status });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────
// B) PIPELINE HELPERS
// ─────────────────────────────────────────────────────────────

/** Internal alias kept for compatibility with action callers. */
export const updateProgress = setProgress;

export const markReady = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    await ctx.db.patch(sessionId, {
      status: "ready",
      progress: { stage: "done", detail: "Your comic is ready!" },
    });
  },
});

export const markError = mutation({
  args: { sessionId: v.id("sessions"), detail: v.string() },
  handler: async (ctx, { sessionId, detail }) => {
    await ctx.db.patch(sessionId, {
      status: "error",
      progress: { stage: "error", detail },
    });
  },
});

/**
 * submitChoice — log a choice event and trigger panel generation.
 * Interactive mode only.
 */
export const submitChoice = mutation({
  args: {
    sessionId: v.id("sessions"),
    choiceId: v.string(),
  },
  handler: async (ctx, { sessionId, choiceId }) => {
    await ctx.db.insert("events", {
      sessionId,
      type: "choice",
      payload: { choiceId },
      createdAt: Date.now(),
    });

    // Mark current choices consumed
    const active = await ctx.db
      .query("choices")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .filter((q) => q.eq(q.field("consumed"), false))
      .first();
    if (active) await ctx.db.patch(active._id, { consumed: true });

    await ctx.scheduler.runAfter(0, api.sessions.processChoice, {
      sessionId,
      choiceId,
    });
  },
});

/**
 * submitUtterance — log a voice event and trigger NPC + panel generation.
 */
export const submitUtterance = mutation({
  args: {
    sessionId: v.id("sessions"),
    characterId: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { sessionId, characterId, text }) => {
    await ctx.db.insert("events", {
      sessionId,
      type: "voice",
      payload: { characterId, text },
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, api.sessions.processUtterance, {
      sessionId,
      characterId,
      text,
    });
  },
});

/** Persist Director output (storyBible, styleGuide, characterSheets, worldState) atomically. */
export const applyStoryMeta = mutation({
  args: {
    sessionId: v.id("sessions"),
    storyBible: v.any(),
    styleGuide: v.any(),
    characterSheets: v.any(),
    worldState: v.union(v.any(), v.null()),
  },
  handler: async (ctx, { sessionId, storyBible, styleGuide, characterSheets, worldState }) => {
    await ctx.db.patch(sessionId, { storyBible, styleGuide, characterSheets, worldState });
  },
});

export const applyWorldState = mutation({
  args: { sessionId: v.id("sessions"), worldState: v.any() },
  handler: async (ctx, { sessionId, worldState }) => {
    await ctx.db.patch(sessionId, { worldState });
  },
});

/** Insert a single panel (used by action pipelines). */
export const addPanel = mutation({
  args: {
    sessionId: v.id("sessions"),
    panel: v.any(),
  },
  handler: async (ctx, { sessionId, panel }) => {
    await ctx.db.insert("panels", {
      sessionId,
      panelIndex: panel.panelIndex,
      pageNumber: panel.pageNumber ?? 1,
      script: panel.script,
      imagePrompt: panel.imagePrompt,
      imageUrl: panel.imageUrl ?? null,
      createdAt: panel.createdAt ?? Date.now(),
    });
  },
});

/** Insert a choices row (used by action pipelines). */
export const addChoiceSet = mutation({
  args: {
    sessionId: v.id("sessions"),
    choiceSet: v.any(),
  },
  handler: async (ctx, { sessionId, choiceSet }) => {
    if (!choiceSet) return;
    await ctx.db.insert("choices", {
      sessionId,
      panelIndexAnchor: choiceSet.panelIndexAnchor ?? 0,
      options: choiceSet.options ?? [],
      consumed: false,
      createdAt: choiceSet.createdAt ?? Date.now(),
    });
  },
});

/**
 * appendConversationTurn — append a user utterance and NPC reply to the conversation log.
 * Upserts: creates the conversation row if it doesn't exist yet.
 */
export const appendConversationTurn = mutation({
  args: {
    sessionId: v.id("sessions"),
    characterId: v.string(),
    userText: v.string(),
    npcText: v.string(),
  },
  handler: async (ctx, { sessionId, characterId, userText, npcText }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("characterId"), characterId))
      .unique();

    const newTurns = [
      { role: "user" as const, text: userText, ts: now - 500 },
      { role: "npc" as const, text: npcText, ts: now },
    ];

    if (existing) {
      await ctx.db.patch(existing._id, {
        turns: [...existing.turns, ...newTurns],
      });
    } else {
      await ctx.db.insert("conversations", {
        sessionId,
        characterId,
        turns: newTurns,
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────
// ACTIONS  (run outside the mutation transaction)
// ─────────────────────────────────────────────────────────────

/**
 * startGeneration — full initial-page pipeline.
 * Triggered automatically by createSession via ctx.scheduler.
 */
export const startGeneration = action({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const sessionData = await ctx.runQuery(api.sessions.getSession, { sessionId });
    if (!sessionData) return;

    const { session } = sessionData;

    try {
      await ctx.runMutation(api.sessions.setProgress, {
        sessionId,
        stage: "generating",
        detail: "Running story pipeline…",
      });

      const { generateInitialComic } = await import("../src/lib/server/generate");

      const result = await generateInitialComic(
        sessionId.toString(),
        session.mode as "normal" | "interactive",
        session.premise,
        session.vibe,
      );

      await ctx.runMutation(api.sessions.applyStoryMeta, {
        sessionId,
        storyBible: result.storyBible,
        styleGuide: result.styleGuide,
        characterSheets: result.characterSheets,
        worldState: result.worldState ?? null,
      });

      for (const panel of result.panels) {
        await ctx.runMutation(api.sessions.addPanel, { sessionId, panel });
      }

      if (result.choiceSet) {
        await ctx.runMutation(api.sessions.addChoiceSet, {
          sessionId,
          choiceSet: result.choiceSet,
        });
      }

      await ctx.runMutation(api.sessions.markReady, { sessionId });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(api.sessions.markError, { sessionId, detail });
    }
  },
});

/**
 * processChoice — generates panels after a player choice.
 */
export const processChoice = action({
  args: {
    sessionId: v.id("sessions"),
    choiceId: v.string(),
  },
  handler: async (ctx, { sessionId, choiceId }) => {
    const sessionData = await ctx.runQuery(api.sessions.getSession, { sessionId });
    if (!sessionData) return;

    const { panels, session } = sessionData;

    try {
      await ctx.runMutation(api.sessions.setProgress, {
        sessionId,
        stage: "generating",
        detail: "Generating next panels…",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const generate = (await import("../src/lib/server/generate")) as any;

      const worldState = session.worldState ?? {
        location: "Unknown",
        inventory: [],
        flags: {},
        conversationLog: [],
      };

      const result = await generate.generateChoicePanels(
        sessionId.toString(),
        choiceId,
        panels.length,
        worldState,
        {
          storyBible: session.storyBible,
          styleGuide: session.styleGuide,
          characterSheets: session.characterSheets ?? [],
        },
      );

      for (const panel of result.panels) {
        await ctx.runMutation(api.sessions.addPanel, { sessionId, panel });
      }

      if (result.choiceSet) {
        await ctx.runMutation(api.sessions.addChoiceSet, {
          sessionId,
          choiceSet: result.choiceSet,
        });
      }

      await ctx.runMutation(api.sessions.applyWorldState, {
        sessionId,
        worldState: result.worldState,
      });

      await ctx.runMutation(api.sessions.markReady, { sessionId });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(api.sessions.markError, { sessionId, detail });
    }
  },
});

/**
 * processUtterance — NPC response + panel generation after a voice turn.
 */
export const processUtterance = action({
  args: {
    sessionId: v.id("sessions"),
    characterId: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { sessionId, characterId, text }) => {
    const sessionData = await ctx.runQuery(api.sessions.getSession, { sessionId });
    if (!sessionData) return;

    const { panels, session } = sessionData;

    try {
      await ctx.runMutation(api.sessions.setProgress, {
        sessionId,
        stage: "generating",
        detail: "NPC is responding…",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const generate = (await import("../src/lib/server/generate")) as any;

      const worldState = session.worldState ?? {
        location: "Unknown",
        inventory: [],
        flags: {},
        conversationLog: [],
      };

      const convHistory = await ctx.runQuery(api.conversations.getConversation, {
        sessionId,
        characterId,
      });

      const result = await generate.generateVoicePanels(
        sessionId.toString(),
        characterId,
        text,
        panels.length,
        worldState,
        {
          storyBible: session.storyBible,
          styleGuide: session.styleGuide,
          characterSheets: session.characterSheets ?? [],
        },
        convHistory ?? [],
      );

      await ctx.runMutation(api.sessions.appendConversationTurn, {
        sessionId,
        characterId,
        userText: text,
        npcText: result.npcReplyText,
      });

      for (const panel of result.panels) {
        await ctx.runMutation(api.sessions.addPanel, { sessionId, panel });
      }

      if (result.choiceSet) {
        await ctx.runMutation(api.sessions.addChoiceSet, {
          sessionId,
          choiceSet: result.choiceSet,
        });
      }

      await ctx.runMutation(api.sessions.applyWorldState, {
        sessionId,
        worldState: result.worldState,
      });

      await ctx.runMutation(api.sessions.markReady, { sessionId });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(api.sessions.markError, { sessionId, detail });
    }
  },
});
