/**
 * POST /api/sessions/[id]/utterance
 * HTTP wrapper for submitUtterance (e.g. Speechmatics webhook callback).
 */

import { NextRequest, NextResponse } from "next/server";
import { SubmitUtteranceRequestSchema } from "@/lib/shared/schemas";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const parsed = SubmitUtteranceRequestSchema.safeParse({
      sessionId: id,
      ...body,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: "Use Convex client directly for submitUtterance." },
      { status: 501 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
