import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // Proxy to FastAPI backend (used when BACKEND_BASE falls back to '/api')
        destination: `${backendUrl}/:path*`,
      },
      {
        source: '/railradar/:path*',
        // Proxy to RailRadar API (avoids CORS for live-map calls)
        destination: 'https://api.railradar.org/api/v1/:path*',
      },
    ];
  },
};

export default nextConfig;
