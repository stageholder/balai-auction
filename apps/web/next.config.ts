import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@auction/core", "@auction/db"],
  // pnpm monorepo: trace files from the repo root so the Prisma query engine
  // (which lives in the workspace-root .pnpm store) is copied into the
  // serverless bundle on Vercel. Keep @prisma/client external so it resolves
  // its engine from node_modules instead of being bundled.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  serverExternalPackages: ["@prisma/client", "prisma"],
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
