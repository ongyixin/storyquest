/**
 * StoryDirectorAgent — StoryQuest
 *
 * The Director is the first agent in every pipeline run. It reads the user's
 * premise + vibe and builds the narrative skeleton that every downstream agent
 * depends on.
 *
 * Exports:
 *   directorInitialNormal(premise, vibe)
 *     → { storyBible, styleGuide, characterSheets, panelOutline }
 *
 *   directorInitialInteractive(premise, vibe)
 *     → { storyBible, styleGuide, characterSheets, panelOutline, worldState, choiceSet }
 *
 *   directorAfterEventInteractive(worldState, event, storyBible)
 *     → { worldState, nextSceneGoal, choiceSet? }
 */

import { minimaxChat, jsObject, jsString, jsArray, jsNumber, jsEnum } from "@/lib/llm/minimax";
import {
  DirectorInitialNormalOutputSchema,
  DirectorInitialInteractiveOutputSchema,
  DirectorAfterEventOutputSchema,
  type DirectorInitialNormalOutput,
  type DirectorInitialInteractiveOutput,
  type DirectorAfterEventOutput,
  type StoryBible,
  type WorldState,
} from "@/lib/shared/schemas";

// ---------------------------------------------------------------------------
// JSON Schemas for MiniMax structured output
// ---------------------------------------------------------------------------

const characterSheetJsonSchema = jsObject({
  id: jsString("Stable snake_case identifier, e.g. 'hero' or 'villain_lord'"),
  name: jsString("Display name"),
  appearance: jsString("One-paragraph visual description for image prompts"),
  doNotChange: jsArray(jsString(), "Hard constraints — must stay consistent across all panels"),
  personality: jsString("1–3 sentence personality description"),
  signatureProps: jsArray(jsString(), "Signature accessories or props"),
  role: jsEnum(["protagonist", "antagonist", "supporting", "npc"]),
});

const storyBibleJsonSchema = jsObject({
  title: jsString("Short working title"),
  genre: jsString(),
  vibe: jsString(),
  setting: jsString("Two-paragraph world overview"),
  rules: jsArray(jsString(), "Core narrative rules that must hold across all panels"),
  relationships: jsArray(jsString(), "'CharA → CharB: description' strings"),
  toneGuardrails: jsArray(jsString(), "E.g. 'never break 4th wall'"),
  centralConflict: jsString(),
  arcSummary: jsString("Rough 3-act arc in 2–3 sentences"),
});

const styleGuideJsonSchema = jsObject({
  lineStyle: jsString("E.g. 'clean ink lines, no crosshatching'"),
  shadingStyle: jsString("E.g. 'cel-shaded, flat colours'"),
  palette: jsString("E.g. 'muted blues and teals, neon orange accents'"),
  cameraRules: jsString("E.g. 'medium shots dominate; close-up for emotion beats'"),
  artStyle: jsString("E.g. 'manga', 'western comic', 'graphic novel noir'"),
  additionalNotes: jsString("Any extra notes"),
});

const panelBeatJsonSchema = jsObject({
  panelIndex: jsNumber("1-based panel index"),
  beat: jsString("One sentence: what happens in this beat"),
  characters: jsArray(jsString(), "Character IDs present"),
  location: jsString("Location identifier"),
  emotionalTone: jsString("Emotional tone of this panel"),
});

const panelOutlineJsonSchema = jsArray(panelBeatJsonSchema, "Exactly 6 panel beats");

const worldStateJsonSchema = jsObject({
  currentLocation: jsString("Current location identifier"),
  flags: jsObject({}, [], "Key-value story variables"),
  inventory: jsArray(jsString(), "Item IDs the visitor holds"),
  relationshipDeltas: jsObject({}, [], "Character ID → relationship delta number"),
  narrativeSummary: jsString("Prose summary of story state so far"),
  lastPanelIndex: jsNumber("1-based index of the last panel generated (use 0 for initial)"),
});

const choiceSetJsonSchema = jsObject({
  panelIndexAnchor: jsNumber("Index of the last panel these choices follow"),
  options: jsArray(
    jsObject({
      id: jsString("Unique choice ID, e.g. 'choice_a'"),
      label: jsString("Short button label, max 80 chars"),
      consequenceHint: jsString("One-sentence hint for how this choice affects the world"),
    }),
    "2–3 choices"
  ),
  prompt: jsString("Question or prompt shown above the choices, max 120 chars"),
});

// ---------------------------------------------------------------------------
// Normal mode (no persistent state, no choices)
// ---------------------------------------------------------------------------

const DIRECTOR_SYSTEM_NORMAL = `\
You are the StoryDirectorAgent for StoryQuest, an agentic comic-story platform.
Your job is to transform a user's short premise into a coherent story skeleton for a 6-panel comic page.

Output requirements (strict JSON, no prose outside the JSON):
- storyBible: the world, characters, rules, arc — the single source of truth for all agents.
- styleGuide: one consistent visual look for the entire comic.
- characterSheets: 2–4 characters max; include appearance anchors that NEVER change between panels.
- panelOutline: exactly 6 beats, each driving the story forward.

Quality rules:
- Panels must form a self-contained story with a beginning, middle and satisfying end.
- Keep genre and vibe consistent throughout.
- Character appearances must be specific enough that an image model can stay consistent.
- No text-in-image instructions — dialogue is handled separately.`;

/**
 * Generate the full story skeleton for a NORMAL (read-only) comic.
 *
 * @param premise - User's 2–3 sentence story premise
 * @param vibe    - Vibe/genre string (e.g. "epic-fantasy", "cyberpunk")
 * @returns storyBible, styleGuide, characterSheets, panelOutline (6 beats)
 */
export async function directorInitialNormal(
  premise: string,
  vibe: string
): Promise<DirectorInitialNormalOutput> {
  const jsonSchema = jsObject({
    storyBible: storyBibleJsonSchema,
    styleGuide: styleGuideJsonSchema,
    characterSheets: jsArray(characterSheetJsonSchema, "2–4 main characters"),
    panelOutline: panelOutlineJsonSchema,
  });

  return minimaxChat({
    system: DIRECTOR_SYSTEM_NORMAL,
    user: `Premise: ${premise}\nVibe: ${vibe}\n\nGenerate the story skeleton as strict JSON.`,
    jsonSchema,
    parse: (raw) => DirectorInitialNormalOutputSchema.parse(raw),
    maxTokens: 4096,
    temperature: 0.8,
  });
}

// ---------------------------------------------------------------------------
// Interactive mode (adds persistent worldState + initial choices)
// ---------------------------------------------------------------------------

const DIRECTOR_SYSTEM_INTERACTIVE = `\
You are the StoryDirectorAgent for StoryQuest in INTERACTIVE mode.
Your job is to transform a user's short premise into a coherent story skeleton for a 6-panel comic page
that the reader can actively influence.

Output requirements (strict JSON, no prose outside the JSON):
- storyBible, styleGuide, characterSheets, panelOutline: same as normal mode.
- worldState: the initial world state — location, flags, inventory, relationships, narrative summary.
  Set lastPanelIndex to 0 (no panels generated yet).
- choiceSet: two meaningful choices the reader can make AFTER the first page,
  each with a clear consequence hint. panelIndexAnchor should be 6.

Quality rules:
- Both choices must be genuinely different (not just cosmetically different).
- The worldState must be detailed enough to guide future Director calls.
- Character appearances must be specific enough for cross-panel consistency.
- No text-in-image instructions.`;

/**
 * Generate the full story skeleton for an INTERACTIVE comic (with choices + worldState).
 *
 * @param premise - User's 2–3 sentence story premise
 * @param vibe    - Vibe/genre string
 * @returns storyBible, styleGuide, characterSheets, panelOutline, worldState, choiceSet
 */
export async function directorInitialInteractive(
  premise: string,
  vibe: string
): Promise<DirectorInitialInteractiveOutput> {
  const jsonSchema = jsObject({
    storyBible: storyBibleJsonSchema,
    styleGuide: styleGuideJsonSchema,
    characterSheets: jsArray(characterSheetJsonSchema, "2–4 main characters"),
    panelOutline: panelOutlineJsonSchema,
    worldState: worldStateJsonSchema,
    choiceSet: choiceSetJsonSchema,
  });

  return minimaxChat({
    system: DIRECTOR_SYSTEM_INTERACTIVE,
    user: `Premise: ${premise}\nVibe: ${vibe}\n\nGenerate the interactive story skeleton as strict JSON.`,
    jsonSchema,
    parse: (raw) => DirectorInitialInteractiveOutputSchema.parse(raw),
    maxTokens: 5000,
    temperature: 0.8,
  });
}

// ---------------------------------------------------------------------------
// After-event update (interactive mode — called after choice / voice / hotspot)
// ---------------------------------------------------------------------------

const DIRECTOR_AFTER_EVENT_SYSTEM = `\
You are the StoryDirectorAgent for StoryQuest handling a story event in INTERACTIVE mode.
The reader has taken an action. Your job is to:
1. Update the worldState to reflect the consequence of the event.
2. Write a nextSceneGoal — a 2–4 sentence prose description of what should happen in the next 1–2 panels.
3. Optionally provide a new choiceSet for after the next panels (omit if the story should resolve).

Output requirements (strict JSON, no prose outside the JSON):
- worldState: updated worldState (increment lastPanelIndex by the number of new panels, typically 2).
- nextSceneGoal: prose goal for the SceneWriterAgent.
- choiceSet (optional): new choices for the reader, or omit if the arc is complete.

Quality rules:
- Be consistent with the storyBible — do not introduce new major characters or settings.
- The nextSceneGoal should follow naturally from the event and the current worldState.
- Keep the tone consistent with the storyBible's toneGuardrails.`;

interface StoryEvent {
  type: "choice" | "voice" | "hotspot";
  /** For 'choice': the selected choiceId and label. For 'voice': the NPC reply + stateDelta. */
  payload: Record<string, unknown>;
}

/**
 * Update world state and plan the next scene after a reader event.
 *
 * @param worldState  - Current persisted world state
 * @param event       - The event that just occurred (choice, voice, hotspot)
 * @param storyBible  - The session's story bible (for consistency)
 * @returns Updated worldState, nextSceneGoal for the writer, optional new choiceSet
 */
export async function directorAfterEventInteractive(
  worldState: WorldState,
  event: StoryEvent,
  storyBible: StoryBible
): Promise<DirectorAfterEventOutput> {
  const jsonSchema = jsObject({
    worldState: worldStateJsonSchema,
    nextSceneGoal: jsString("2–4 sentence prose description of what happens in the next 1–2 panels"),
    choiceSet: {
      ...choiceSetJsonSchema,
      description: "Optional new choice set; omit if story should resolve",
    },
  }, ["worldState", "nextSceneGoal"]);

  const user = [
    `Story Bible Summary: ${storyBible.arcSummary}`,
    `Central Conflict: ${storyBible.centralConflict}`,
    `Current World State:\n${JSON.stringify(worldState, null, 2)}`,
    `Event that just occurred:\n${JSON.stringify(event, null, 2)}`,
    `\nUpdate the world state and plan the next scene as strict JSON.`,
  ].join("\n\n");

  return minimaxChat({
    system: DIRECTOR_AFTER_EVENT_SYSTEM,
    user,
    jsonSchema,
    parse: (raw) => DirectorAfterEventOutputSchema.parse(raw),
    maxTokens: 2048,
    temperature: 0.75,
  });
}
