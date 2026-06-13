import type { NextConfig } from "next";

const backendBase =
  process.env.BACKEND_URL?.replace(/\/$/, "")
  || process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")
  || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    // Do NOT use a catch-all /api/* rewrite — it shadows Next.js route handlers
    // (/api/warm-backend, /api/compose) and breaks Turbopack dev when cache is stale.
    return [
      {
        source: "/api/auth/:path*",
        destination: `${backendBase}/auth/:path*`,
      },
      {
        source: "/api/planner/:path*",
        destination: `${backendBase}/planner/:path*`,
      },
      {
        source: "/api/backend/:path*",
        destination: `${backendBase}/:path*`,
      },
      {
        source: "/railradar/:path*",
        destination: "https://api.railradar.org/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
