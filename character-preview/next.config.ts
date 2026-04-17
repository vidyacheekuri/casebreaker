import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // Allow loading .glb files from public directory
  async headers() {
    return [
      {
        source: "/models/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default nextConfig;
