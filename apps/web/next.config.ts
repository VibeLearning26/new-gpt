import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  // reicon-react exports thousands of icon modules; load only what's used.
  experimental: {
    optimizePackageImports: ["reicon-react"],
  },
  // Environment variables accessible at build time
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  },
};

export default nextConfig;
