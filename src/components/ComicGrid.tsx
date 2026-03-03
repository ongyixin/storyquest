"use client";

import Image from "next/image";
import { SketchPanel } from "./sketch/SketchPanel";
import { SketchBubble } from "./sketch/SketchBubble";

interface DialogueLine {
  speaker: string;
  text: string;
}

interface PanelData {
  _id: string;
  panelIndex: number;
  imageUrl: string | null;
  script: {
    scene: string;
    dialogue: DialogueLine[];
    camera: string;
  };
}

interface Props {
  panels: PanelData[];
}

export function ComicGrid({ panels }: Props) {
  const sorted = [...panels].sort((a, b) => a.panelIndex - b.panelIndex);

  return (
    <div className="panel-grid">
      {sorted.map((panel, i) => (
        <ComicPanel key={panel._id} panel={panel} index={i} />
      ))}
    </div>
  );
}

function ComicPanel({ panel, index }: { panel: PanelData; index: number }) {
  const { imageUrl, script } = panel;

  return (
    <SketchPanel
      index={index}
      animationDelay={index * 120}
      className="aspect-video w-full"
    >
      <div className="relative h-full w-full">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={`Panel ${panel.panelIndex + 1}: ${script.scene}`}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 672px"
          />
        ) : (
          <PlaceholderPanel panel={panel} />
        )}

        {/* Speech bubbles */}
        {script.dialogue.slice(0, 2).map((line, i) => (
          <div
            key={i}
            className={`absolute z-10 max-w-[38%] ${i === 0 ? "top-3 left-3" : "top-3 right-3"}`}
          >
            <SketchBubble
              speaker={line.speaker}
              index={i}
              tailSide={i === 0 ? "left" : "right"}
              delay={300 + i * 100}
            >
              {line.text}
            </SketchBubble>
          </div>
        ))}

        {/* Panel number — ink stamp */}
        <span
          className="absolute bottom-2 right-2 z-10 font-display text-[11px] font-bold text-paper"
          style={{ backgroundColor: "#1c1712", padding: "1px 6px" }}
        >
          {panel.panelIndex + 1}
        </span>
      </div>
    </SketchPanel>
  );
}

function PlaceholderPanel({ panel }: { panel: PanelData }) {
  const hues = [220, 260, 300, 30, 160, 200];
  const hue  = hues[(panel.script.scene.charCodeAt(0) ?? 0) % hues.length];

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center px-12 py-6"
      style={{ background: `hsl(${hue}, 20%, 88%)` }}
    >
      <p className="text-center font-sans text-sm leading-relaxed text-ink-mid opacity-70 line-clamp-3">
        {panel.script.scene}
      </p>
      <p className="mt-3 font-sans text-xs text-ink-faint">{panel.script.camera}</p>
    </div>
  );
}
