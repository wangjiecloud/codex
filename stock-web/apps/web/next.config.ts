import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  transpilePackages: ["@stock-web/agents", "@xyflow/react", "@xyflow/system"],
  serverExternalPackages: ["openai"],
};

export default nextConfig;
