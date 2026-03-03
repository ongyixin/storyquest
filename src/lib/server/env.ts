/**
 * Centralised env var validation.
 * Import this module at the top of any server-side file that needs env vars.
 * Throws at startup if required vars are missing (fail-fast).
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
        `Copy .env.local.example to .env.local and fill in the value.`
    );
  }
  return value;
}

function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** Whether we are running in demo mode (no real API calls). */
export const DEMO_MODE = process.env.DEMO_MODE === "true";

/**
 * All server-side env vars.
 * In DEMO_MODE the API key vars are allowed to be empty strings.
 */
export function getServerEnv() {
  if (DEMO_MODE) {
    return {
      MINIMAX_API_KEY: optionalEnv("MINIMAX_API_KEY"),
      SPEECHMATICS_API_KEY: optionalEnv("SPEECHMATICS_API_KEY"),
      VAPI_API_KEY: optionalEnv("VAPI_API_KEY"),
      IMAGE_MODEL_API_KEY: optionalEnv("IMAGE_MODEL_API_KEY"),
      CONVEX_DEPLOYMENT: optionalEnv("CONVEX_DEPLOYMENT"),
      DEMO_MODE: true as const,
    } as const;
  }

  return {
    MINIMAX_API_KEY: requireEnv("MINIMAX_API_KEY"),
    SPEECHMATICS_API_KEY: requireEnv("SPEECHMATICS_API_KEY"),
    VAPI_API_KEY: requireEnv("VAPI_API_KEY"),
    IMAGE_MODEL_API_KEY: requireEnv("IMAGE_MODEL_API_KEY"),
    CONVEX_DEPLOYMENT: requireEnv("CONVEX_DEPLOYMENT"),
    DEMO_MODE: false as const,
  } as const;
}

/** Convex URL — exposed to the browser via NEXT_PUBLIC_ prefix. */
export const NEXT_PUBLIC_CONVEX_URL =
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
