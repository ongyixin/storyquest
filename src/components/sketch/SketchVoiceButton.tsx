"use client";

import { type ButtonHTMLAttributes } from "react";

interface SketchVoiceButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isRecording?: boolean;
}

export function SketchVoiceButton({
  isRecording = false,
  className = "",
  disabled,
  ...rest
}: SketchVoiceButtonProps) {
  const fill   = isRecording ? "#b33030" : "#faf9f4";
  const stroke = isRecording ? "#7a1a1a" : "#1c1712";
  const icon   = isRecording ? "#faf9f4" : "#1c1712";

  return (
    <button
      {...rest}
      disabled={disabled}
      aria-label={isRecording ? "Recording — release to stop" : "Hold to record"}
      className={`wobble-hover relative flex h-14 w-14 items-center justify-center rounded-full select-none transition-transform
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
        ${isRecording ? "scale-110" : "active:scale-95"}
        ${className}`}
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {isRecording && (
          <>
            <circle cx="28" cy="28" r="22" fill="none" stroke="#b33030" strokeWidth="1" opacity="0.4"
              style={{ animation: "sound-pulse 1s ease-in-out infinite" }} />
            <circle cx="28" cy="28" r="27" fill="none" stroke="#b33030" strokeWidth="0.8" opacity="0.2"
              style={{ animation: "sound-pulse 1s ease-in-out infinite", animationDelay: "200ms" }} />
          </>
        )}
        <circle cx="28" cy="28" r="24" fill={fill} stroke={stroke} strokeWidth="2" filter="url(#rough-sm)" />
      </svg>

      {/* Mic icon — no filter */}
      <svg className="relative z-10 h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="9" y="2" width="6" height="11" rx="3" stroke={icon} strokeWidth="1.8" fill="none" />
        <path d="M5 10a7 7 0 0 0 14 0" stroke={icon} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <line x1="12" y1="17" x2="12" y2="21" stroke={icon} strokeWidth="1.8" strokeLinecap="round" />
        <line x1="8"  y1="21" x2="16" y2="21" stroke={icon} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
