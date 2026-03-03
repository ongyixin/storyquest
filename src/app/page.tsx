"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Mode } from "@/lib/shared/types";
import { SketchInputWrap } from "@/components/sketch/SketchInputWrap";

const VIBES = [
  "Adventure", "Mystery", "Sci-Fi", "Fantasy",
  "Horror", "Romance", "Thriller", "Comedy",
] as const;

const EXAMPLE_PREMISES = [
  "A retired detective receives a mysterious letter from her past. The letter leads her to an abandoned lighthouse on the edge of town, where she discovers something that changes everything.",
  "Two rival street artists in Neo-Tokyo realize they've been painting the same hidden mural across the city—one panel at a time—without ever meeting.",
  "A small-town baker starts finding notes from a time traveler inside loaves of bread, each one hinting at a disaster she must prevent.",
];

export default function HomePage() {
  const router = useRouter();
  const createSession = useMutation(api.sessions.createSession);

  const [mode, setMode] = useState<Mode>("normal");
  const [premise, setPremise] = useState("");
  const [vibe, setVibe] = useState<string>(VIBES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = premise.trim().length >= 10 && !loading;

  async function handleGenerate() {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const { sessionId } = await createSession({ mode, premise: premise.trim(), vibe });
      router.push(`/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session.");
      setLoading(false);
    }
  }

  function fillExample() {
    const idx = Math.floor(Math.random() * EXAMPLE_PREMISES.length);
    setPremise(EXAMPLE_PREMISES[idx]);
  }

  return (
    /*
     * Notebook-paper background:
     *   – Off-white base (#f7f4ee via bg-paper)
     *   – Faint horizontal ruling every 28px
     *   – Red margin line at 64px from left
     */
    <div
      className="relative min-h-screen bg-paper"
      style={{
        backgroundImage: [
          "linear-gradient(to right, transparent 63px, #e8a8a8 63px, #e8a8a8 64px, transparent 64px)",
          "repeating-linear-gradient(transparent 0px, transparent 27px, #d0c8b8 27px, #d0c8b8 28px)",
        ].join(", "),
      }}
    >
      <div className="mx-auto max-w-2xl px-6 py-14 sm:px-8">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <header className="mb-10 text-center">

          {/* Rubber-stamp badge */}
          <div className="mb-6 flex justify-center">
            <div
              className="stamp-in relative inline-flex"
              style={{ transform: "rotate(-1.5deg)", "--stamp-r": "-1.5deg" } as React.CSSProperties}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0"
                style={{ border: "1.5px solid #c9782a", filter: "url(#rough-sm)" }}
              />
              <span className="relative z-10 inline-flex items-center gap-2 px-4 py-1 font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-accent-warm">
                ◈ Agentic Comic Platform
              </span>
            </div>
          </div>

          {/* Doodle title */}
          <DoodleTitle />

          <p className="mt-5 font-sans text-base text-ink-light">
            Turn a short premise into a complete comic — or{" "}
            <em>step inside the story yourself.</em>
          </p>

          {/* Decorative mini panel row */}
          <MiniPanelRow />
        </header>

        {/* ── Form card ─────────────────────────────────────────
         *  Rough border via SVG overlay — no filter on the container.
         * ──────────────────────────────────────────────────────── */}
        <div
          className="relative bg-paper-dark px-7 py-8"
          style={{ boxShadow: "6px 7px 0 0 #1c1712" }}
        >
          {/* SVG border overlay — only this rect is filtered */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect
              x="1" y="1" width="99%" height="99%"
              fill="none" stroke="#1c1712" strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              filter="url(#rough)"
            />
          </svg>

          {/* Corner registration marks */}
          {["top-2 left-2", "top-2 right-2", "bottom-2 left-2", "bottom-2 right-2"].map((pos) => (
            <span key={pos} aria-hidden="true" className={`absolute ${pos} select-none font-sans text-[10px] leading-none text-ink-faint`}>+</span>
          ))}

          {/* ── Premise ──────────────────────────────────────── */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <label className="font-sans text-sm font-bold text-ink-mid">
                Your Premise
                <span className="ml-2 font-normal text-ink-faint">(2–3 sentences)</span>
              </label>
              <button
                type="button"
                onClick={fillExample}
                className="font-sans text-xs text-accent underline underline-offset-2 transition-colors hover:text-accent-light"
              >
                Use an example →
              </button>
            </div>
            <SketchInputWrap>
              <textarea
                rows={4}
                value={premise}
                onChange={(e) => { setPremise(e.target.value); setError(null); }}
                placeholder="A disgraced detective discovers her city is secretly run by an underground magic guild…"
                className="w-full resize-none bg-paper px-4 py-3 font-sans text-sm text-ink placeholder:text-ink-faint outline-none"
              />
            </SketchInputWrap>
            <p className="mt-1 text-right font-sans text-xs text-ink-faint">
              {premise.trim().length} chars
              {premise.trim().length < 10 && premise.length > 0 && (
                <span className="ml-1 text-accent-red">(min 10)</span>
              )}
            </p>
          </div>

          {/* ── Vibe ─────────────────────────────────────────── */}
          <div className="mb-6">
            <label className="mb-2 block font-sans text-sm font-bold text-ink-mid">Vibe</label>
            <SketchInputWrap>
              <select
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                className="w-full appearance-none bg-paper px-4 py-2.5 font-sans text-sm text-ink outline-none"
              >
                {VIBES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </SketchInputWrap>
          </div>

          {/* ── Mode ─────────────────────────────────────────── */}
          <div className="mb-8">
            <label className="mb-3 block font-sans text-sm font-bold text-ink-mid">Mode</label>
            <div className="grid grid-cols-2 gap-3">
              <ModeCard
                selected={mode === "normal"}
                onClick={() => setMode("normal")}
                title="Normal"
                badge="Read-only"
                description="Generate a complete 6-panel comic from your premise. Share & export."
                icon="📖"
                index={0}
              />
              <ModeCard
                selected={mode === "interactive"}
                onClick={() => setMode("interactive")}
                title="Interactive"
                badge="Influence the story"
                description="Make choices, talk to characters, and shape what happens next."
                icon="🎮"
                index={1}
              />
            </div>
          </div>

          {/* ── Error ────────────────────────────────────────── */}
          {error && (
            <div className="relative mb-4">
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{ border: "1.5px solid #b33030", backgroundColor: "#fdf0f0", filter: "url(#rough-sm)" }}
              />
              <p className="relative z-10 px-4 py-2.5 font-sans text-sm text-accent-red">{error}</p>
            </div>
          )}

          {/* ── Generate button ───────────────────────────────
           *  Background span is rough-filtered; text span is not.
           * ────────────────────────────────────────────────── */}
          <button
            onClick={handleGenerate}
            disabled={!canSubmit}
            className="relative w-full py-4 transition-all duration-150 active:translate-y-0.5 disabled:cursor-not-allowed"
            style={{ boxShadow: canSubmit ? "3px 4px 0 0 #3d3730" : "none" }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 transition-opacity duration-150"
              style={{ backgroundColor: "#1c1712", filter: "url(#rough-md)", opacity: canSubmit ? 1 : 0.35 }}
            />
            <span className={`relative z-10 flex items-center justify-center gap-2 font-display text-lg text-paper transition-opacity duration-150 ${!canSubmit ? "opacity-60" : ""}`}>
              {loading ? (
                <>
                  <LoadingDots />
                  Sketching your story…
                </>
              ) : (
                "✦ Generate Comic"
              )}
            </span>
          </button>
        </div>

        {/* Footer */}
        <p
          className="mt-8 text-center font-sans text-xs text-ink-faint"
          style={{ transform: "rotate(-0.3deg)" }}
        >
          Powered by MiniMax · Speechmatics · Vapi · Convex
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function MiniPanelRow() {
  const panels = [
    { rotate: "-1.8deg", delay: 150 },
    { rotate: "0.6deg",  delay: 250 },
    { rotate: "-0.9deg", delay: 350 },
  ];
  return (
    <div className="mx-auto mt-8 flex justify-center gap-3" aria-hidden="true">
      {panels.map((p, i) => (
        <div
          key={i}
          className="sketch-appear relative h-14 w-[72px] bg-paper-dark"
          style={{ transform: `rotate(${p.rotate})`, boxShadow: "2px 3px 0 0 #1c1712", animationDelay: `${p.delay}ms` }}
        >
          <svg className="absolute inset-0 h-full w-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="99%" height="99%" fill="none" stroke="#1c1712" strokeWidth="1.5" vectorEffect="non-scaling-stroke" filter="url(#rough)" />
          </svg>
          <div className="absolute inset-x-3 space-y-1.5" style={{ top: "22%" }}>
            {[100, 80, 65].map((w, j) => (
              <div key={j} className="h-px bg-ink-faint" style={{ width: `${w}%`, opacity: 0.35 + j * 0.1 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const MODE_ROTATIONS = [-0.6, 0.5];

function ModeCard({
  selected, onClick, title, badge, description, icon, index,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  badge: string;
  description: string;
  icon: string;
  index: number;
}) {
  const rotation = MODE_ROTATIONS[index % MODE_ROTATIONS.length];
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-start p-4 text-left transition-all duration-150 active:translate-y-px focus:outline-none"
      style={{ transform: `rotate(${rotation}deg)`, boxShadow: selected ? "none" : "2px 3px 0 0 #1c1712" }}
    >
      {/* Rough border background */}
      <span
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundColor: selected ? "#e8f0fd" : "#f7f4ee",
          border: `2px solid ${selected ? "#2a5caa" : "#3d3730"}`,
          filter: "url(#rough-md)",
        }}
      />
      <span className="relative z-10 flex flex-col gap-1">
        <span className="text-2xl">{icon}</span>
        <span className={`font-sans text-sm font-bold ${selected ? "text-accent" : "text-ink-mid"}`}>{title}</span>
        <span className={`font-sans text-xs font-medium ${selected ? "text-accent-light" : "text-ink-faint"}`}>{badge}</span>
        <span className="font-sans text-xs leading-snug text-ink-light">{description}</span>
        {selected && (
          <span className="mt-1 font-sans text-[10px] font-bold uppercase tracking-wider text-accent">✓ Selected</span>
        )}
      </span>
    </button>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-paper"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

// ─── Bubble title ─────────────────────────────────────────────────────────────
//
// Chewy font (chunky, balloon letterforms) with:
//   – solid fill colour
//   – -webkit-text-stroke for a bold ink outline
//   – offset box-shadow / text-shadow for depth
// Two-colour split: "Story" warm orange · "Quest" comic blue

function DoodleTitle() {
  return (
    <div className="mt-2">
      <h1
        className="font-doodle leading-[1.1] tracking-wide"
        style={{ fontSize: "clamp(3.6rem, 13vw, 6rem)" }}
      >
        <BubbleWord text="Story" fill="#e07830" stroke="#7a3a0a" rotate="-1.2deg" />
        <BubbleWord text="Quest" fill="#3a7cd6" stroke="#0e2f6e" rotate="0.9deg" />
      </h1>

      {/* Hand-drawn wavy underline */}
      <svg
        className="mx-auto mt-1 overflow-visible"
        style={{ width: "clamp(13rem, 52vw, 21rem)" }}
        height="10"
        viewBox="0 0 280 10"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M2,6 C40,1 90,9 140,5 C190,1 230,8 278,4"
          fill="none"
          stroke="#1c1712"
          strokeWidth="2.5"
          strokeLinecap="round"
          filter="url(#rough)"
        />
      </svg>
    </div>
  );
}

function BubbleWord({
  text,
  fill,
  stroke,
  rotate,
}: {
  text: string;
  fill: string;
  stroke: string;
  rotate: string;
}) {
  return (
    <span
      className="inline-block"
      style={{ transform: `rotate(${rotate})` }}
    >
      {/*
       * -webkit-text-stroke paints a thick coloured border around each
       * glyph. Combined with a bright fill colour and a hard drop-shadow
       * this is all you need for a clean bubble / comic-lettering look.
       * No background-clip tricks — those cause cross-browser gray blocks.
       */}
      <span
        style={{
          display: "inline-block",
          color: fill,
          WebkitTextStroke: `4px ${stroke}`,
          paintOrder: "stroke fill",      /* stroke drawn behind fill */
          textShadow: `3px 4px 0 ${stroke}`,
        }}
      >
        {text}
      </span>
    </span>
  );
}
