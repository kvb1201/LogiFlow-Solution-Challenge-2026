import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // Proxy to FastAPI backend
        destination: 'http://127.0.0.1:8000/:path*',
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
