import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Classic dynamic rendering model: pages that read auth cookies render per request.
  cacheComponents: false,
  // Cricsheet aggregates are read from disk at runtime by server routes.
  outputFileTracingIncludes: { "/**": ["./data/history/**"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
