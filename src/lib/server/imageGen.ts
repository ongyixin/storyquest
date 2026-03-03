/**
 * Image generation — StoryQuest
 *
 * Calls the OpenAI Images API (DALL-E 3) to turn an ArtDirector image prompt
 * into a hosted URL. Uses IMAGE_MODEL_API_KEY from the environment.
 *
 * generateImage(prompt, negativePrompt?)
 *   → URL string (expires ~1 h from generation), or "" on failure.
 *
 * generateImages(prompts)
 *   → string[] in the same order, running all requests concurrently.
 *   Individual failures return "" without aborting the rest.
 */

const OPENAI_API_BASE = "https://api.openai.com/v1";

// 1792×1024 is the DALL-E 3 wide landscape size — matches our 16:9 webtoon panels.
const IMAGE_SIZE = "1792x1024" as const;
const IMAGE_MODEL = "dall-e-3";
const IMAGE_QUALITY = "standard";

interface OpenAIImageResponse {
  data: Array<{ url: string; revised_prompt?: string }>;
}

function getApiKey(): string {
  const key = process.env.IMAGE_MODEL_API_KEY;
  if (!key) {
    throw new Error(
      "IMAGE_MODEL_API_KEY is not set. Add it to your .env.local and Convex environment."
    );
  }
  return key;
}

/**
 * Generate a single image from a prompt.
 * Returns the hosted URL, or throws on API error.
 */
export async function generateImage(
  prompt: string,
  _negativePrompt?: string // DALL-E 3 doesn't support negative prompts natively
): Promise<string> {
  const apiKey = getApiKey();

  const response = await fetch(`${OPENAI_API_BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: prompt.slice(0, 4000), // API limit
      n: 1,
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
      response_format: "url",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "<no body>");
    throw new Error(
      `OpenAI Images API error ${response.status}: ${body.slice(0, 300)}`
    );
  }

  const data = (await response.json()) as OpenAIImageResponse;
  const url = data.data?.[0]?.url;
  if (!url) {
    throw new Error("OpenAI Images API returned no URL");
  }
  return url;
}

/**
 * Generate multiple images concurrently.
 * Individual failures resolve to "" so one bad prompt doesn't break the page.
 */
export async function generateImages(
  items: Array<{ prompt: string; negativePrompt?: string }>
): Promise<string[]> {
  return Promise.all(
    items.map(({ prompt, negativePrompt }) =>
      generateImage(prompt, negativePrompt).catch((err) => {
        console.error("[imageGen] Failed for prompt snippet:", prompt.slice(0, 80), err);
        return "";
      })
    )
  );
}
