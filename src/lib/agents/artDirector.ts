/**
 * ArtDirectorAgent — StoryQuest
 *
 * Converts panel scripts into self-contained image generation prompts that
 * enforce visual consistency across all panels.
 *
 * Key responsibilities:
 *   - Weave the StyleGuide into every prompt (line style, palette, art style)
 *   - Reference CharacterSheet appearance descriptions verbatim
 *   - Omit all dialogue text from image prompts (UI renders bubbles)
 *   - Add a negative prompt hinting to avoid text / watermarks / inconsistency
 *
 * Exports:
 *   makeImagePrompts(styleGuide, characterSheets, scripts) → PanelImagePrompts
 */

import { minimaxChat, jsObject, jsString, jsArray, jsNumber } from "@/lib/llm/minimax";
import {
  PanelImagePromptsSchema,
  type PanelImagePrompts,
  type StyleGuide,
  type CharacterSheet,
  type PanelScripts,
} from "@/lib/shared/schemas";

// ---------------------------------------------------------------------------
// JSON Schema
// ---------------------------------------------------------------------------

const panelImagePromptJsonSchema = jsObject({
  panelIndex: jsNumber("1-based panel index"),
  imagePrompt: jsString(
    "Full, self-contained image generation prompt. Includes style, characters, scene, composition. NO dialogue text."
  ),
  negativePrompt: jsString(
    "What to avoid: text, watermarks, speech bubbles, inconsistent character appearances, etc."
  ),
});

const imagePromptsJsonSchema = jsArray(
  panelImagePromptJsonSchema,
  "One image prompt object per panel"
);

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const ART_DIRECTOR_SYSTEM = `\
You are the ArtDirectorAgent for StoryQuest. Your job is to translate panel scripts
into precise image generation prompts that maintain a consistent visual style
and accurate character appearances across every panel.

You receive:
- A StyleGuide (the session's visual identity)
- CharacterSheets (appearance anchors for each character)
- Panel scripts (scene descriptions + camera notes; dialogue is handled separately by the UI)

Output: strict JSON array of image prompt objects — one per panel.

Image prompt rules (MUST follow):
1. Start every prompt with the art style prefix:
   "[artStyle], [lineStyle], [shadingStyle], [palette]"
2. For each character visible in the panel, include their full appearance description
   from the CharacterSheet. Use the exact wording from doNotChange constraints.
3. Describe the scene composition from the camera note (shot type, angle, framing).
4. Do NOT include any dialogue, speech, or text in the image prompt.
5. Do NOT include watermarks, signatures, or UI elements.
6. End each prompt with: "consistent character design, no text, no speech bubbles"
7. negativePrompt should always include: "text, watermark, speech bubble, inconsistent design,
   deformed anatomy, extra limbs, blurry"

The goal is a comic page where every panel looks like it was drawn by the same artist.`;

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/**
 * Generate image prompts for all panels in a batch.
 *
 * @param styleGuide     - Session style guide (visual identity)
 * @param characterSheets - All character sheets for the session
 * @param scripts         - Continuity-checked panel scripts
 * @returns One PanelImagePrompt per panel (same ordering as input scripts)
 */
export async function makeImagePrompts(
  styleGuide: StyleGuide,
  characterSheets: CharacterSheet[],
  scripts: PanelScripts
): Promise<PanelImagePrompts> {
  const characterIndex = characterSheets
    .map(
      (c) =>
        `${c.id} (${c.name}):\n` +
        `  Appearance: ${c.appearance}\n` +
        `  NEVER change: ${c.doNotChange.join("; ")}\n` +
        `  Signature props: ${c.signatureProps.join(", ")}`
    )
    .join("\n\n");

  const stylePrefix = [
    styleGuide.artStyle,
    styleGuide.lineStyle,
    styleGuide.shadingStyle,
    styleGuide.palette,
    styleGuide.cameraRules,
  ]
    .filter(Boolean)
    .join(", ");

  const user = [
    `Style Guide:`,
    `  Art Style: ${styleGuide.artStyle}`,
    `  Line Style: ${styleGuide.lineStyle}`,
    `  Shading: ${styleGuide.shadingStyle}`,
    `  Palette: ${styleGuide.palette}`,
    `  Camera Rules: ${styleGuide.cameraRules}`,
    styleGuide.additionalNotes ? `  Notes: ${styleGuide.additionalNotes}` : "",
    ``,
    `Style prefix to start every prompt: "${stylePrefix}"`,
    ``,
    `Character Sheets:`,
    characterIndex,
    ``,
    `Panel Scripts:`,
    JSON.stringify(scripts, null, 2),
    ``,
    `Generate one image prompt per panel as a strict JSON array.`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return minimaxChat({
    system: ART_DIRECTOR_SYSTEM,
    user,
    jsonSchema: imagePromptsJsonSchema,
    parse: (raw) => PanelImagePromptsSchema.parse(raw),
    maxTokens: 3000,
    temperature: 0.6,
  });
}
