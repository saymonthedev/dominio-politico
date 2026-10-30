import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@dp/engine", "@dp/data"],
  // cada publicação com identidade própria: a aba aberta sabe quando ficou desatualizada
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  env: { NEXT_PUBLIC_BUILD: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      { source: "/jogo/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
    ];
  },
};

export default config;
