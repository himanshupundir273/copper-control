/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

