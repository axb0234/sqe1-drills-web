/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  output: 'standalone',                 // build self-contained server
  eslint: { ignoreDuringBuilds: true }, // optional

  webpack: (config, { isServer }) => {
    if (isServer) {
      const addExternal = (request) =>
        request === 'pg' || request === 'pg-native' ? `commonjs ${request}` : undefined;

      const { externals } = config;
      if (typeof externals === 'function') {
        const original = externals;
        config.externals = async (context, request, callback) => {
          const maybe = addExternal(request);
          if (maybe) return callback(null, maybe);
          return original(context, request, callback);
        };
      } else {
        const addition = {
          pg: 'commonjs pg',
          'pg-native': 'commonjs pg-native',
        };
        if (Array.isArray(externals)) {
          externals.push(addition);
        } else if (externals) {
          config.externals = [externals, addition];
        } else {
          config.externals = [addition];
        }
      }
    }
    return config;
  },
};

export default nextConfig;
