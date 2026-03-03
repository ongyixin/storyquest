/**
 * MiniMax API client wrapper for StoryQuest.
 *
 * Provides a single `minimaxChat` function that:
 *  - Sends a system + user message to MiniMax's chat-completion endpoint
 *  - Requests JSON output that matches the provided JSON Schema
 *  - Validates the response against the schema via the caller-supplied Zod parser
 *  - Retries up to MAX_RETRIES times on transient errors (5xx, network failures)
 *  - Applies a per-attempt timeout of REQUEST_TIMEOUT_MS
 *
 * Usage:
 *   const result = await minimaxChat({
 *     system: "You are a story director...",
 *     user:   "Given this premise: ...",
 *     jsonSchema: { type: "object", ... },   // JSON Schema describing expected output
 *     parse:  MyZodSchema.parse,             // Called on the parsed JSON
 *   });
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MINIMAX_API_BASE =
  process.env.MINIMAX_API_BASE ?? "https://api.minimax.io/v1";
const DEFAULT_MODEL = "MiniMax-M2.5";
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 120_000; // 120 s — reasoning models can be slow
const RETRY_DELAY_BASE_MS = 1_500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MinimaxChatOptions<T> {
  /** System prompt — sets the agent's persona and output contract */
  system: string;
  /** User prompt — the concrete request */
  user: string;
  /**
   * JSON Schema object passed to MiniMax's `response_format` to request
   * structured JSON output.  Must match the shape that `parse` expects.
   */
  jsonSchema: Record<string, unknown>;
  /** Zod parse function (e.g. `MySchema.parse`) to validate the response */
  parse: (raw: unknown) => T;
  /** Override the model for this call */
  model?: string;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Temperature (0–1) */
  temperature?: number;
}

interface MinimaxMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface MinimaxChatResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string; reasoning_content?: string };
    finish_reason: string;
  }>;
  usage?: { total_tokens: number };
  // Top-level error field some MiniMax responses include
  base_resp?: { status_code: number; status_msg: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function getApiKey(): string {
  const key =
    typeof process !== "undefined"
      ? process.env.MINIMAX_API_KEY
      : undefined;
  if (!key) {
    throw new Error(
      "MINIMAX_API_KEY is not set. Add it to your .env.local file."
    );
  }
  return key;
}

/**
 * Attempt to extract JSON from a model response that may include prose wrappers
 * like ```json … ``` fences or leading/trailing sentences.
 */
function extractJson(content: string): unknown {
  // Strip markdown code fences
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1] : content;

  // Find first '{' or '[' and last '}' or ']'
  const start = jsonText.search(/[{[]/);
  const end = Math.max(jsonText.lastIndexOf("}"), jsonText.lastIndexOf("]"));

  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found in model response: ${content.slice(0, 200)}`);
  }

  try {
    return JSON.parse(jsonText.slice(start, end + 1));
  } catch {
    throw new Error(
      `Failed to parse JSON from model response: ${jsonText.slice(start, Math.min(start + 500, end + 1))}`
    );
  }
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Send a chat completion request to MiniMax and return a validated, typed result.
 *
 * @throws {Error} if the API returns an unretryable error, max retries are
 *   exhausted, or Zod validation fails after all retries.
 */
export async function minimaxChat<T>(options: MinimaxChatOptions<T>): Promise<T> {
  const {
    system,
    user,
    jsonSchema,
    parse,
    model = DEFAULT_MODEL,
    maxTokens = 4096,
    temperature = 0.7,
  } = options;

  const apiKey = getApiKey();

  // Append the JSON schema to the user prompt as a concrete format hint.
  // This replaces the unreliable response_format API parameter and works with all models.
  const userWithSchema =
    `${user}\n\nRespond with ONLY valid JSON matching this schema (no prose, no markdown fences):\n` +
    JSON.stringify(jsonSchema, null, 2);

  const messages: MinimaxMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userWithSchema },
  ];

  const body = {
    model,
    messages,
    max_completion_tokens: maxTokens,
    temperature,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAY_BASE_MS * 2 ** (attempt - 1);
      console.warn(
        `[minimax] Retry ${attempt}/${MAX_RETRIES - 1} after ${delay}ms — ${lastError?.message}`
      );
      await sleep(delay);
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      response = await fetch(`${MINIMAX_API_BASE}/text/chatcompletion_v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === "AbortError") {
        lastError = new Error(`MiniMax request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      // Network error — always retryable
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "<no body>");
      lastError = new Error(
        `MiniMax API error ${response.status}: ${errorBody.slice(0, 300)}`
      );
      if (!isRetryable(response.status)) {
        throw lastError;
      }
      continue;
    }

    let data: MinimaxChatResponse;
    try {
      data = (await response.json()) as MinimaxChatResponse;
    } catch (err) {
      lastError = new Error(`Failed to parse MiniMax response as JSON: ${err}`);
      continue;
    }

    // Log the full response structure on first attempt to aid debugging
    if (attempt === 0) {
      console.log("[minimax] raw response:", JSON.stringify({
        id: data.id,
        base_resp: data.base_resp,
        finish_reason: data.choices?.[0]?.finish_reason,
        content_length: data.choices?.[0]?.message?.content?.length,
        reasoning_length: data.choices?.[0]?.message?.reasoning_content?.length,
      }));
    }

    // Some MiniMax models (reasoning variants) put the answer in reasoning_content
    // when content is empty — fall back to it before retrying.
    const content =
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.message?.reasoning_content;

    if (!content) {
      const baseMsg = data.base_resp?.status_msg;
      lastError = new Error(
        baseMsg
          ? `MiniMax error: ${baseMsg} (code ${data.base_resp?.status_code})`
          : `MiniMax returned an empty content field. finish_reason=${data.choices?.[0]?.finish_reason}`
      );
      continue;
    }

    let raw: unknown;
    try {
      raw = extractJson(content);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }

    try {
      return parse(raw);
    } catch (err) {
      // Zod validation failure — log details and retry (the model may have deviated)
      if (err instanceof z.ZodError) {
        lastError = new Error(
          `Zod validation failed:\n${err.errors.map((e) => `  ${e.path.join(".")}: ${e.message}`).join("\n")}`
        );
        console.warn("[minimax]", lastError.message);
        console.warn("[minimax] Raw output:", JSON.stringify(raw, null, 2).slice(0, 1000));
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      continue;
    }
  }

  throw lastError ?? new Error("MiniMax: unknown failure after retries");
}

// ---------------------------------------------------------------------------
// JSON Schema helpers (convert basic Zod-like shapes to JSON Schema)
// ---------------------------------------------------------------------------

/**
 * Build a strict JSON Schema object property list entry.
 * Useful for constructing jsonSchema inline without a full z-to-jsonschema lib.
 */
export function jsString(description?: string) {
  return { type: "string", ...(description ? { description } : {}) };
}

export function jsNumber(description?: string) {
  return { type: "number", ...(description ? { description } : {}) };
}

export function jsBoolean(description?: string) {
  return { type: "boolean", ...(description ? { description } : {}) };
}

export function jsArray(items: Record<string, unknown>, description?: string) {
  return { type: "array", items, ...(description ? { description } : {}) };
}

export function jsObject(
  properties: Record<string, Record<string, unknown>>,
  required?: string[],
  description?: string
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required: required ?? Object.keys(properties),
    additionalProperties: false,
    ...(description ? { description } : {}),
  };
}

export function jsEnum(values: string[], description?: string) {
  return { type: "string", enum: values, ...(description ? { description } : {}) };
}
