import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@auction/core", "@auction/db"],
  // pnpm monorepo: trace files from the repo root so dependencies resolve.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Copy the Prisma query engine binary next to the server bundle — the
  // official fix for "could not locate the Query Engine" on Vercel in a
  // monorepo. Server build only.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      // Local Supabase Storage
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
      // Hosted Supabase Storage (prod)
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
