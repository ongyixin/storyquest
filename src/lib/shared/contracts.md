# StoryQuest — Backend Function Contracts

**STATUS: FROZEN**
Do not change these signatures without a team sync.
All agents must implement stubs that conform to these signatures before merging.

---

## Convex Mutations

### `createSession`

Creates a new story session and returns the session ID.
Immediately sets `status = "creating"` and fires `startGeneration` in the background.

```ts
createSession(args: {
  mode:    "normal" | "interactive";
  premise: string;   // 10–1000 chars
  vibe:    string;   // 1–50 chars
}) -> { sessionId: string }
```

**Side effects:**
- Inserts a `sessions` row with `status = "creating"`.
- Schedules `startGeneration` as a Convex action.

---

### `submitChoice`

Records a player choice in interactive mode and triggers the next panel batch.

```ts
submitChoice(args: {
  sessionId: string;
  choiceId:  string;
}) -> void
```

**Side effects:**
- Inserts an `events` row with `type = "choice"`.
- Schedules the Director → Writer → Continuity → ArtDirector → ImageGen pipeline
  to append 1–2 new panels.
- Updates `worldState` once panels are ready.

---

### `submitUtterance`

Records a voice utterance and triggers the NPC response + panel batch.

```ts
submitUtterance(args: {
  sessionId:   string;
  characterId: string;
  text:        string;  // final transcript, 1–500 chars
}) -> void
```

**Side effects:**
- Inserts an `events` row with `type = "voice"`.
- Calls `NPCCharacterAgent` → `StoryDirectorAgent` (delta) → Writer pipeline.
- Appends 1–2 new panels and updates `worldState`.
- Returns NPC reply text via a `conversations` update (subscribed by frontend).

---

## Convex Actions

### `startGeneration`

Runs the full initial pipeline for a session.
Called internally after `createSession`; can also be called to retry on error.

```ts
startGeneration(args: {
  sessionId: string;
}) -> void
```

**Pipeline (normal mode):**
```
StoryDirectorAgent(normal)
  → SceneWriterAgent
  → ContinuityAgent
  → ArtDirectorAgent
  → ImageGen (×6, sequential, stream to frontend)
```

**Pipeline (interactive mode):**
```
StoryDirectorAgent(interactive)
  → SceneWriterAgent
  → ContinuityAgent
  → ArtDirectorAgent
  → ImageGen (×6, sequential)
  → Store initial choices in `choices` table
  → Initialize `worldState`
```

**Progress updates:**
Each stage sets `sessions.progress = { stage, detail }`.
Frontend subscribes via `useQuery(api.sessions.getSession, { sessionId })`.

---

## Convex Queries

### `getSession`

Returns the current state of a session plus its panels and active choice set.

```ts
getSession(args: {
  sessionId: string;
}) -> {
  session:   Session;
  panels:    Panel[];
  choiceSet: ChoiceSet | undefined;
}
```

**Notes:**
- `panels` are ordered by `panelIndex` ascending.
- `choiceSet` is the most recent un-consumed choice set (interactive mode only).
- This query is reactive; the frontend uses `useQuery` to get live updates.

---

## Next.js API Routes (thin wrappers)

These routes call the Convex mutations/actions above and are used when
server-side logic or HTTP callbacks are needed (e.g., Speechmatics webhook).

| Method | Path                          | Body                                  | Description                          |
|--------|-------------------------------|---------------------------------------|--------------------------------------|
| POST   | `/api/sessions`               | `CreateSessionRequest`                | Calls `createSession`                |
| POST   | `/api/sessions/[id]/choice`   | `{ choiceId }`                        | Calls `submitChoice`                 |
| POST   | `/api/sessions/[id]/utterance`| `{ characterId, text }`               | Calls `submitUtterance`              |
| POST   | `/api/sessions/[id]/generate` | `{}`                                  | Calls `startGeneration` (retry/demo) |

---

## Agent I/O Contracts

All agents accept and return **strict JSON**, validated with Zod schemas defined
in `src/lib/shared/schemas.ts`.

| Agent                   | Input                                         | Output Schema                        |
|-------------------------|-----------------------------------------------|--------------------------------------|
| `StoryDirectorAgent`    | `{ mode, premise, vibe, worldState? }`        | `DirectorOutputNormal/Interactive`   |
| `SceneWriterAgent`      | `{ storyBible, styleGuide, panelOutline, worldState? }` | `SceneWriterOutput`        |
| `ContinuityAgent`       | `{ storyBible, panels, worldState? }`         | `ContinuityOutput`                   |
| `ArtDirectorAgent`      | `{ styleGuide, characterSheets, panels }`     | `ArtDirectorOutput`                  |
| `NPCCharacterAgent`     | `{ worldState, characterProfile, utterance, history }` | `NPCOutput`                 |

All schemas are exported from `src/lib/shared/schemas.ts`.

---

## Env Vars Required

See `.env.local.example` for the full list.
All vars are validated at startup via `src/lib/server/env.ts`.

| Variable                 | Used by                          |
|--------------------------|----------------------------------|
| `MINIMAX_API_KEY`        | All LLM agent calls              |
| `CONVEX_DEPLOYMENT`      | Convex client                    |
| `NEXT_PUBLIC_CONVEX_URL` | Convex client (browser)          |
| `SPEECHMATICS_API_KEY`   | Voice STT                        |
| `VAPI_API_KEY`           | Voice TTS / session              |
| `IMAGE_MODEL_API_KEY`    | Image generation                 |
| `DEMO_MODE`              | `"true"` to skip real API calls  |

---

## Mode Gating Rules

| Feature                        | normal | interactive |
|--------------------------------|--------|-------------|
| 6-panel initial comic          | ✅      | ✅           |
| Choice buttons                 | ❌      | ✅           |
| Voice / Talk button            | ❌      | ✅           |
| World state persistence        | ❌      | ✅           |
| 2D hub map (stretch)           | ❌      | ✅           |
| Regenerate panel button        | ✅      | ✅           |
| Export / Share page            | ✅      | ❌ (stretch) |
