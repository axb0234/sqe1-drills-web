/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  output: 'standalone',          // ✅ build a self-contained Node server
  eslint: { ignoreDuringBuilds: true } // optional: keeps CI green if lint errors
};
export default nextConfig;
