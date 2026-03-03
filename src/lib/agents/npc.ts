/**
 * NPCCharacterAgent — StoryQuest (Interactive mode only)
 *
 * Handles voice self-insert conversations between the reader and an NPC character.
 * The agent stays in character, responds naturally within the storyBible's world,
 * and recommends state changes that the Director can apply to the worldState.
 *
 * The response text is passed to Vapi for TTS; the recommendedStateDelta is
 * forwarded to directorAfterEventInteractive to update the persistent worldState.
 *
 * Exports:
 *   respond(characterSheet, worldState, userText, conversationHistory)
 *     → { replyText, recommendedStateDelta }
 */

import { minimaxChat, jsObject, jsString, jsArray } from "@/lib/llm/minimax";
import {
  NpcResponseSchema,
  type NpcResponse,
  type CharacterSheet,
  type WorldState,
} from "@/lib/shared/schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationTurn {
  role: "user" | "npc";
  text: string;
  ts: number;
}

// ---------------------------------------------------------------------------
// JSON Schema
// ---------------------------------------------------------------------------

const stateDeltaJsonSchema = jsObject(
  {
    flags: {
      type: "object",
      additionalProperties: { type: ["string", "number", "boolean"] },
      description: "Key-value flags to set or update",
    },
    inventory: jsArray(jsString(), "Items to ADD to inventory (don't list items to remove)"),
    relationshipDeltas: {
      type: "object",
      additionalProperties: { type: "number" },
      description: "Character ID → delta to add to relationship score",
    },
    narrativeSummaryAppend: jsString(
      "One sentence to append to the narrative summary (omit if nothing significant happened)"
    ),
  },
  [] // all optional
);

const npcResponseJsonSchema = jsObject({
  replyText: jsString(
    "The NPC's in-character reply. Conversational, 1–4 sentences. No stage directions."
  ),
  recommendedStateDelta: stateDeltaJsonSchema,
});

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildNpcSystem(character: CharacterSheet): string {
  return `\
You are roleplaying as ${character.name} from a StoryQuest interactive comic.

Character profile:
  Name: ${character.name}
  Role: ${character.role}
  Personality: ${character.personality}
  Signature props: ${character.signatureProps.join(", ")}

You MUST:
- Stay in character at all times. Speak as ${character.name} would.
- Be responsive to the user's words — don't ignore what they said.
- Keep replies short and punchy (1–4 sentences). This is a voice conversation.
- Recommend a state delta ONLY if something significant occurred
  (e.g. user convinced you, revealed information, gave/received an item).

You must NOT:
- Break the 4th wall or mention that you are an AI.
- Reference game mechanics or JSON schemas.
- Invent major new plot points not consistent with the current world state.

Output: strict JSON with replyText and recommendedStateDelta.`;
}

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/**
 * Generate an NPC's in-character reply to the user's voice utterance.
 *
 * @param characterSheet       - The character the user is talking to
 * @param worldState           - Current world state (for context)
 * @param userText             - Transcribed user speech
 * @param conversationHistory  - Prior turns in this conversation session
 * @returns NPC reply text (for Vapi TTS) + recommended state delta (for Director)
 */
export async function respond(
  characterSheet: CharacterSheet,
  worldState: WorldState,
  userText: string,
  conversationHistory: ConversationTurn[]
): Promise<NpcResponse> {
  const historySection =
    conversationHistory.length > 0
      ? conversationHistory
          .slice(-10) // keep last 10 turns to stay within context window
          .map((t) => `${t.role === "user" ? "Visitor" : characterSheet.name}: ${t.text}`)
          .join("\n")
      : "(this is the start of the conversation)";

  const user = [
    `Current location: ${worldState.currentLocation}`,
    `Narrative context: ${worldState.narrativeSummary}`,
    ``,
    `Recent conversation:`,
    historySection,
    ``,
    `Visitor says: "${userText}"`,
    ``,
    `Reply as ${characterSheet.name}. Return strict JSON.`,
  ].join("\n");

  return minimaxChat({
    system: buildNpcSystem(characterSheet),
    user,
    jsonSchema: npcResponseJsonSchema,
    parse: (raw) => NpcResponseSchema.parse(raw),
    maxTokens: 512,
    temperature: 0.85, // Higher for more natural, varied dialogue
  });
}
