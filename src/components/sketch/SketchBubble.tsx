import { type ReactNode } from "react";

interface SketchBubbleProps {
  speaker?: string;
  children: ReactNode;
  index?: number;
  tailSide?: "left" | "right";
  delay?: number;
}

const ROTATIONS = [-0.35, 0.28, -0.42, 0.22];

/**
 * Hand-drawn speech bubble.
 *
 * Two-layer: rough-filtered background div behind a z-10 text layer.
 * Text is never displaced — only the bubble outline is.
 */
export function SketchBubble({
  speaker,
  children,
  index = 0,
  tailSide = "left",
  delay = 0,
}: SketchBubbleProps) {
  const rotation = ROTATIONS[index % ROTATIONS.length];

  return (
    <div
      className="bubble-pop relative inline-block"
      style={{ transform: `rotate(${rotation}deg)`, animationDelay: `${delay}ms` }}
    >
      {/* Rough bubble background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded bg-[#faf9f4]"
        style={{ border: "1.5px solid #1c1712", filter: "url(#rough-sm)" }}
      />

      {/* Crisp text */}
      <div className="relative z-10 px-2.5 py-1.5">
        {speaker && (
          <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-light">
            {speaker}
          </p>
        )}
        <p className="text-[11px] leading-tight text-ink">{children}</p>
      </div>

      {/* Sketched tail */}
      <svg
        className={`pointer-events-none absolute -bottom-3 overflow-visible ${tailSide === "left" ? "left-3" : "right-3"}`}
        width="14" height="10"
        viewBox="0 0 14 10"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d={tailSide === "left" ? "M1,0 Q3,7 7,5 Q4,9 0,10 Z" : "M13,0 Q11,7 7,5 Q10,9 14,10 Z"}
          fill="#faf9f4"
          stroke="#1c1712"
          strokeWidth="1.5"
          strokeLinejoin="round"
          filter="url(#rough-sm)"
        />
      </svg>
    </div>
  );
}
