"use client";

import { useState } from "react";
import { DoodleButton } from "./sketch/DoodleButton";

interface ChoiceOption {
  id: string;
  label: string;
  consequenceHint: string;
}

interface ChoiceSet {
  _id: string;
  options: ChoiceOption[];
}

interface Props {
  choiceSet: ChoiceSet;
  onChoose: (choiceId: string) => Promise<void>;
}

export function ChoiceBar({ choiceSet, onChoose }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [chosen,  setChosen]  = useState<string | null>(null);

  async function handleChoice(choiceId: string) {
    if (pending || chosen) return;
    setPending(choiceId);
    try {
      await onChoose(choiceId);
      setChosen(choiceId);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="relative py-2">
      <div
        className="relative bg-paper-dark px-5 py-4"
        style={{ border: "1.5px solid #1c1712", filter: "url(#rough)", boxShadow: "3px 4px 0 0 #1c1712" }}
      >
        <p
          className="mb-4 font-display text-sm uppercase tracking-widest text-ink-mid"
          style={{ transform: "rotate(-0.3deg)" }}
        >
          ✦ What happens next?
        </p>
        <div className="grid grid-cols-2 gap-3">
          {choiceSet.options.map((option, i) => {
            const isChosen = chosen === option.id;
            const isFaded  = chosen !== null && !isChosen;
            return (
              <DoodleButton
                key={option.id}
                index={i}
                variant={isChosen ? "selected" : isFaded ? "faded" : "default"}
                onClick={() => void handleChoice(option.id)}
                disabled={!!pending || !!chosen}
              >
                <span className="flex items-start gap-2 font-sans">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold">
                    {isChosen ? "✓" : pending === option.id ? "…" : String.fromCharCode(65 + i)}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{option.label}</span>
                    {option.consequenceHint && (
                      <span className="mt-0.5 block text-[10px] font-normal opacity-55">{option.consequenceHint}</span>
                    )}
                  </span>
                </span>
              </DoodleButton>
            );
          })}
        </div>
      </div>
    </div>
  );
}
