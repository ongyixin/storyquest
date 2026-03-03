"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";

interface DoodleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  index?: number;
  variant?: "default" | "primary" | "selected" | "faded";
}

const ROTATIONS = [-0.7, 0.5, -0.4, 0.65, -0.3, 0.55];

const BG: Record<string, string> = {
  default:  "#f7f4ee",
  primary:  "#1c1712",
  selected: "#2a5caa",
  faded:    "#d6d0c3",
};
const BORDER: Record<string, string> = {
  default:  "#3d3730",
  primary:  "#3d3730",
  selected: "#5b8ad4",
  faded:    "#9c9286",
};
const TEXT: Record<string, string> = {
  default:  "#1c1712",
  primary:  "#f7f4ee",
  selected: "#f7f4ee",
  faded:    "#9c9286",
};

/**
 * Sticky-note style button.
 * Rough border on a background span; text lives on z-10 (no filter).
 */
export function DoodleButton({
  children,
  index = 0,
  variant = "default",
  className = "",
  style,
  disabled,
  ...rest
}: DoodleButtonProps) {
  const rotation = ROTATIONS[index % ROTATIONS.length];
  const shadow = variant === "selected" || variant === "faded" ? "none" : "2px 3px 0 0 #1c1712";

  return (
    <button
      {...rest}
      disabled={disabled}
      className={`relative text-left transition-all duration-150 active:translate-y-px ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`}
      style={{ transform: `rotate(${rotation}deg)`, boxShadow: shadow, color: TEXT[variant], ...style }}
    >
      {/* Rough border background — only this is filtered */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded"
        style={{ backgroundColor: BG[variant], border: `1.5px solid ${BORDER[variant]}`, filter: "url(#rough-md)" }}
      />
      {/* Crisp content */}
      <span className="relative z-10 block px-4 py-3">{children}</span>
    </button>
  );
}
