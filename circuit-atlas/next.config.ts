import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  assetPrefix: "/__circuit_atlas",
  output: "standalone",
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
