/**
 * SceneWriterAgent — StoryQuest
 *
 * Converts a panel outline (or a free-form scene goal) into fully-fledged
 * panel scripts: scene description, dialogue, and camera framing notes.
 *
 * The writer deliberately produces NO image prompts — those are handled
 * separately by the ArtDirectorAgent so that text and visuals stay decoupled.
 *
 * Exports:
 *   writePanels(storyBible, panelOutlineOrGoal, worldState?)
 *     → PanelScript[] (one per beat, or 1–2 for incremental interactive panels)
 *
 * Dialogue quality rules (enforced by prompt + Zod):
 *   - max 20 words per bubble
 *   - max 2 bubbles per panel
 *   - UI overlays bubbles; do NOT embed text in scene description
 */

import { minimaxChat, jsObject, jsString, jsArray, jsNumber, jsEnum } from "@/lib/llm/minimax";
import {
  PanelScriptsSchema,
  type PanelScripts,
  type StoryBible,
  type PanelOutline,
  type WorldState,
} from "@/lib/shared/schemas";

// ---------------------------------------------------------------------------
// JSON Schema
// ---------------------------------------------------------------------------

const dialogueBubbleJsonSchema = jsObject({
  speaker: jsString("Must match a CharacterSheet.id"),
  text: jsString("Dialogue text — max 20 words, plain text only, no stage directions"),
  type: jsEnum(["speech", "thought", "caption"]),
});

const panelScriptJsonSchema = jsObject({
  panelIndex: jsNumber("1-based panel index"),
  sceneDescription: jsString(
    "1–3 sentences describing the visual scene for the artist. NO dialogue text here."
  ),
  dialogue: jsArray(dialogueBubbleJsonSchema, "0–2 dialogue bubbles"),
  camera: jsString("Shot type + framing, e.g. 'medium two-shot from slight low angle'"),
  characters: jsArray(jsString(), "Character IDs that appear in this panel"),
  location: jsString("Location identifier matching the storyBible"),
});

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const WRITER_SYSTEM = `\
You are the SceneWriterAgent for StoryQuest, an agentic comic-story platform.
You receive a story bible and a panel outline (or a free-form scene goal) and produce
tight, film-style panel scripts for a comic artist.

Output: strict JSON array of panel scripts. No prose outside the JSON.

Panel script rules (MUST follow):
1. sceneDescription: 1–3 sentences, purely visual, no spoken words.
2. dialogue: max 2 bubbles per panel; each bubble max 20 words.
   - 'speech' for spoken dialogue
   - 'thought' for internal monologue  
   - 'caption' for narration boxes (speaker = "narrator")
3. camera: be specific — "close-up on hands", "wide establishing shot", "over-shoulder medium shot".
4. characters: list only the character IDs actually visible.
5. DO NOT embed dialogue text inside sceneDescription.
6. Keep each panel self-contained but narratively connected to its neighbours.
7. Honour the storyBible's toneGuardrails at all times.`;

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/**
 * Generate panel scripts from a panel outline or a free-form scene goal.
 *
 * @param storyBible         - Session story bible (for tone, characters, lore)
 * @param panelOutlineOrGoal - Either a structured PanelOutline (6 beats for initial page)
 *                             or a plain string goal (for incremental interactive panels)
 * @param worldState         - Optional; passed for interactive mode continuity
 * @returns Array of PanelScript objects (6 for initial page, 1–2 for incremental)
 */
export async function writePanels(
  storyBible: StoryBible,
  panelOutlineOrGoal: PanelOutline | string,
  worldState?: WorldState
): Promise<PanelScripts> {
  const isGoalString = typeof panelOutlineOrGoal === "string";

  const outlineSection = isGoalString
    ? `Scene goal (generate 1–2 panels):\n${panelOutlineOrGoal}`
    : `Panel outline (generate exactly ${panelOutlineOrGoal.length} panels):\n${JSON.stringify(panelOutlineOrGoal, null, 2)}`;

  const worldStateSection = worldState
    ? `\nCurrent world state:\n${JSON.stringify(worldState, null, 2)}`
    : "";

  const user = [
    `Story Bible:`,
    `  Title: ${storyBible.title}`,
    `  Setting: ${storyBible.setting}`,
    `  Central Conflict: ${storyBible.centralConflict}`,
    `  Arc Summary: ${storyBible.arcSummary}`,
    `  Rules: ${storyBible.rules.join("; ")}`,
    `  Tone Guardrails: ${storyBible.toneGuardrails.join("; ")}`,
    worldStateSection,
    ``,
    outlineSection,
    ``,
    `Write panel scripts as a strict JSON array.`,
  ].join("\n");

  const jsonSchema = jsArray(panelScriptJsonSchema, "Array of panel scripts");

  return minimaxChat({
    system: WRITER_SYSTEM,
    user,
    jsonSchema,
    parse: (raw) => PanelScriptsSchema.parse(raw),
    maxTokens: 3000,
    temperature: 0.7,
  });
}
