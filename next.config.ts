import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/.well-known/farcaster.json",
        destination:
          "https://api.farcaster.xyz/miniapps/hosted-manifest/01a05417-0fb8-7aaf-fb63-2b9e688968f5",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;