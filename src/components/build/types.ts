import type { Explanation } from "@/lib/ai/explain";
import type { AiStatus } from "@/lib/ai/gemini";
import type { BuildResult as BuildResultBase } from "@/lib/server/build";

export type { Explanation };
export type BuildResult = BuildResultBase & { template?: Explanation | null };
export type Forecast = BuildResult["forecasts"][number];

export interface ExplainResponse {
  status: AiStatus | "template";
  output: Explanation | null;
  template: Explanation | null;
  model: string;
  generatedAt: string | null;
  error?: string;
}
