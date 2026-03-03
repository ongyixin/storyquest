import type { Metadata } from "next";
import { Patrick_Hand, Indie_Flower, Chewy } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";

const patrickHand = Patrick_Hand({
  weight: "400",
  variable: "--font-patrick-hand",
  subsets: ["latin"],
  display: "swap",
});

const indieFlower = Indie_Flower({
  weight: "400",
  variable: "--font-indie-flower",
  subsets: ["latin"],
  display: "swap",
});

const chewy = Chewy({
  weight: "400",
  variable: "--font-chewy",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "StoryQuest — Agentic Comic Stories",
  description:
    "Transform a short premise into a coherent comic. Normal read-only mode or Interactive mode with choices and voice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${patrickHand.variable} ${indieFlower.variable} ${chewy.variable} min-h-screen bg-paper text-ink`}>
        {/*
         * Global SVG filter defs — referenced via CSS `filter: url(#id)`.
         * Three roughness levels:
         *   #rough    → 3.5px displacement for panel borders
         *   #rough-md → 4px for buttons and choice cards
         *   #rough-sm → 2.5px for speech bubbles and small badges
         */}
        <svg
          className="pointer-events-none absolute h-0 w-0 overflow-hidden"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <filter id="rough" x="-3%" y="-3%" width="106%" height="106%">
              <feTurbulence
                type="turbulence"
                baseFrequency="0.012 0.018"
                numOctaves="2"
                seed="4"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="3.5"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>

            <filter id="rough-md" x="-5%" y="-8%" width="110%" height="116%">
              <feTurbulence
                type="turbulence"
                baseFrequency="0.02 0.032"
                numOctaves="2"
                seed="7"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="4"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>

            <filter id="rough-sm" x="-5%" y="-10%" width="110%" height="120%">
              <feTurbulence
                type="turbulence"
                baseFrequency="0.03 0.05"
                numOctaves="2"
                seed="2"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="2.5"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>

        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
