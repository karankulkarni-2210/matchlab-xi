import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import { currentUser } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MatchLab XI — Fantasy Cricket Match Day Optimizer",
  description: "Evidence-based Dream11 team building with a post-match learning loop.",
};
export const viewport: Viewport = { themeColor: "#0B1110", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-ink text-warm">
        <div className="flex min-h-dvh flex-col lg:flex-row">
          <Sidebar email={user?.email ?? null} />
          <main className="min-w-0 flex-1 px-4 pb-28 pt-5 lg:px-7 lg:pb-10 lg:pt-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
