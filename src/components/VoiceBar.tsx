"use client";

/**
 * VoiceBar — lets the player speak to an NPC character.
 *
 * STT pipeline (in priority order):
 *   1. Web Speech API (SpeechRecognition) — real-time, no server round-trip.
 *      Works in Chrome, Edge, and Safari. Not available in Firefox.
 *   2. MediaRecorder → /api/transcribe (Speechmatics batch) — fallback for
 *      browsers that don't support SpeechRecognition.
 *
 * TTS pipeline:
 *   - Browser speechSynthesis API — speaks the NPC's reply text aloud once the
 *     Convex conversation subscription delivers a new NPC turn.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { SketchVoiceButton } from "./sketch/SketchVoiceButton";
import { SketchInputWrap } from "./sketch/SketchInputWrap";

// ─── Web Speech API ambient types ────────────────────────────────────────────
interface SpeechRecognitionAlternative {
  readonly transcript: string;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
  readonly resultIndex: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

interface CharacterSheet {
  id: string;
  name: string;
}

interface Props {
  sessionId: Id<"sessions">;
  characterSheets: CharacterSheet[];
  onUtterance: (args: { characterId: string; text: string }) => Promise<void>;
}

type RecordingState = "idle" | "listening" | "processing";

export function VoiceBar({ sessionId, characterSheets, onUtterance }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedCharId, setSelectedCharId] = useState<string>(
    characterSheets[0]?.id ?? ""
  );
  const [textInput, setTextInput] = useState("");
  const [pending, setPending] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [interimText, setInterimText] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // TTS tracking: only speak NPC turns that arrive after the component mounts
  const initializedCharRef = useRef<string | null>(null);
  const lastSpokenTsRef = useRef<number>(0);

  const characters =
    characterSheets.length > 0
      ? characterSheets
      : [{ id: "narrator", name: "Narrator" }];

  // ── Convex subscription: conversation turns for selected character ─────────
  const turns = useQuery(api.conversations.getConversation, {
    sessionId,
    characterId: selectedCharId,
  });

  // Initialize the "last spoken" threshold when we first get data for a character
  // (prevents speaking conversation history that existed before this session).
  useEffect(() => {
    if (turns === undefined) return; // still loading
    if (initializedCharRef.current === selectedCharId) return; // already done

    initializedCharRef.current = selectedCharId;
    if (turns && turns.length > 0) {
      lastSpokenTsRef.current = Math.max(...turns.map((t) => t.ts));
    } else {
      lastSpokenTsRef.current = 0;
    }
  }, [turns, selectedCharId]);

  // Speak new NPC turns via browser speechSynthesis
  useEffect(() => {
    if (initializedCharRef.current !== selectedCharId) return;
    if (!turns || turns.length === 0) return;

    const newNpcTurns = turns.filter(
      (t) => t.role === "npc" && t.ts > lastSpokenTsRef.current
    );
    if (newNpcTurns.length === 0) return;

    lastSpokenTsRef.current = Math.max(...newNpcTurns.map((t) => t.ts));

    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    newNpcTurns.forEach((turn, i) => {
      const utterance = new SpeechSynthesisUtterance(turn.text);
      utterance.rate = 0.95;
      utterance.pitch = 1.05;
      if (i === 0) utterance.onstart = () => setIsSpeaking(true);
      if (i === newNpcTurns.length - 1)
        utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    });
  }, [turns, selectedCharId]);

  // Reset TTS tracking when selected character changes
  const handleCharChange = useCallback((charId: string) => {
    setSelectedCharId(charId);
    initializedCharRef.current = null;
    lastSpokenTsRef.current = 0;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  // ── STT: Web Speech API ───────────────────────────────────────────────────
  const hasSpeechRecognition =
    typeof window !== "undefined" &&
    (!!window.SpeechRecognition || !!window.webkitSpeechRecognition);

  const startWebSpeech = useCallback(() => {
    setMicError(null);
    const SR =
      (window.SpeechRecognition ?? window.webkitSpeechRecognition)!;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        setTextInput((prev) => (prev ? `${prev.trimEnd()} ${final}` : final));
        setInterimText("");
      } else {
        setInterimText(interim);
      }
    };

    rec.onend = () => {
      setRecordingState("idle");
      setInterimText("");
      recognitionRef.current = null;
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted") {
        setMicError(
          event.error === "not-allowed"
            ? "Microphone access denied. Check browser permissions."
            : `Speech recognition error: ${event.error}`
        );
      }
      setRecordingState("idle");
      setInterimText("");
      recognitionRef.current = null;
    };

    recognitionRef.current = rec;
    rec.start();
    setRecordingState("listening");
  }, []);

  // ── STT: MediaRecorder + Speechmatics (fallback) ──────────────────────────
  const startMediaRecorder = useCallback(async () => {
    setMicError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError("Microphone access denied. Check browser permissions.");
      return;
    }

    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecordingState("processing");

      try {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "recording.webm");

        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        if (!res.ok) throw new Error(await res.text());

        const data = (await res.json()) as { text?: string; error?: string };
        if (data.error) throw new Error(data.error);
        if (data.text) {
          setTextInput((prev) =>
            prev ? `${prev.trimEnd()} ${data.text!}` : data.text!
          );
        }
      } catch (err) {
        setMicError(
          err instanceof Error ? err.message : "Transcription failed. Try typing."
        );
      } finally {
        setRecordingState("idle");
        mediaRecorderRef.current = null;
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecordingState("listening");
  }, []);

  // ── Unified start / stop ──────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (hasSpeechRecognition) {
      startWebSpeech();
    } else {
      void startMediaRecorder();
    }
  }, [hasSpeechRecognition, startWebSpeech, startMediaRecorder]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ── Send ──────────────────────────────────────────────────────────────────
  async function handleSend() {
    const text = textInput.trim();
    if (!text || pending) return;
    setPending(true);
    try {
      await onUtterance({ characterId: selectedCharId, text });
      setTextInput("");
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  // Displayed value in the textarea: confirmed text + greyed interim
  const displayValue =
    interimText && textInput
      ? `${textInput} ${interimText}`
      : interimText || textInput;

  return (
    <div
      className="relative overflow-hidden bg-paper-dark"
      style={{
        border: "1.5px solid #3d3730",
        filter: "url(#rough)",
        boxShadow: "3px 3px 0 0 #1c1712",
      }}
    >
      {/* ── Toggle header ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 font-sans text-sm font-semibold text-ink-mid transition-colors hover:bg-paper"
      >
        <span className="flex items-center gap-2">
          <SketchVoiceButton
            className="pointer-events-none h-8 w-8"
            style={{ transform: "none" }}
          />
          <span>Talk to a character</span>
          <span className="font-normal text-ink-faint text-xs">
            (voice self-insert)
          </span>
          {isSpeaking && (
            <span className="inline-flex items-center gap-1 text-xs text-accent-warm">
              <span className="h-2 w-2 animate-ping rounded-full bg-accent-warm" />
              speaking…
            </span>
          )}
        </span>
        <span className="text-ink-faint">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          className="space-y-3 border-t px-4 pb-4 pt-3"
          style={{ borderColor: "#9c9286" }}
        >
          {/* ── Character selector ─────────────────────────────── */}
          <div>
            <label className="mb-1 block font-sans text-xs text-ink-light">
              Who do you want to talk to?
            </label>
            <SketchInputWrap>
              <select
                value={selectedCharId}
                onChange={(e) => handleCharChange(e.target.value)}
                className="w-full appearance-none bg-paper px-3 py-2 font-sans text-sm text-ink outline-none"
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </SketchInputWrap>
          </div>

          {/* ── Input row: mic button + textarea ───────────────── */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="font-sans text-xs text-ink-light">
                What do you say?
              </label>
              <span className="font-sans text-xs text-ink-faint">
                {recordingState === "listening" && (
                  <span className="flex items-center gap-1 text-accent-red">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-accent-red" />
                    Listening…
                  </span>
                )}
                {recordingState === "processing" && (
                  <span className="text-ink-mid">Transcribing…</span>
                )}
              </span>
            </div>

            <div className="flex items-start gap-2">
              {/* Mic toggle button */}
              <button
                type="button"
                onClick={
                  recordingState === "idle" ? startListening : stopListening
                }
                disabled={recordingState === "processing" || pending}
                title={
                  recordingState === "listening"
                    ? "Stop recording"
                    : "Start voice input"
                }
                className={[
                  "relative mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center transition-all",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                  recordingState === "listening"
                    ? "bg-red-500 text-white"
                    : "bg-paper text-ink-mid hover:bg-paper-dark",
                ].join(" ")}
                style={{ border: "1.5px solid #9c9286", filter: "url(#rough-sm)" }}
              >
                {recordingState === "processing" ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-faint border-t-ink" />
                ) : recordingState === "listening" ? (
                  /* Stop icon */
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                ) : (
                  /* Microphone icon */
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 10v2a7 7 0 0 1-14 0v-2"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 19v4M8 23h8"
                    />
                  </svg>
                )}
              </button>

              {/* Text area */}
              <div className="flex-1">
                <SketchInputWrap>
                  <textarea
                    rows={2}
                    value={displayValue}
                    onChange={(e) => {
                      // Only update textInput when user is typing manually
                      if (recordingState !== "listening") {
                        setTextInput(e.target.value);
                        setInterimText("");
                      }
                    }}
                    placeholder={`Say something to ${characters.find((c) => c.id === selectedCharId)?.name ?? "the character"}…`}
                    className={[
                      "w-full resize-none bg-paper px-3 py-2 font-sans text-sm outline-none",
                      interimText ? "text-ink-faint italic" : "text-ink",
                    ].join(" ")}
                    readOnly={recordingState === "listening"}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                </SketchInputWrap>
              </div>
            </div>
          </div>

          {/* ── Mic error message ──────────────────────────────── */}
          {micError && (
            <p className="font-sans text-xs text-red-600">{micError}</p>
          )}

          {/* ── Send button ────────────────────────────────────── */}
          <button
            onClick={handleSend}
            disabled={!textInput.trim() || pending}
            className="relative w-full py-2.5 font-sans text-sm font-bold text-paper transition-all active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
            style={{ boxShadow: "2px 2px 0 0 #1c1712" }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0"
              style={{ backgroundColor: "#2a5caa", filter: "url(#rough-md)" }}
            />
            <span className="relative z-10">
              {pending ? "Sending…" : "Send"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
