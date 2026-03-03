/**
 * POST /api/sessions/[id]/generate
 * Retry / demo trigger for startGeneration.
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  return NextResponse.json(
    { message: "Use Convex client directly for startGeneration." },
    { status: 501 }
  );
}
