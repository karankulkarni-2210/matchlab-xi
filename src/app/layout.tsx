import type { Metadata, Viewport } from "next";
import Image from "next/image";
import { Bodoni_Moda, Manrope } from "next/font/google";
import { Intro, INTRO_HEAD_SCRIPT } from "@/components/cricket/Intro";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const bodoni = Bodoni_Moda({ variable: "--font-bodoni", subsets: ["latin"], display: "swap" });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "MatchLab XI · Fantasy Cricket Match Day Optimizer",
  description: "Evidence-based Dream11 team building with a post-match learning loop.",
};
export const viewport: Viewport = { themeColor: "#334310", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodoni.variable} ${manrope.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_HEAD_SCRIPT }} />
      </head>
      <body className="min-h-full bg-clover text-cream">
        <Intro />
        <div className="flex min-h-dvh flex-col lg:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 pb-32 pt-5 lg:px-7 lg:pb-12 lg:pt-6">
            {children}
            <footer className="mx-auto mt-16 flex max-w-6xl justify-center pb-4 lg:hidden">
              <div className="w-full max-w-[360px] rounded-3xl bg-[var(--logo-panel)] p-5">
                <Image src="/cricket-logo.png" alt="Cricket illustration with helmet, bat, ball and stumps" width={736} height={736} sizes="360px" className="h-auto w-full rounded-2xl" />
              </div>
            </footer>
          </main>
        </div>
      </body>
    </html>
  );
}
