import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@auction/core", "@auction/db"],
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
