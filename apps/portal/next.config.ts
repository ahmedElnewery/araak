import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@workspace/ui"],
};

export default nextConfig;
