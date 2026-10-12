"use client";
import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabaseBrowser();
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "/";
      } else {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/` } });
        if (error) throw error;
        if (data.session) window.location.href = "/";
        else setMsg({ tone: "ok", text: "Account created. Check your inbox to confirm your email, then sign in." });
      }
    } catch (err) {
      setMsg({ tone: "bad", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-3xl font-bold tracking-tight">{mode === "signin" ? "Sign in" : "Create account"}</h1>
      <p className="mt-2 text-sm text-muted">Your saved teams, actual points and weight decisions are private to you (Supabase Auth + row-level security). The demo stays open without an account.</p>
      <form onSubmit={submit} className="panel mt-6 space-y-4 p-5">
        <label className="block text-sm">
          <span className="text-muted">Email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="focus-ring mt-1 w-full rounded-lg border border-line-2 bg-ink-2 px-3 py-2.5" />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Password</span>
          <input type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="focus-ring mt-1 w-full rounded-lg border border-line-2 bg-ink-2 px-3 py-2.5" />
        </label>
        <button disabled={busy} className="focus-ring w-full rounded-lg bg-lime px-4 py-2.5 font-semibold text-ink disabled:opacity-50">
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        {msg && (
          <p role="status" className={msg.tone === "ok" ? "text-sm text-ok" : "text-sm text-bad"}>
            {msg.text}
          </p>
        )}
        <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="focus-ring text-sm text-lime">
          {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        Or <Link href="/build/demo-hh-dd" className="text-lime underline">explore the labelled demo</Link> without an account.
      </p>
    </div>
  );
}
