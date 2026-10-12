import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ProviderError } from "@/lib/providers/cache";
import { HttpError } from "./teams";

/** Uniform JSON error responses. Never includes secrets or stack traces. */
export function handleError(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, details: e.details ?? null }, { status: e.status });
  if (e instanceof ZodError)
    return NextResponse.json({ error: "Invalid request", details: e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  if (e instanceof ProviderError)
    return NextResponse.json({ error: e.message, kind: e.kind }, { status: e.kind === "quota" ? 429 : e.kind === "config" ? 503 : 502 });
  console.error("[matchlab] unexpected error", e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
}
