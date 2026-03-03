/**
 * POST /api/sessions/[id]/choice
 * HTTP wrapper for submitChoice (e.g. server-side triggered events).
 */

import { NextRequest, NextResponse } from "next/server";
import { SubmitChoiceRequestSchema } from "@/lib/shared/schemas";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const parsed = SubmitChoiceRequestSchema.safeParse({
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
      { message: "Use Convex client directly for submitChoice." },
      { status: 501 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
