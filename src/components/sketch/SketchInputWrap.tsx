import { type ReactNode } from "react";

/**
 * Wraps any input/select/textarea with a rough ink border.
 *
 * The border sits on an absolutely-positioned background layer (filtered).
 * The input itself is on z-10 with no filter applied — text stays crisp.
 */
export function SketchInputWrap({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ border: "1.5px solid #6b6055", filter: "url(#rough-sm)" }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
