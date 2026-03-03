"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { CharacterSheet } from "@/lib/shared/types";
import { ComicGrid } from "./ComicGrid";
import { ChoiceBar } from "./ChoiceBar";
import { VoiceBar } from "./VoiceBar";
import { ProgressOverlay } from "./ProgressOverlay";
import Link from "next/link";

interface Props {
  sessionId: string;
}

export function SessionView({ sessionId }: Props) {
  const data = useQuery(api.sessions.getSession, {
    sessionId: sessionId as Id<"sessions">,
  });

  const submitChoice     = useMutation(api.sessions.submitChoice);
  const submitUtterance  = useMutation(api.sessions.submitUtterance);

  if (data === undefined) {
    return <ProgressOverlay stage="Loading" detail="Fetching session…" />;
  }

  if (data === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper">
        <p className="font-display text-xl text-ink-mid">Session not found.</p>
        <Link href="/" className="font-sans text-sm text-accent underline">
          ← Back to home
        </Link>
      </main>
    );
  }

  const { session, panels, choiceSet } = data;
  const isInteractive = session.mode === "interactive";
  const isGenerating  = session.status === "creating";
  const isError       = session.status === "error";

  return (
    <main
      className="flex min-h-screen flex-col bg-paper"
      style={{
        backgroundImage: "repeating-linear-gradient(transparent 0px, transparent 27px, #d0c8b8 27px, #d0c8b8 28px)",
      }}
    >
      {/* ── Sticky header ─────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 bg-paper/95 backdrop-blur-sm"
        style={{ borderBottom: "1.5px solid #9c9286" }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href="/"
            className="font-display text-lg text-accent hover:text-accent-light transition-colors"
          >
            StoryQuest
          </Link>

          <div className="flex items-center gap-3">
            {/* Mode badge — rubber stamp style */}
            <span
              className="stamp-in relative inline-flex"
              style={{
                transform: `rotate(${isInteractive ? "1.5deg" : "-1.5deg"})`,
                "--stamp-r": isInteractive ? "1.5deg" : "-1.5deg",
              } as React.CSSProperties}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  border: `1.5px solid ${isInteractive ? "#2a5caa" : "#2d7a3a"}`,
                  filter: "url(#rough-sm)",
                  borderRadius: "2px",
                }}
              />
              <span
                className="relative z-10 px-3 py-0.5 font-sans text-xs font-bold uppercase tracking-widest"
                style={{ color: isInteractive ? "#2a5caa" : "#2d7a3a" }}
              >
                {isInteractive ? "🎮 Interactive" : "📖 Normal"}
              </span>
            </span>

            <span className="hidden font-sans text-xs text-ink-faint italic sm:inline max-w-xs truncate">
              {session.vibe} · {session.premise.slice(0, 60)}…
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-6">
        {/* Progress overlay */}
        {isGenerating && (
          <ProgressOverlay
            stage={session.progress.stage}
            detail={session.progress.detail}
          />
        )}

        {/* Error banner */}
        {isError && (
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{ border: "1.5px solid #b33030", backgroundColor: "#fdf0f0", filter: "url(#rough)" }}
            />
            <div className="relative z-10 p-4 font-sans text-sm text-accent-red">
              <span className="font-bold">Generation failed:</span>{" "}
              {session.progress.detail}
              <p className="mt-1 text-xs opacity-70">
                Make sure <code>DEMO_MODE=true</code> is set in{" "}
                <code>.env.local</code> while running locally.
              </p>
            </div>
          </div>
        )}

        {/* Comic panels */}
        {panels.length > 0 && (
          <section>
            <ComicGrid panels={panels} />
          </section>
        )}

        {/* Skeleton while generating */}
        {panels.length === 0 && isGenerating && <ComicGridSkeleton />}

        {/* Interactive controls */}
        {isInteractive && session.status === "ready" && (
          <section className="space-y-4">
            {choiceSet && (
              <ChoiceBar
                choiceSet={choiceSet}
                onChoose={async (choiceId) => {
                  await submitChoice({
                    sessionId: sessionId as Id<"sessions">,
                    choiceId,
                  });
                }}
              />
            )}
            <VoiceBar
              sessionId={sessionId as Id<"sessions">}
              characterSheets={(session.characterSheets ?? []) as CharacterSheet[]}
              onUtterance={async ({ characterId, text }) => {
                await submitUtterance({
                  sessionId: sessionId as Id<"sessions">,
                  characterId,
                  text,
                });
              }}
            />
          </section>
        )}

        {/* Normal mode controls */}
        {!isInteractive && session.status === "ready" && (
          <section className="flex justify-center gap-4 pt-2">
            <button
              className="relative px-6 py-2 font-sans text-sm font-semibold text-ink-mid transition-all active:translate-y-px"
              style={{ border: "1.5px solid #6b6055", filter: "url(#rough-sm)" }}
              onClick={() => window.print()}
            >
              Export / Print
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

function ComicGridSkeleton() {
  return (
    <div className="panel-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="aspect-video w-full animate-pulse bg-paper-dark"
          style={{
            border: "1.5px dashed #9c9286",
            filter: "url(#rough)",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}
