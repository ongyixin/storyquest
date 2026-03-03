/**
 * POST /api/sessions
 * Thin HTTP wrapper around Convex createSession mutation.
 * Useful for server-side or webhook callers.
 */

import { NextRequest, NextResponse } from "next/server";
import { CreateSessionRequestSchema } from "@/lib/shared/schemas";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // In production: call Convex via the HTTP client or server-side SDK.
    // For now we return a redirect hint — the client calls Convex directly.
    return NextResponse.json(
      { message: "Use Convex client directly for createSession." },
      { status: 501 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
