import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Classic dynamic rendering model: pages that read auth cookies render per request.
  cacheComponents: false,
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
