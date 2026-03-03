/**
 * POST /api/transcribe
 *
 * Accepts a multipart/form-data request with an "audio" file field.
 * Submits the audio to Speechmatics batch transcription API, polls until
 * the job completes, and returns { text: string }.
 *
 * Used by VoiceBar as a fallback when the browser Web Speech API is unavailable
 * (e.g. Firefox). Primary path uses SpeechRecognition directly in the browser.
 */

import { NextRequest, NextResponse } from "next/server";

const SPEECHMATICS_API_BASE = "https://asr.api.speechmatics.com/v2";

interface SpeechmaticsJobResponse {
  id: string;
}

interface SpeechmaticsStatusResponse {
  job: {
    id: string;
    status: "running" | "done" | "rejected";
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.SPEECHMATICS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "STT not configured — SPEECHMATICS_API_KEY missing" },
      { status: 503 }
    );
  }

  let reqFormData: FormData;
  try {
    reqFormData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const audioFile = reqFormData.get("audio") as File | null;
  if (!audioFile) {
    return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
  }

  // ── 1. Submit the transcription job ──────────────────────────────────────
  const jobForm = new FormData();
  jobForm.append("data_file", audioFile);
  jobForm.append(
    "config",
    JSON.stringify({
      type: "transcription",
      transcription_config: {
        language: "en",
        operating_point: "enhanced",
      },
    })
  );

  const jobRes = await fetch(`${SPEECHMATICS_API_BASE}/jobs/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: jobForm,
  });

  if (!jobRes.ok) {
    const errText = await jobRes.text();
    console.error("[transcribe] Job submission failed:", errText);
    return NextResponse.json(
      { error: "Failed to submit transcription job" },
      { status: 502 }
    );
  }

  const { id: jobId } = (await jobRes.json()) as SpeechmaticsJobResponse;

  // ── 2. Poll for completion (max ~30 s, 2 s intervals) ───────────────────
  const maxAttempts = 15;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));

    const statusRes = await fetch(`${SPEECHMATICS_API_BASE}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!statusRes.ok) {
      console.error("[transcribe] Status check failed:", await statusRes.text());
      return NextResponse.json(
        { error: "Failed to check transcription status" },
        { status: 502 }
      );
    }

    const statusData = (await statusRes.json()) as SpeechmaticsStatusResponse;
    const status = statusData.job?.status;

    if (status === "rejected") {
      return NextResponse.json(
        { error: "Transcription job was rejected" },
        { status: 422 }
      );
    }

    if (status === "done") {
      // ── 3. Fetch the plain-text transcript ───────────────────────────────
      const transcriptRes = await fetch(
        `${SPEECHMATICS_API_BASE}/jobs/${jobId}/transcript?format=txt`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      if (!transcriptRes.ok) {
        console.error("[transcribe] Transcript fetch failed:", await transcriptRes.text());
        return NextResponse.json(
          { error: "Failed to retrieve transcript" },
          { status: 502 }
        );
      }

      const text = (await transcriptRes.text()).trim();
      return NextResponse.json({ text });
    }

    // status === "running" → keep polling
  }

  return NextResponse.json({ error: "Transcription timed out" }, { status: 504 });
}
