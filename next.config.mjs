/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: '/api/:path((?!auth).*)',
        destination: 'https://api.india.delta.exchange/:path*',
      },
      {
        source: '/claude/:path*',
        destination: 'https://api.anthropic.com/:path*',
      },
      {
        source: '/groq/:path*',
        destination: 'https://api.groq.com/:path*',
      },
    ];
  },
};

export default nextConfig;
