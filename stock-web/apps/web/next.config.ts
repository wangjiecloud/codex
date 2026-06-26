import type { NextConfig } from "next";
import path from "path";

const agentsPath = path.resolve(
  __dirname,
  "../../packages/agents/src/index.ts",
);

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../.."),
    resolveAlias: {
      "@stock-web/agents": agentsPath,
    },
  },
  transpilePackages: ["@xyflow/react", "@xyflow/system"],
  webpack(config) {
    config.resolve.alias["@stock-web/agents"] = agentsPath;
    return config;
  },
  serverExternalPackages: ["openai"],
};

export default nextConfig;
