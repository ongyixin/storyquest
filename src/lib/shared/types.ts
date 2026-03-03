/**
 * Shared contracts / types for StoryQuest.
 * This file is the single source of truth for all data shapes
 * shared between the Convex backend and the Next.js frontend.
 *
 * DO NOT modify field names or types without coordinating across
 * all consumers (convex schema, agent I/O, UI components).
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type StoryMode = "normal" | "interactive";
/** Alias for StoryMode — used in some UI components. */
export type Mode = StoryMode;

export type SessionStatus = "creating" | "ready" | "error";

export type EventType = "choice" | "voice" | "hotspot";

export type ConversationRole = "user" | "npc";

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface ProgressState {
  stage: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Story Bible & Assets
// ---------------------------------------------------------------------------

export interface CharacterSheet {
  /** Unique identifier within this session (e.g. "protagonist", "villain"). */
  id: string;
  name: string;
  /** Full appearance description used in every image prompt. */
  appearance: string;
  /** Constraints that must never change ("always wears red scarf", etc.). */
  constraints: string[];
  /** Signature props / items. */
  signatureProps: string[];
}

export interface StoryBible {
  genre: string;
  vibe: string;
  setting: string;
  /** World rules / constraints (magic system, tone guardrails, etc.). */
  rules: string[];
  /** Brief profiles for quick reference. */
  characterList: Array<{ id: string; name: string; role: string }>;
  relationships: Array<{ from: string; to: string; description: string }>;
  toneGuardrails: string[];
}

export interface StyleGuide {
  lineStyle: string;
  shading: string;
  /** CSS-safe / text palette descriptors (not hex). */
  palette: string[];
  cameraRules: string[];
  /** Any additional renderer hints. */
  notes?: string;
}

// ---------------------------------------------------------------------------
// World State
// ---------------------------------------------------------------------------

export interface WorldState {
  /** Current in-universe location. */
  currentLocation: string;
  /** Items the protagonist is carrying. */
  inventory: string[];
  /** Characters present in the current scene. */
  charactersPresent: string[];
  /** Freeform state flags (key/value). */
  flags: Record<string, string | number | boolean>;
  /** Running summary of plot events so far. */
  plotSummary: string;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface DialogueLine {
  speaker: string;
  /** Max 20 words. */
  text: string;
}

export interface PanelScript {
  /** Scene description for the artist. */
  scene: string;
  /** Max 2 dialogue lines. */
  dialogue: DialogueLine[];
  /** Camera / shot framing notes (e.g. "close-up", "wide establishing shot"). */
  camera: string;
}

export interface PanelData {
  panelIndex: number;
  pageNumber: number;
  script: PanelScript;
  imagePrompt: string;
  /** Populated once image generation completes; empty string while pending. */
  imageUrl: string;
}

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

export interface ChoiceOption {
  id: string;
  label: string;
  /** Short hint for the director about downstream consequences. */
  consequenceHint: string;
}

export interface ChoiceSet {
  /** Index of the last panel when these choices are shown. */
  anchorPanelIndex: number;
  options: ChoiceOption[];
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface ChoiceEventPayload {
  choiceId: string;
  choiceLabel: string;
}

export interface VoiceEventPayload {
  characterId: string;
  transcript: string;
  npcReply: string;
}

export interface HotspotEventPayload {
  hotspotId: string;
  hotspotLabel: string;
}

export type EventPayload =
  | ChoiceEventPayload
  | VoiceEventPayload
  | HotspotEventPayload;

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export interface ConversationTurn {
  role: ConversationRole;
  text: string;
  /** Unix ms timestamp. */
  ts: number;
}

// ---------------------------------------------------------------------------
// Composite response shapes (used by Convex queries)
// ---------------------------------------------------------------------------

export interface SessionView {
  _id: string;
  premise: string;
  vibe: string;
  mode: StoryMode;
  status: SessionStatus;
  progress: ProgressState;
  storyBible: StoryBible | null;
  styleGuide: StyleGuide | null;
  characterSheets: CharacterSheet[] | null;
  worldState: WorldState | null;
  createdAt: number;
}

export interface GetSessionResult {
  session: SessionView;
  panels: PanelData[];
  /** Only present for interactive sessions that have choices set. */
  choiceSet?: ChoiceSet;
}

// ---------------------------------------------------------------------------
// DB-augmented types (include Convex _id, sessionId, createdAt fields)
// These are the shapes returned from Convex queries / used in generate.ts.
// ---------------------------------------------------------------------------

export interface Panel extends PanelData {
  _id: string;
  sessionId: string;
  createdAt: number;
}

export type Session = SessionView;

// ---------------------------------------------------------------------------
// Canonical aliases (for contracts.md / generate.ts / schemas.ts alignment)
// ---------------------------------------------------------------------------

export type ConversationTurnWithTs = ConversationTurn;

// API request/response shapes (contracts)
export interface CreateSessionRequest {
  mode: Mode;
  premise: string;
  vibe: string;
}

export interface CreateSessionResponse {
  sessionId: string;
}

export interface GetSessionRequest {
  sessionId: string;
}

export interface GetSessionResponse {
  session: Session;
  panels: Panel[];
  choiceSet?: ChoiceSet;
}

export interface StartGenerationRequest {
  sessionId: string;
}

export interface SubmitChoiceRequest {
  sessionId: string;
  choiceId: string;
}

export interface SubmitUtteranceRequest {
  sessionId: string;
  characterId: string;
  text: string;
}
