import type { NextConfig } from 'next';

// Static export: no SSR and no Next API routes at runtime. NEXT_PUBLIC_* values are baked
// in at build time, so each environment needs its own build.
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
