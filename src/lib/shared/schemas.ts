/**
 * Zod schemas for StoryQuest.
 * All agent JSON outputs MUST be validated against these schemas before use.
 * FROZEN — coordinate with all agents before changing.
 *
 * Schema shapes mirror src/lib/shared/types.ts exactly.
 */

import { z } from "zod";

// ──────────────────────────────────────────────
// Primitives
// ──────────────────────────────────────────────

export const StoryModeSchema = z.enum(["normal", "interactive"]);

/** @deprecated Use StoryModeSchema. */
export const ModeSchema = StoryModeSchema;

export const SessionStatusSchema = z.enum(["creating", "ready", "error"]);

export const EventTypeSchema = z.enum(["choice", "voice", "hotspot"]);

export const ConversationRoleSchema = z.enum(["user", "npc"]);

// ──────────────────────────────────────────────
// Sub-objects
// ──────────────────────────────────────────────

export const ProgressStateSchema = z.object({
  stage: z.string(),
  detail: z.string(),
});

export const DialogueLineSchema = z.object({
  speaker: z.string().min(1),
  text: z.string().min(1).max(200),
});

export const PanelScriptSchema = z.object({
  scene: z.string().min(1),
  dialogue: z
    .array(DialogueLineSchema)
    .max(2, "Max 2 dialogue bubbles per panel"),
  camera: z.string().min(1),
});

export const CharacterSheetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  appearance: z.string().min(1),
  constraints: z.array(z.string()),
  signatureProps: z.array(z.string()),
});

export const StoryBibleSchema = z.object({
  genre: z.string().min(1),
  vibe: z.string().min(1),
  setting: z.string().min(1),
  rules: z.array(z.string()),
  characterList: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
    })
  ),
  relationships: z.array(
    z.object({ from: z.string(), to: z.string(), description: z.string() })
  ),
  toneGuardrails: z.array(z.string()),
});

export const StyleGuideSchema = z.object({
  lineStyle: z.string().min(1),
  shading: z.string().min(1),
  palette: z.array(z.string()),
  cameraRules: z.array(z.string()),
  notes: z.string().optional(),
});

export const WorldStateSchema = z.object({
  currentLocation: z.string().min(1),
  inventory: z.array(z.string()),
  charactersPresent: z.array(z.string()),
  flags: z.record(z.union([z.boolean(), z.string(), z.number()])),
  plotSummary: z.string(),
});

export const ConversationTurnSchema = z.object({
  role: ConversationRoleSchema,
  text: z.string().min(1),
  ts: z.number().int().positive(),
});

// ──────────────────────────────────────────────
// Core entities
// ──────────────────────────────────────────────

export const PanelDataSchema = z.object({
  panelIndex: z.number().int().nonnegative(),
  pageNumber: z.number().int().positive(),
  script: PanelScriptSchema,
  imagePrompt: z.string().min(1),
  imageUrl: z.string(),
});

/** DB-augmented Panel (includes _id, sessionId, createdAt). */
export const PanelSchema = PanelDataSchema.extend({
  _id: z.string(),
  sessionId: z.string(),
  createdAt: z.number().int().positive(),
});

export const ChoiceOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100),
  consequenceHint: z.string(),
});

export const ChoiceSetSchema = z.object({
  anchorPanelIndex: z.number().int().nonnegative(),
  options: z.array(ChoiceOptionSchema).min(1).max(4),
});

export const SessionViewSchema = z.object({
  _id: z.string(),
  premise: z.string().min(1),
  vibe: z.string().min(1),
  mode: StoryModeSchema,
  status: SessionStatusSchema,
  progress: ProgressStateSchema,
  storyBible: StoryBibleSchema.nullable(),
  styleGuide: StyleGuideSchema.nullable(),
  characterSheets: z.array(CharacterSheetSchema).nullable(),
  worldState: WorldStateSchema.nullable(),
  createdAt: z.number().int().positive(),
});

// ──────────────────────────────────────────────
// Agent output schemas (strict JSON I/O)
// ──────────────────────────────────────────────

/** Output of StoryDirectorAgent (normal mode) */
export const DirectorOutputNormalSchema = z.object({
  storyBible: StoryBibleSchema,
  styleGuide: StyleGuideSchema,
  characterSheets: z.array(CharacterSheetSchema).min(1),
  panelOutline: z
    .array(z.string())
    .length(6, "Normal mode requires exactly 6 panel beats"),
});

/** Output of StoryDirectorAgent (interactive mode) */
export const DirectorOutputInteractiveSchema = DirectorOutputNormalSchema.extend(
  {
    initialWorldState: WorldStateSchema,
    choices: z
      .array(ChoiceOptionSchema)
      .length(2, "Interactive mode requires exactly 2 initial choices"),
  }
);

/** Output of SceneWriterAgent — one entry per panel */
export const SceneWriterOutputSchema = z.object({
  panels: z
    .array(
      z.object({
        panelIndex: z.number().int().nonnegative(),
        script: PanelScriptSchema,
      })
    )
    .min(1),
});

/** Output of ArtDirectorAgent — one entry per panel */
export const ArtDirectorOutputSchema = z.object({
  panels: z.array(
    z.object({
      panelIndex: z.number().int().nonnegative(),
      imagePrompt: z.string().min(10),
    })
  ),
});

/** Output of ContinuityAgent */
export const ContinuityOutputSchema = z.object({
  status: z.enum(["OK", "ISSUES_FOUND"]),
  issues: z.array(z.string()),
  correctedPanels: z
    .array(
      z.object({
        panelIndex: z.number().int().nonnegative(),
        script: PanelScriptSchema,
      })
    )
    .optional(),
});

/** Output of NPCCharacterAgent */
export const NPCOutputSchema = z.object({
  replyText: z.string().min(1).max(300),
  stateDelta: z.object({
    flagUpdates: z
      .record(z.union([z.boolean(), z.string(), z.number()]))
      .optional(),
    inventoryAdd: z.array(z.string()).optional(),
    inventoryRemove: z.array(z.string()).optional(),
    locationChange: z.string().optional(),
    nextSceneGoal: z.string().optional(),
  }),
});

// ──────────────────────────────────────────────
// API request / response schemas
// ──────────────────────────────────────────────

export const CreateSessionRequestSchema = z.object({
  mode: StoryModeSchema,
  premise: z.string().min(10).max(1000),
  vibe: z.string().min(1).max(50),
});

export const GetSessionRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const GetSessionResponseSchema = z.object({
  session: SessionViewSchema,
  panels: z.array(PanelSchema),
  choiceSet: ChoiceSetSchema.optional(),
});

export const StartGenerationRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const SubmitChoiceRequestSchema = z.object({
  sessionId: z.string().min(1),
  choiceId: z.string().min(1),
});

export const SubmitUtteranceRequestSchema = z.object({
  sessionId: z.string().min(1),
  characterId: z.string().min(1),
  text: z.string().min(1).max(500),
});

// ──────────────────────────────────────────────
// Convenience type exports (inferred from schemas)
// ──────────────────────────────────────────────

export type DirectorOutputNormal = z.infer<typeof DirectorOutputNormalSchema>;
export type DirectorOutputInteractive = z.infer<
  typeof DirectorOutputInteractiveSchema
>;
export type SceneWriterOutput = z.infer<typeof SceneWriterOutputSchema>;
export type ArtDirectorOutput = z.infer<typeof ArtDirectorOutputSchema>;
export type ContinuityOutput = z.infer<typeof ContinuityOutputSchema>;
export type NPCOutput = z.infer<typeof NPCOutputSchema>;

// ════════════════════════════════════════════════════════════════════════════
// AGENT I/O SCHEMAS — Agent 2 (Pipeline / LLM agents)
// These are the richer types used inside the generation pipeline.
// They differ from the DB-layer types above in field naming and granularity.
// ════════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────
// Agent-layer StoryBible (richer than DB layer)
// ──────────────────────────────────────────────

export const AgentStoryBibleSchema = z.object({
  title: z.string().min(1),
  genre: z.string().min(1),
  vibe: z.string().min(1),
  setting: z.string().min(1),
  rules: z.array(z.string()),
  relationships: z.array(z.string()),
  toneGuardrails: z.array(z.string()),
  centralConflict: z.string(),
  arcSummary: z.string(),
});

export type StoryBible = z.infer<typeof AgentStoryBibleSchema>;

// ──────────────────────────────────────────────
// Agent-layer StyleGuide (richer than DB layer)
// ──────────────────────────────────────────────

export const AgentStyleGuideSchema = z.object({
  lineStyle: z.string().min(1),
  shadingStyle: z.string().min(1),
  palette: z.string().min(1),
  cameraRules: z.string().min(1),
  artStyle: z.string().min(1),
  additionalNotes: z.string().optional(),
});

export type StyleGuide = z.infer<typeof AgentStyleGuideSchema>;

// ──────────────────────────────────────────────
// Agent-layer CharacterSheet (richer than DB layer)
// ──────────────────────────────────────────────

export const AgentCharacterSheetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  appearance: z.string().min(1),
  doNotChange: z.array(z.string()),
  personality: z.string(),
  signatureProps: z.array(z.string()),
  role: z.enum(["protagonist", "antagonist", "supporting", "npc"]),
});

export type CharacterSheet = z.infer<typeof AgentCharacterSheetSchema>;

// ──────────────────────────────────────────────
// Agent-layer WorldState (richer than DB layer)
// ──────────────────────────────────────────────

export const AgentWorldStateSchema = z.object({
  currentLocation: z.string().min(1),
  flags: z.record(z.union([z.boolean(), z.string(), z.number()])),
  inventory: z.array(z.string()),
  relationshipDeltas: z.record(z.number()),
  narrativeSummary: z.string(),
  lastPanelIndex: z.number().int().nonnegative(),
});

export type WorldState = z.infer<typeof AgentWorldStateSchema>;

// ──────────────────────────────────────────────
// Panel beat outline (Director → Writer)
// ──────────────────────────────────────────────

export const PanelBeatSchema = z.object({
  panelIndex: z.number().int().positive(),
  beat: z.string().min(1),
  characters: z.array(z.string()),
  location: z.string(),
  emotionalTone: z.string(),
});

export const PanelOutlineSchema = z.array(PanelBeatSchema);
export type PanelOutline = z.infer<typeof PanelOutlineSchema>;

// ──────────────────────────────────────────────
// Panel scripts (Writer output / Continuity I/O)
// ──────────────────────────────────────────────

export const AgentDialogueBubbleSchema = z.object({
  speaker: z.string().min(1),
  text: z.string().min(1).max(200),
  type: z.enum(["speech", "thought", "caption"]),
});

export const AgentPanelScriptSchema = z.object({
  panelIndex: z.number().int().positive(),
  sceneDescription: z.string().min(1),
  dialogue: z.array(AgentDialogueBubbleSchema).max(2),
  camera: z.string().min(1),
  characters: z.array(z.string()),
  location: z.string(),
});

export const PanelScriptsSchema = z.array(AgentPanelScriptSchema);
export type PanelScripts = z.infer<typeof PanelScriptsSchema>;

// ──────────────────────────────────────────────
// Continuity agent I/O
// ──────────────────────────────────────────────

export const ContinuityIssueSchema = z.object({
  panelIndex: z.number().int().positive(),
  issue: z.string(),
  severity: z.enum(["minor", "major"]),
});

export const ContinuityResultSchema = z.object({
  status: z.enum(["ok", "fixed"]),
  issues: z.array(ContinuityIssueSchema),
  scripts: PanelScriptsSchema,
});

export type ContinuityResult = z.infer<typeof ContinuityResultSchema>;

// ──────────────────────────────────────────────
// Art Director image prompts
// ──────────────────────────────────────────────

export const PanelImagePromptItemSchema = z.object({
  panelIndex: z.number().int().positive(),
  imagePrompt: z.string().min(10),
  negativePrompt: z.string(),
});

export const PanelImagePromptsSchema = z.array(PanelImagePromptItemSchema);
export type PanelImagePrompts = z.infer<typeof PanelImagePromptsSchema>;

// ──────────────────────────────────────────────
// Director output schemas (agent layer)
// ──────────────────────────────────────────────

export const AgentChoiceSetSchema = z.object({
  panelIndexAnchor: z.number().int().nonnegative(),
  options: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1).max(80),
      consequenceHint: z.string(),
    })
  ).min(1).max(3),
  prompt: z.string().max(120),
});

export type ChoiceSet = z.infer<typeof AgentChoiceSetSchema>;

export const DirectorInitialNormalOutputSchema = z.object({
  storyBible: AgentStoryBibleSchema,
  styleGuide: AgentStyleGuideSchema,
  characterSheets: z.array(AgentCharacterSheetSchema).min(1),
  panelOutline: PanelOutlineSchema.length(6),
});

export type DirectorInitialNormalOutput = z.infer<typeof DirectorInitialNormalOutputSchema>;

export const DirectorInitialInteractiveOutputSchema =
  DirectorInitialNormalOutputSchema.extend({
    worldState: AgentWorldStateSchema,
    choiceSet: AgentChoiceSetSchema,
  });

export type DirectorInitialInteractiveOutput = z.infer<
  typeof DirectorInitialInteractiveOutputSchema
>;

export const DirectorAfterEventOutputSchema = z.object({
  worldState: AgentWorldStateSchema,
  nextSceneGoal: z.string().min(1),
  choiceSet: AgentChoiceSetSchema.optional(),
});

export type DirectorAfterEventOutput = z.infer<typeof DirectorAfterEventOutputSchema>;

// ──────────────────────────────────────────────
// NPC response
// ──────────────────────────────────────────────

export const NpcStateDeltaSchema = z.object({
  flags: z.record(z.union([z.boolean(), z.string(), z.number()])).optional(),
  inventory: z.array(z.string()).optional(),
  relationshipDeltas: z.record(z.number()).optional(),
  narrativeSummaryAppend: z.string().optional(),
});

export const NpcResponseSchema = z.object({
  replyText: z.string().min(1).max(600),
  recommendedStateDelta: NpcStateDeltaSchema,
});

export type NpcResponse = z.infer<typeof NpcResponseSchema>;

// ──────────────────────────────────────────────
// Assembled panel (pipeline output — script + image prompt, no URL yet)
// ──────────────────────────────────────────────

export const AssembledPanelSchema = z.object({
  panelIndex: z.number().int().positive(),
  script: AgentPanelScriptSchema,
  imagePrompt: z.string(),
  negativePrompt: z.string().optional(),
});

export type AssembledPanel = z.infer<typeof AssembledPanelSchema>;

// ──────────────────────────────────────────────
// Pipeline I/O types
// ──────────────────────────────────────────────

export interface SessionAssets {
  storyBible: StoryBible;
  styleGuide: StyleGuide;
  characterSheets: CharacterSheet[];
  worldState: WorldState;
}

export interface GenerateInitialComicInput {
  mode: "normal" | "interactive";
  premise: string;
  vibe: string;
}

export interface GenerateInitialComicOutput {
  sessionAssets: SessionAssets;
  panels: AssembledPanel[];
  choiceSet?: ChoiceSet;
}

export interface GenerateNextPanelsFromChoiceInput {
  storyBible: StoryBible;
  styleGuide: StyleGuide;
  characterSheets: CharacterSheet[];
  worldState: WorldState;
  choiceId: string;
  choiceLabel?: string;
}

export interface GenerateNextPanelsOutput {
  worldState: WorldState;
  panels: AssembledPanel[];
  choiceSet?: ChoiceSet;
}

export interface GenerateNextPanelsFromUtteranceInput {
  storyBible: StoryBible;
  styleGuide: StyleGuide;
  characterSheets: CharacterSheet[];
  worldState: WorldState;
  characterId: string;
  userText: string;
  conversationHistory: Array<{ role: "user" | "npc"; text: string; ts: number }>;
}

export interface GenerateNextPanelsFromUtteranceOutput {
  worldState: WorldState;
  npcReplyText: string;
  panels: AssembledPanel[];
  choiceSet?: ChoiceSet;
}
