/**
 * Integration layer — Panel generation pipeline.
 *
 * Routes all generation calls through either:
 *   DEMO_MODE=true  → fast placeholder data (no API calls)
 *   DEMO_MODE=false → real pipeline:
 *       Director (MiniMax) → Writer → Continuity → ArtDirector → DALL-E 3 image gen
 *
 * All three public functions share the same signature they had as stubs so
 * convex/sessions.ts doesn't need to change.
 */

import { DEMO_MODE } from "./env";
import { generateImages } from "./imageGen";
import {
  generateInitialComic as pipelineInitial,
  generateNextPanelsFromChoice as pipelineChoice,
  generateNextPanelsFromUtterance as pipelineUtterance,
} from "@/lib/agents/pipeline";

import type {
  AssembledPanel,
  CharacterSheet as AgentCharacterSheet,
  StyleGuide as AgentStyleGuide,
  StoryBible as AgentStoryBible,
  WorldState as AgentWorldState,
  ChoiceSet as AgentChoiceSet,
} from "@/lib/shared/schemas";

import type {
  Panel,
  ChoiceSet,
  StoryBible,
  StyleGuide,
  CharacterSheet,
  WorldState,
  StoryMode,
} from "@/lib/shared/types";

// ─────────────────────────────────────────────────────────────
// Type adapters  (agent format → DB / frontend format)
// ─────────────────────────────────────────────────────────────

/**
 * Convert an agent PanelScript to the DB/frontend PanelScript shape.
 * The agent uses `sceneDescription`; the DB/frontend uses `scene`.
 * Strips the `type` field from dialogue bubbles (frontend doesn't need it).
 */
function adaptScript(agentPanel: AssembledPanel["script"]): Panel["script"] {
  return {
    scene: agentPanel.sceneDescription,
    dialogue: agentPanel.dialogue.map((d) => ({
      speaker: d.speaker,
      text: d.text,
    })),
    camera: agentPanel.camera,
  };
}

/**
 * Convert an AssembledPanel (script + imagePrompt, no URL yet) into a Panel
 * ready for Convex storage, filling in the image URL.
 *
 * Agent panelIndex is 1-based; the DB / UI expects 0-based.
 */
function adaptPanel(
  assembled: AssembledPanel,
  sessionId: string,
  imageUrl: string
): Panel {
  const panelIndex0 = assembled.panelIndex - 1; // 1-based → 0-based
  return {
    _id: "",
    sessionId,
    panelIndex: panelIndex0,
    pageNumber: Math.floor(panelIndex0 / 6) + 1,
    script: adaptScript(assembled.script),
    imagePrompt: assembled.imagePrompt,
    imageUrl,
    createdAt: Date.now(),
  };
}

/**
 * Map agent CharacterSheet to the DB CharacterSheet shape.
 * Agent uses `doNotChange`; DB/frontend uses `constraints`.
 */
function adaptCharacterSheet(c: AgentCharacterSheet): CharacterSheet {
  return {
    id: c.id,
    name: c.name,
    appearance: c.appearance,
    constraints: c.doNotChange,
    signatureProps: c.signatureProps,
  };
}

/**
 * Map agent StoryBible to the DB StoryBible shape.
 * Agent has richer fields; we project to the minimal DB contract.
 */
function adaptStoryBible(b: AgentStoryBible): StoryBible {
  return {
    genre: b.genre,
    vibe: b.vibe,
    setting: b.setting,
    rules: b.rules,
    characterList: [],          // populated from characterSheets separately
    relationships: [],          // agent stores as strings; not needed for display
    toneGuardrails: b.toneGuardrails,
  };
}

/**
 * Map agent StyleGuide to DB StyleGuide shape.
 */
function adaptStyleGuide(s: AgentStyleGuide): StyleGuide {
  return {
    lineStyle: s.lineStyle,
    shading: s.shadingStyle,
    palette: [s.palette],
    cameraRules: [s.cameraRules],
    notes: s.additionalNotes,
  };
}

/**
 * Map agent WorldState to DB WorldState shape.
 * Agent uses `narrativeSummary`; DB uses `plotSummary`.
 */
function adaptWorldState(w: AgentWorldState): WorldState {
  return {
    currentLocation: w.currentLocation,
    inventory: w.inventory,
    charactersPresent: [],
    flags: w.flags,
    plotSummary: w.narrativeSummary,
  };
}

/**
 * Coerce the DB-format worldState (or any object) back to agent WorldState.
 * Used when the Convex action passes session.worldState to the real pipeline.
 * Falls back to safe defaults for any missing fields.
 */
function coerceToAgentWorldState(ws: unknown): AgentWorldState {
  const w = (ws ?? {}) as Record<string, unknown>;
  return {
    currentLocation:
      (w.currentLocation as string) ??
      (w.location as string) ??
      "Unknown",
    flags: (w.flags as AgentWorldState["flags"]) ?? {},
    inventory: (w.inventory as string[]) ?? [],
    relationshipDeltas:
      (w.relationshipDeltas as Record<string, number>) ?? {},
    narrativeSummary:
      (w.narrativeSummary as string) ??
      (w.plotSummary as string) ??
      "",
    lastPanelIndex: (w.lastPanelIndex as number) ?? 0,
  };
}

/**
 * Coerce the DB-format storyBible / styleGuide / characterSheets back to
 * agent types.
 *
 * The DB stores adapted (DB-format) shapes:
 *   CharacterSheet: { constraints } instead of { doNotChange }
 *   StyleGuide:     { shading, palette: string[], cameraRules: string[] }
 *                   instead of { shadingStyle, palette: string, cameraRules: string }
 *   StoryBible:     { relationships: {from,to,description}[] } instead of string[]
 *                   and may be missing title / arcSummary / centralConflict
 *
 * We map every divergent field with fallbacks so the pipeline never sees undefined.
 */
function coerceToAgentAssets(assets: {
  storyBible: unknown;
  styleGuide: unknown;
  characterSheets: unknown[];
}): {
  storyBible: AgentStoryBible;
  styleGuide: AgentStyleGuide;
  characterSheets: AgentCharacterSheet[];
} {
  // ── CharacterSheets ──────────────────────────────────────────────────────
  const rawSheets = (assets.characterSheets ?? []) as Record<string, unknown>[];
  const characterSheets: AgentCharacterSheet[] = rawSheets.map((c) => ({
    id: (c.id as string) ?? "",
    name: (c.name as string) ?? "",
    appearance: (c.appearance as string) ?? "",
    // DB saves as "constraints"; agent layer expects "doNotChange"
    doNotChange: (c.doNotChange as string[]) ?? (c.constraints as string[]) ?? [],
    personality: (c.personality as string) ?? "",
    signatureProps: (c.signatureProps as string[]) ?? [],
    role: (c.role as AgentCharacterSheet["role"]) ?? "supporting",
  }));

  // ── StyleGuide ───────────────────────────────────────────────────────────
  const s = ((assets.styleGuide ?? {}) as Record<string, unknown>);
  const rawPalette = s.palette;
  const rawCameraRules = s.cameraRules;
  const styleGuide: AgentStyleGuide = {
    artStyle: (s.artStyle as string) ?? "",
    lineStyle: (s.lineStyle as string) ?? "",
    // DB uses "shading"; agent uses "shadingStyle"
    shadingStyle: (s.shadingStyle as string) ?? (s.shading as string) ?? "",
    // DB stores as string[]; agent expects a single string
    palette:
      typeof rawPalette === "string"
        ? rawPalette
        : Array.isArray(rawPalette)
        ? (rawPalette as string[]).join(", ")
        : "",
    cameraRules:
      typeof rawCameraRules === "string"
        ? rawCameraRules
        : Array.isArray(rawCameraRules)
        ? (rawCameraRules as string[]).join(", ")
        : "",
    additionalNotes:
      (s.additionalNotes as string | undefined) ??
      (s.notes as string | undefined),
  };

  // ── StoryBible ───────────────────────────────────────────────────────────
  const b = ((assets.storyBible ?? {}) as Record<string, unknown>);
  const rawRelationships = b.relationships;
  const storyBible: AgentStoryBible = {
    title: (b.title as string) ?? "",
    genre: (b.genre as string) ?? "",
    vibe: (b.vibe as string) ?? "",
    setting: (b.setting as string) ?? "",
    rules: (b.rules as string[]) ?? [],
    // DB stores as { from, to, description }[]; agent expects string[]
    relationships: Array.isArray(rawRelationships)
      ? (rawRelationships as unknown[]).map((r) =>
          typeof r === "string"
            ? r
            : `${(r as Record<string, string>).from ?? ""} → ${(r as Record<string, string>).to ?? ""}: ${(r as Record<string, string>).description ?? ""}`
        )
      : [],
    toneGuardrails: (b.toneGuardrails as string[]) ?? [],
    centralConflict: (b.centralConflict as string) ?? "",
    arcSummary: (b.arcSummary as string) ?? "",
  };

  return { storyBible, styleGuide, characterSheets };
}

// ─────────────────────────────────────────────────────────────
// Demo / placeholder helpers
// ─────────────────────────────────────────────────────────────

function makeDemoPanel(sessionId: string, index: number): Panel {
  const speakers = ["Narrator", "Hero", "Villain", "Ally"];
  const speaker = speakers[index % speakers.length];
  return {
    _id: `demo-panel-${index}`,
    sessionId,
    panelIndex: index,
    pageNumber: Math.floor(index / 6) + 1,
    script: {
      scene: `[DEMO] Panel ${index + 1}: Establishing shot of the scene.`,
      dialogue: [{ speaker, text: `[DEMO] Panel ${index + 1} dialogue line here.` }],
      camera: "Medium shot, eye level",
    },
    imagePrompt:
      `[DEMO] Graphic novel panel ${index + 1}, ${speaker} in a dramatic pose, ` +
      `consistent ink-line style, muted palette.`,
    imageUrl: "",
    createdAt: Date.now(),
  };
}

function makeDemoChoiceSet(panelIndex: number): ChoiceSet {
  return {
    anchorPanelIndex: panelIndex,
    options: [
      { id: "choice-a", label: "Follow the mysterious figure", consequenceHint: "Leads deeper into the conflict" },
      { id: "choice-b", label: "Search for clues instead",      consequenceHint: "Reveals backstory" },
    ],
  };
}

function makeDemoWorldState(): WorldState {
  return {
    currentLocation: "The Crossroads",
    inventory: [],
    charactersPresent: ["Hero"],
    flags: { intro_seen: true },
    plotSummary: "[DEMO] The story has just begun.",
  };
}

function simulateDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// Public API — called by Convex actions
// ─────────────────────────────────────────────────────────────

export interface GenerateInitialComicResult {
  panels: Panel[];
  choiceSet?: ChoiceSet;
  worldState?: WorldState;
  storyBible: StoryBible | null;
  styleGuide: StyleGuide | null;
  characterSheets: CharacterSheet[];
}

/**
 * Runs the full initial-page pipeline for a session.
 * Normal mode  → 6 panels, no choices.
 * Interactive  → 6 panels + initial choice set + world state.
 */
export async function generateInitialComic(
  sessionId: string,
  mode: StoryMode,
  premise: string,
  vibe: string
): Promise<GenerateInitialComicResult> {
  // ── Demo path ───────────────────────────────────────────────────────────
  if (DEMO_MODE) {
    await simulateDelay(1200);
    const demoPanels = Array.from({ length: 6 }, (_, i) => makeDemoPanel(sessionId, i));

    // Generate real images even in demo mode when the key is present.
    if (process.env.IMAGE_MODEL_API_KEY) {
      const urls = await generateImages(
        demoPanels.map((p) => ({ prompt: p.imagePrompt }))
      );
      urls.forEach((url, i) => { demoPanels[i].imageUrl = url; });
    }

    const panels = demoPanels;
    const result: GenerateInitialComicResult = {
      panels,
      storyBible: {
        genre: "Adventure",
        vibe,
        setting: "[DEMO] Setting derived from premise.",
        rules: ["[DEMO] Consistency rule 1"],
        characterList: [{ id: "hero", name: "The Hero", role: "protagonist" }],
        relationships: [],
        toneGuardrails: ["Keep tone serious but hopeful"],
      },
      styleGuide: {
        lineStyle: "Bold ink lines",
        shading: "Flat with spot shadows",
        palette: ["muted earth tones", "high contrast accents"],
        cameraRules: ["No fish-eye", "Vary shot distance per scene"],
      },
      characterSheets: [
        {
          id: "hero",
          name: "The Hero",
          appearance: "[DEMO] Tall, determined, dark hair",
          constraints: ["hair colour unchanged", "always wears the jacket"],
          signatureProps: ["worn journal"],
        },
      ],
    };
    if (mode === "interactive") {
      result.choiceSet = makeDemoChoiceSet(5);
      result.worldState = makeDemoWorldState();
    }
    return result;
  }

  // ── Real pipeline ────────────────────────────────────────────────────────
  const pipelineResult = await pipelineInitial({ mode, premise, vibe });

  const { sessionAssets, panels: assembledPanels, choiceSet } = pipelineResult;

  // Generate all panel images concurrently
  const imageUrls = await generateImages(
    assembledPanels.map((p) => ({
      prompt: p.imagePrompt,
      negativePrompt: p.negativePrompt,
    }))
  );

  const panels = assembledPanels.map((p, i) =>
    adaptPanel(p, sessionId, imageUrls[i] ?? "")
  );

  // Map agent ChoiceSet → frontend ChoiceSet shape
  const mappedChoiceSet: ChoiceSet | undefined = choiceSet
    ? {
        anchorPanelIndex: choiceSet.panelIndexAnchor,
        options: choiceSet.options,
      }
    : undefined;

  return {
    panels,
    choiceSet: mappedChoiceSet,
    worldState: adaptWorldState(sessionAssets.worldState),
    storyBible: adaptStoryBible(sessionAssets.storyBible),
    styleGuide: adaptStyleGuide(sessionAssets.styleGuide),
    characterSheets: sessionAssets.characterSheets.map(adaptCharacterSheet),
  };
}

/**
 * Generates 1–2 new panels after a player choice (interactive mode only).
 * Called by the Convex processChoice action.
 *
 * @param sessionId         - Session identifier
 * @param choiceId          - The choice option ID selected by the reader
 * @param currentPanelCount - Number of panels already in the session
 * @param rawWorldState     - Current world state from the DB
 * @param assets            - Session assets (storyBible, styleGuide, characterSheets) from DB
 */
export async function generateChoicePanels(
  sessionId: string,
  choiceId: string,
  currentPanelCount: number,
  rawWorldState: unknown,
  assets?: { storyBible: unknown; styleGuide: unknown; characterSheets: unknown[] }
): Promise<{ panels: Panel[]; choiceSet: ChoiceSet; worldState: WorldState }> {
  // ── Demo path ──────────────────────────────────────────────────────────
  if (DEMO_MODE) {
    await simulateDelay(800);
    const panels = [
      makeDemoPanel(sessionId, currentPanelCount),
      makeDemoPanel(sessionId, currentPanelCount + 1),
    ];
    if (process.env.IMAGE_MODEL_API_KEY) {
      const urls = await generateImages(panels.map((p) => ({ prompt: p.imagePrompt })));
      urls.forEach((url, i) => { panels[i].imageUrl = url; });
    }
    return {
      panels,
      choiceSet: makeDemoChoiceSet(currentPanelCount + 1),
      worldState: {
        currentLocation: `[DEMO] New location after choice ${choiceId}`,
        inventory: [],
        charactersPresent: ["Hero"],
        flags: { [`choice_${choiceId}`]: true },
        plotSummary: `[DEMO] The hero chose: ${choiceId}.`,
      },
    };
  }

  // ── Real pipeline ────────────────────────────────────────────────────────
  if (!assets) {
    throw new Error("generateChoicePanels: session assets are required in real mode");
  }

  const agentAssets = coerceToAgentAssets(assets);
  const worldState  = coerceToAgentWorldState(rawWorldState);

  const result = await pipelineChoice({
    storyBible:      agentAssets.storyBible,
    styleGuide:      agentAssets.styleGuide,
    characterSheets: agentAssets.characterSheets,
    worldState,
    choiceId,
  });

  const imageUrls = await generateImages(
    result.panels.map((p) => ({ prompt: p.imagePrompt, negativePrompt: p.negativePrompt }))
  );

  const panels = result.panels.map((p, i) =>
    adaptPanel({ ...p, panelIndex: currentPanelCount + i + 1 }, sessionId, imageUrls[i] ?? "")
  );

  const agentChoiceSet = result.choiceSet;
  const mappedChoiceSet: ChoiceSet = agentChoiceSet
    ? { anchorPanelIndex: agentChoiceSet.panelIndexAnchor, options: agentChoiceSet.options }
    : makeDemoChoiceSet(currentPanelCount + panels.length);

  return {
    panels,
    choiceSet: mappedChoiceSet,
    worldState: adaptWorldState(result.worldState),
  };
}

/**
 * Generates an NPC reply and 1–2 new panels after a voice utterance (interactive mode only).
 * Called by the Convex processUtterance action.
 */
export async function generateVoicePanels(
  sessionId: string,
  characterId: string,
  utteranceText: string,
  currentPanelCount: number,
  rawWorldState: unknown,
  assets?: { storyBible: unknown; styleGuide: unknown; characterSheets: unknown[] },
  conversationHistory?: Array<{ role: "user" | "npc"; text: string; ts: number }>
): Promise<{ npcReplyText: string; panels: Panel[]; worldState: WorldState }> {
  // ── Demo path ──────────────────────────────────────────────────────────
  if (DEMO_MODE) {
    await simulateDelay(900);
    const demoVoicePanel = makeDemoPanel(sessionId, currentPanelCount);
    if (process.env.IMAGE_MODEL_API_KEY) {
      const urls = await generateImages([{ prompt: demoVoicePanel.imagePrompt }]);
      demoVoicePanel.imageUrl = urls[0] ?? "";
    }
    return {
      npcReplyText: `[DEMO] ${characterId} replies: "Interesting… let me think about that."`,
      panels: [demoVoicePanel],
      worldState: {
        currentLocation: "[DEMO] Same location post-conversation",
        inventory: [],
        charactersPresent: [characterId, "Hero"],
        flags: { [`talked_to_${characterId}`]: true },
        plotSummary: `[DEMO] Hero spoke with ${characterId}: "${utteranceText}"`,
      },
    };
  }

  // ── Real pipeline ────────────────────────────────────────────────────────
  if (!assets) {
    throw new Error("generateVoicePanels: session assets are required in real mode");
  }

  const agentAssets = coerceToAgentAssets(assets);
  const worldState  = coerceToAgentWorldState(rawWorldState);

  const result = await pipelineUtterance({
    storyBible:          agentAssets.storyBible,
    styleGuide:          agentAssets.styleGuide,
    characterSheets:     agentAssets.characterSheets,
    worldState,
    characterId,
    userText:            utteranceText,
    conversationHistory: conversationHistory ?? [],
  });

  const imageUrls = await generateImages(
    result.panels.map((p) => ({ prompt: p.imagePrompt, negativePrompt: p.negativePrompt }))
  );

  const panels = result.panels.map((p, i) =>
    adaptPanel({ ...p, panelIndex: currentPanelCount + i + 1 }, sessionId, imageUrls[i] ?? "")
  );

  return {
    npcReplyText: result.npcReplyText,
    panels,
    worldState: adaptWorldState(result.worldState),
  };
}
