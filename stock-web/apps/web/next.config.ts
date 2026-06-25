import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "@stock-web/agents": path.resolve(
        __dirname,
        "../../packages/agents/src/index.ts",
      ),
    },
  },
  serverExternalPackages: ["openai"],
};

export default nextConfig;
