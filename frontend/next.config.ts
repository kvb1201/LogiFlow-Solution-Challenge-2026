import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Next 16 picks the nearest lockfile as workspace root; repo root has an empty
// package-lock.json, which breaks Tailwind resolution (looks in ../ not frontend/).
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

const backendBase =
  process.env.BACKEND_URL?.replace(/\/$/, "")
  || process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")
  || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  turbopack: {
    root: turbopackRoot,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        // Vercel: BACKEND_URL. Local/legacy: NEXT_PUBLIC_API_URL fallback.
        destination: `${backendBase}/:path*`,
      },
      {
        source: "/railradar/:path*",
        // Proxy to RailRadar API (avoids CORS for live-map calls)
        destination: "https://api.railradar.org/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
