import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // Use 127.0.0.1 instead of localhost to prevent IPv6/IPv4 binding issues with Uvicorn
        destination: 'http://127.0.0.1:8000/:path*', 
      },
    ];
  },
};

export default nextConfig;
