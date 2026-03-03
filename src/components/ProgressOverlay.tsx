"use client";

interface Props {
  stage: string;
  detail: string;
}

const STAGE_ICONS: Record<string, string> = {
  initialising: "⚙",
  generating:   "✦",
  done:         "✓",
  error:        "✕",
};

const PIPELINE_STAGES = ["Director", "Writer", "Continuity", "Art", "Image"];

/**
 * Full-screen loading overlay with a sketchbook aesthetic.
 * Replaces the spinner with an animated "drawing" motif.
 */
export function ProgressOverlay({ stage, detail }: Props) {
  const icon  = STAGE_ICONS[stage] ?? stage;
  const stageIdx = PIPELINE_STAGES.findIndex(
    (s) => s.toLowerCase() === stage.toLowerCase()
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-8"
      style={{
        backgroundColor: "rgba(247, 244, 238, 0.92)",
        backdropFilter: "blur(4px)",
      }}
    >
      {/* Animated sketch panel */}
      <div className="relative flex h-20 w-24 items-center justify-center bg-paper-dark sketch-appear">
        <svg
          className="absolute inset-0 h-full w-full overflow-visible"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect
            x="2" y="2" width="96%" height="96%"
            fill="none" stroke="#1c1712" strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
            filter="url(#rough)"
            strokeDasharray="400"
            style={{ animation: "draw-stroke 1.5s linear infinite" }}
          />
        </svg>
        <span
          className="relative z-10 font-display text-3xl text-ink jitter-idle"
          style={{ "--j-r": "0deg" } as React.CSSProperties}
        >
          {icon}
        </span>
      </div>

      {/* Status text */}
      <div className="text-center space-y-1">
        <p
          className="font-display text-3xl text-ink"
          style={{ transform: "rotate(-0.5deg)" }}
        >
          {stage.charAt(0).toUpperCase() + stage.slice(1)}
        </p>
        <p className="font-sans text-sm text-ink-light max-w-xs">{detail}</p>
      </div>

      {/* Pipeline progress dots */}
      <div className="flex items-center gap-2">
        {PIPELINE_STAGES.map((s, i) => (
          <div key={s} className="flex flex-col items-center gap-1">
            <div
              className="h-2 w-8 transition-all duration-500"
              style={{
                backgroundColor: i <= stageIdx ? "#1c1712" : "#d6d0c3",
                filter: i <= stageIdx ? "url(#rough-sm)" : "none",
                transform: i <= stageIdx ? `rotate(${[-0.5, 0.4, -0.3, 0.5, -0.4][i]}deg)` : "none",
              }}
            />
            <span className="font-sans text-[9px] text-ink-faint">{s}</span>
          </div>
        ))}
      </div>

      {/* Bouncing dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-2 w-2 animate-bounce rounded-full bg-ink-mid"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
