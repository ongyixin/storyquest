/**
 * Pipeline orchestration — StoryQuest
 *
 * This module wires together all agent calls into the three high-level operations
 * that Convex server actions (or Next.js Route Handlers) call directly.
 *
 * All functions are async, fully typed, and throw descriptive errors on failure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Exported functions:
 *
 * generateInitialComic({ mode, premise, vibe })
 *   Normal:      Director(normal) → Writer(6) → Continuity → ArtDirector
 *   Interactive: Director(interactive) → Writer(6) → Continuity → ArtDirector
 *   Returns: { sessionAssets, panels[6], choiceSet? }
 *
 * generateNextPanelsFromChoice({ storyBible, styleGuide, characterSheets, worldState, choiceId, choiceLabel })
 *   Director(afterEvent:choice) → Writer(1–2) → Continuity → ArtDirector
 *   Returns: { worldState, panels[1–2], choiceSet? }
 *
 * generateNextPanelsFromUtterance({ storyBible, styleGuide, characterSheets, worldState,
 *                                    characterId, userText, conversationHistory })
 *   NPC(respond) → Director(afterEvent:voice) → Writer(1–2) → Continuity → ArtDirector
 *   Returns: { worldState, npcReplyText, panels[1–2], choiceSet? }
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Panel assembly note:
 *   Image URLs are NOT generated here — this layer ends at image PROMPTS.
 *   The caller (Convex action) is responsible for passing imagePrompt to the
 *   image generation service and storing the resulting URL.
 */

import { directorInitialNormal, directorInitialInteractive, directorAfterEventInteractive } from "./director";
import { writePanels } from "./writer";
import { checkAndFix } from "./continuity";
import { makeImagePrompts } from "./artDirector";
import { respond } from "./npc";

import {
  type GenerateInitialComicInput,
  type GenerateInitialComicOutput,
  type GenerateNextPanelsFromChoiceInput,
  type GenerateNextPanelsOutput,
  type GenerateNextPanelsFromUtteranceInput,
  type GenerateNextPanelsFromUtteranceOutput,
  type AssembledPanel,
  type PanelScripts,
  type StyleGuide,
  type CharacterSheet,
  type WorldState,
  type StoryBible,
  type ChoiceSet,
} from "@/lib/shared/schemas";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Merge Writer scripts + ArtDirector prompts into AssembledPanel objects.
 * Image generation happens downstream — we only store the prompts here.
 */
function assemblePanel(scripts: PanelScripts, imagePrompts: Awaited<ReturnType<typeof makeImagePrompts>>): AssembledPanel[] {
  return scripts.map((script) => {
    const ip = imagePrompts.find((p) => p.panelIndex === script.panelIndex);
    return {
      panelIndex: script.panelIndex,
      script,
      imagePrompt: ip?.imagePrompt ?? "",
      negativePrompt: ip?.negativePrompt,
    };
  });
}

/**
 * Run Writer → Continuity → ArtDirector for a given panel outline or scene goal.
 * Returns assembled panels (scripts + image prompts).
 */
async function runScenePipeline(
  storyBible: StoryBible,
  styleGuide: StyleGuide,
  characterSheets: CharacterSheet[],
  outlineOrGoal: Parameters<typeof writePanels>[1],
  worldState?: WorldState
): Promise<AssembledPanel[]> {
  // 1. Write scripts
  const rawScripts = await writePanels(storyBible, outlineOrGoal, worldState);

  // 2. Continuity check + fix
  const { scripts } = await checkAndFix(storyBible, worldState, rawScripts);

  // 3. Art direction (image prompts)
  const imagePrompts = await makeImagePrompts(styleGuide, characterSheets, scripts);

  return assemblePanel(scripts, imagePrompts);
}

// ---------------------------------------------------------------------------
// generateInitialComic
// ---------------------------------------------------------------------------

/**
 * Generate the first page of a comic (6 panels) for both normal and interactive modes.
 *
 * Normal mode:
 *   1. DirectorInitialNormal → storyBible, styleGuide, characterSheets, panelOutline
 *   2. Writer(panelOutline, 6 panels)
 *   3. ContinuityAgent → fixed scripts
 *   4. ArtDirectorAgent → image prompts
 *   Returns sessionAssets + 6 assembled panels (no choiceSet)
 *
 * Interactive mode:
 *   Same pipeline but using DirectorInitialInteractive which also produces
 *   an initial worldState and a choiceSet (shown after panel 6).
 *   Returns sessionAssets + 6 assembled panels + choiceSet
 *
 * @param input.mode    - "normal" | "interactive"
 * @param input.premise - User's 2–3 sentence story premise
 * @param input.vibe    - Vibe/genre string
 */
export async function generateInitialComic(
  input: GenerateInitialComicInput
): Promise<GenerateInitialComicOutput> {
  const { mode, premise, vibe } = input;

  let storyBible: StoryBible;
  let styleGuide: StyleGuide;
  let characterSheets: CharacterSheet[];
  let worldState: WorldState;
  let choiceSet: ChoiceSet | undefined;
  let panelOutline: Parameters<typeof writePanels>[1];

  if (mode === "normal") {
    const directorOutput = await directorInitialNormal(premise, vibe);
    storyBible = directorOutput.storyBible;
    styleGuide = directorOutput.styleGuide;
    characterSheets = directorOutput.characterSheets;
    panelOutline = directorOutput.panelOutline;

    // Minimal static worldState for normal mode (used by Continuity only)
    worldState = {
      currentLocation: storyBible.setting.split(".")[0] ?? "unknown",
      flags: {},
      inventory: [],
      relationshipDeltas: {},
      narrativeSummary: storyBible.arcSummary,
      lastPanelIndex: 0,
    };
    choiceSet = undefined;
  } else {
    const directorOutput = await directorInitialInteractive(premise, vibe);
    storyBible = directorOutput.storyBible;
    styleGuide = directorOutput.styleGuide;
    characterSheets = directorOutput.characterSheets;
    panelOutline = directorOutput.panelOutline;
    worldState = directorOutput.worldState;
    choiceSet = directorOutput.choiceSet;
  }

  // Writer → Continuity → ArtDirector
  const panels = await runScenePipeline(
    storyBible,
    styleGuide,
    characterSheets,
    panelOutline,
    worldState
  );

  // Update worldState to reflect panels generated
  const finalWorldState: WorldState = {
    ...worldState,
    lastPanelIndex: panels.length,
  };

  return {
    sessionAssets: {
      storyBible,
      styleGuide,
      characterSheets,
      worldState: finalWorldState,
    },
    panels,
    choiceSet,
  };
}

// ---------------------------------------------------------------------------
// generateNextPanelsFromChoice
// ---------------------------------------------------------------------------

/**
 * Generate 1–2 new panels after the reader selects a choice in interactive mode.
 *
 * Pipeline:
 *   1. DirectorAfterEvent(choice event) → updated worldState, nextSceneGoal, choiceSet?
 *   2. Writer(nextSceneGoal, 1–2 panels)
 *   3. ContinuityAgent → fixed scripts
 *   4. ArtDirectorAgent → image prompts
 *
 * @param input.storyBible      - Session story bible
 * @param input.styleGuide      - Session style guide
 * @param input.characterSheets - Session character sheets
 * @param input.worldState      - Current world state (before this choice)
 * @param input.choiceId        - The ID of the choice the reader selected
 * @param input.choiceLabel     - Optional human-readable label for the choice
 */
export async function generateNextPanelsFromChoice(
  input: GenerateNextPanelsFromChoiceInput
): Promise<GenerateNextPanelsOutput> {
  const { storyBible, styleGuide, characterSheets, worldState, choiceId, choiceLabel } = input;

  // 1. Director processes the choice event
  const directorOutput = await directorAfterEventInteractive(
    worldState,
    {
      type: "choice",
      payload: { choiceId, choiceLabel: choiceLabel ?? choiceId },
    },
    storyBible
  );

  const { worldState: updatedWorldState, nextSceneGoal, choiceSet } = directorOutput;

  // 2–4. Writer → Continuity → ArtDirector
  const panels = await runScenePipeline(
    storyBible,
    styleGuide,
    characterSheets,
    nextSceneGoal, // string goal → Writer generates 1–2 panels
    updatedWorldState
  );

  // Increment lastPanelIndex
  const finalWorldState: WorldState = {
    ...updatedWorldState,
    lastPanelIndex: worldState.lastPanelIndex + panels.length,
  };

  return {
    worldState: finalWorldState,
    panels,
    choiceSet,
  };
}

// ---------------------------------------------------------------------------
// generateNextPanelsFromUtterance
// ---------------------------------------------------------------------------

/**
 * Generate 1–2 new panels after the reader talks to an NPC in interactive mode.
 *
 * Pipeline:
 *   1. NPCAgent(respond) → replyText, recommendedStateDelta
 *   2. DirectorAfterEvent(voice event + NPC delta) → updated worldState, nextSceneGoal, choiceSet?
 *   3. Writer(nextSceneGoal, 1–2 panels)
 *   4. ContinuityAgent → fixed scripts
 *   5. ArtDirectorAgent → image prompts
 *
 * @param input.storyBible           - Session story bible
 * @param input.styleGuide           - Session style guide
 * @param input.characterSheets      - Session character sheets
 * @param input.worldState           - Current world state
 * @param input.characterId          - ID of the NPC being spoken to
 * @param input.userText             - Transcribed user speech (from Speechmatics)
 * @param input.conversationHistory  - Prior turns in this voice session
 */
export async function generateNextPanelsFromUtterance(
  input: GenerateNextPanelsFromUtteranceInput
): Promise<GenerateNextPanelsFromUtteranceOutput> {
  const {
    storyBible,
    styleGuide,
    characterSheets,
    worldState,
    characterId,
    userText,
    conversationHistory,
  } = input;

  // 1. Find the target character
  const characterSheet = characterSheets.find((c) => c.id === characterId);
  if (!characterSheet) {
    throw new Error(
      `Character "${characterId}" not found in characterSheets. ` +
        `Available: ${characterSheets.map((c) => c.id).join(", ")}`
    );
  }

  // 2. NPC responds
  const npcOutput = await respond(
    characterSheet,
    worldState,
    userText,
    conversationHistory
  );

  // 3. Director processes the voice event (includes NPC's state delta suggestion)
  const directorOutput = await directorAfterEventInteractive(
    worldState,
    {
      type: "voice",
      payload: {
        characterId,
        userText,
        npcReplyText: npcOutput.replyText,
        recommendedStateDelta: npcOutput.recommendedStateDelta,
      },
    },
    storyBible
  );

  const { worldState: updatedWorldState, nextSceneGoal, choiceSet } = directorOutput;

  // 4–6. Writer → Continuity → ArtDirector
  const panels = await runScenePipeline(
    storyBible,
    styleGuide,
    characterSheets,
    nextSceneGoal,
    updatedWorldState
  );

  const finalWorldState: WorldState = {
    ...updatedWorldState,
    lastPanelIndex: worldState.lastPanelIndex + panels.length,
  };

  return {
    worldState: finalWorldState,
    npcReplyText: npcOutput.replyText,
    panels,
    choiceSet,
  };
}
