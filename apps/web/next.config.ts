import type { NextConfig } from "next";

// Cloudflare Pages sets CF_PAGES=1 during its build. The app is fully
// client-rendered (all pages are "use client" and call the API via
// NEXT_PUBLIC_API_URL), so Pages builds a static export from the exact same
// source — no UI, styling, or animation changes. Local dev and the Docker
// standalone build are unaffected.
const isCloudflarePages = process.env.CF_PAGES === "1";

// Vercel sets VERCEL=1 during its build. In the multi-service deployment the
// /_next/image optimizer route is not reachable, so images are served as-is
// from /public (which works — verified 200 on the deployed assets).
const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  output: isCloudflarePages ? "export" : "standalone",
  turbopack: {
    root: process.cwd(),
  },
  images: {
    // Static export has no Node server for the image optimizer, and the
    // Vercel service routing can't reach /_next/image — ship images as-is
    // there (local dev and Docker/standalone keep optimizing).
    unoptimized: isCloudflarePages || isVercel,
    // Team photos use a ?v=N cache-busting query string (see app/team/page.tsx).
    // Allowing query strings turns localPatterns into a whitelist, so EVERY
    // local image used via next/image must be listed here — add new ones if you
    // see a "does not match images.localPatterns" error.
    localPatterns: [
      { pathname: "/devs/**" }, // team photos — open search for ?v=N busting
      { pathname: "/logo.png", search: "" }, // logo (nav / layouts / footer)
      { pathname: "/VJEC.png", search: "" }, // hero artwork
    ],
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
