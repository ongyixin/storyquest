"use client";

import { type ReactNode } from "react";

interface SketchPanelProps {
  children: ReactNode;
  className?: string;
  index?: number;
  animationDelay?: number;
  noAnimation?: boolean;
}

const ROTATIONS = [-0.15, 0.12, -0.1, 0.18, -0.08, 0.14];
const SHADOWS   = [
  "4px 5px 0 0 #1c1712",
  "3px 5px 0 0 #1c1712",
  "5px 4px 0 0 #1c1712",
  "4px 4px 0 0 #1c1712",
  "3px 4px 0 0 #1c1712",
  "5px 5px 0 0 #1c1712",
];

/**
 * Comic panel with a hand-drawn border.
 *
 * Two-layer pattern:
 *  1. Content wrapper — clips overflow, provides background. No filter here
 *     so artwork stays crisp.
 *  2. Absolutely-positioned SVG rect on top with filter="url(#rough)" — only
 *     the border stroke is displaced.
 */
export function SketchPanel({
  children,
  className = "",
  index = 0,
  animationDelay = 0,
  noAnimation = false,
}: SketchPanelProps) {
  const rotation = ROTATIONS[index % ROTATIONS.length];
  const shadow   = SHADOWS[index % SHADOWS.length];

  return (
    <div
      className={`relative ${noAnimation ? "" : "sketch-appear"} ${className}`}
      style={{ animationDelay: `${animationDelay}ms`, transform: `rotate(${rotation}deg)` }}
    >
      {/* Content */}
      <div className="relative h-full overflow-hidden bg-paper-dark" style={{ boxShadow: shadow }}>
        {children}
      </div>

      {/* Hand-drawn border overlay */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="1" y="1" width="98%" height="98%"
          fill="none"
          stroke="#1c1712"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          filter="url(#rough)"
        />
      </svg>
    </div>
  );
}
