/**
 * ContinuityAgent — StoryQuest
 *
 * Reviews panel scripts against the story bible (and optional world state) to
 * catch and fix continuity errors before image prompts are generated.
 *
 * Checks performed:
 *   - Location consistency (characters can't teleport between adjacent panels)
 *   - Props / inventory (items must be in possession before appearing)
 *   - Character presence (characters not yet introduced shouldn't appear)
 *   - Causality (events must follow from prior panels)
 *   - Tone guardrails (no violations of storyBible.toneGuardrails)
 *   - Dialogue constraints (≤20 words per bubble, ≤2 per panel)
 *
 * Exports:
 *   checkAndFix(storyBible, worldState?, scripts) → ContinuityResult
 *     - status: "ok" | "fixed"
 *     - issues: list of issues found (may be empty)
 *     - scripts: corrected scripts (identical to input when status = "ok")
 */

import { minimaxChat, jsObject, jsString, jsArray, jsNumber, jsEnum } from "@/lib/llm/minimax";
import {
  ContinuityResultSchema,
  type ContinuityResult,
  type StoryBible,
  type PanelScripts,
  type WorldState,
} from "@/lib/shared/schemas";

// ---------------------------------------------------------------------------
// JSON Schema
// ---------------------------------------------------------------------------

const continuityIssueJsonSchema = jsObject({
  panelIndex: jsNumber("The panel where the issue occurs"),
  issue: jsString("Short description of the continuity problem"),
  severity: jsEnum(["minor", "major"]),
});

const dialogueBubbleJsonSchema = jsObject({
  speaker: jsString("Character ID"),
  text: jsString("Corrected dialogue text, max 20 words"),
  type: jsEnum(["speech", "thought", "caption"]),
});

const panelScriptJsonSchema = jsObject({
  panelIndex: jsNumber(),
  sceneDescription: jsString(),
  dialogue: jsArray(dialogueBubbleJsonSchema),
  camera: jsString(),
  characters: jsArray(jsString()),
  location: jsString(),
});

const continuityResultJsonSchema = jsObject({
  status: jsEnum(["ok", "fixed"]),
  issues: jsArray(continuityIssueJsonSchema, "List of issues found (empty if none)"),
  scripts: jsArray(panelScriptJsonSchema, "Corrected scripts (same shape as input)"),
});

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const CONTINUITY_SYSTEM = `\
You are the ContinuityAgent for StoryQuest. Your job is to review a sequence of
comic panel scripts and fix any continuity errors before they reach the image generator.

You receive:
- A story bible (canonical rules, characters, setting)
- The current world state (optional — provided for interactive mode)
- The panel scripts to review

Check for:
1. Location jumps: characters can't be in two places at once between adjacent panels.
2. Props/inventory: items must exist in the story before they appear.
3. Character presence: characters shouldn't appear before they're introduced.
4. Causality: events must follow logically from previous panels.
5. Tone violations: check against toneGuardrails.
6. Dialogue constraints: max 20 words per bubble, max 2 bubbles per panel.
   Truncate or rephrase any over-limit dialogue.

Output: strict JSON with:
- status: "ok" if no changes needed, "fixed" if you made corrections.
- issues: array of issues found (can be empty).
- scripts: the FULL scripts array — corrected if needed, unchanged if ok.

IMPORTANT: Return ALL scripts in the output, not just the changed ones.
Do not remove or add panels.`;

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/**
 * Check panel scripts for continuity errors and return corrected scripts.
 *
 * @param storyBible - Session story bible
 * @param worldState - Optional world state (interactive mode only)
 * @param scripts    - Panel scripts from the writer
 * @returns ContinuityResult with status, issues list, and (corrected) scripts
 */
export async function checkAndFix(
  storyBible: StoryBible,
  worldState: WorldState | undefined,
  scripts: PanelScripts
): Promise<ContinuityResult> {
  const worldStateSection = worldState
    ? `\nCurrent World State:\n${JSON.stringify(worldState, null, 2)}`
    : "";

  const user = [
    `Story Bible:`,
    `  Title: ${storyBible.title}`,
    `  Setting: ${storyBible.setting}`,
    `  Rules: ${storyBible.rules.join("; ")}`,
    `  Tone Guardrails: ${storyBible.toneGuardrails.join("; ")}`,
    `  Characters: ${storyBible.rules.join(", ")}`,
    worldStateSection,
    ``,
    `Panel Scripts to Review:`,
    JSON.stringify(scripts, null, 2),
    ``,
    `Review and fix any issues. Return the full scripts array.`,
  ].join("\n");

  return minimaxChat({
    system: CONTINUITY_SYSTEM,
    user,
    jsonSchema: continuityResultJsonSchema,
    parse: (raw) => ContinuityResultSchema.parse(raw),
    maxTokens: 3500,
    temperature: 0.3, // Low temperature for deterministic, precise corrections
  });
}
