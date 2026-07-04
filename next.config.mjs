// NEXT_STATIC_DEMO=1 builds a fully static bundle (no API route) for
// CDN demo hosting. The normal build stays a zero config Vercel app.
const staticDemo = process.env.NEXT_STATIC_DEMO === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(staticDemo
    ? {
        output: "export",
        assetPrefix: process.env.NEXT_DEMO_ASSET_PREFIX || undefined,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
