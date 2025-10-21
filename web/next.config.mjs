/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = config.externals;
      const externalHandler = (request) => {
        if (request === 'pg' || request === 'pg-native') {
          return `commonjs ${request}`;
        }
        return undefined;
      };

      if (typeof externals === 'function') {
        const original = externals;
        config.externals = async (context, request, callback) => {
          const result = externalHandler(request);
          if (result) {
            return callback(null, result);
          }
          return original(context, request, callback);
        };
      } else {
        const extra = externalHandler('pg');
        const extraNative = externalHandler('pg-native');
        const addition = {};
        if (extra) addition.pg = extra;
        if (extraNative) addition['pg-native'] = extraNative;
        if (Array.isArray(externals)) {
          externals.push(addition);
        } else {
          config.externals = [externals, addition].filter(Boolean);
        }
      }
    }

    return config;
  },
};

  output: 'standalone',          // ✅ build a self-contained Node server
  eslint: { ignoreDuringBuilds: true } // optional: keeps CI green if lint errors
};
export default nextConfig;
