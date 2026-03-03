"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const rawUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
// ConvexReactClient requires an absolute URL (e.g. https://xxx.convex.cloud).
// Ignore deployment ids like "dev:project-name" or empty/undefined.
const convexUrl =
  rawUrl.startsWith("https://") || rawUrl.startsWith("http://")
    ? rawUrl
    : "https://placeholder.convex.cloud";

const convex = new ConvexReactClient(convexUrl);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
