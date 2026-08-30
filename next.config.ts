import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/.well-known/farcaster.json",
        destination:
          "https://api.farcaster.xyz/miniapps/hosted-manifest/01a053e9-e3de-783c-59af-08d8517679d8",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;