import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@auction/core", "@auction/db"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }],
  },
};

export default nextConfig;
