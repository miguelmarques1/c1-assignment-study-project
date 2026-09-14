/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API runs in a sibling container; the browser talks to it directly at
  // NEXT_PUBLIC_API_URL, while server components use the internal hostname.
  env: {
    API_INTERNAL_URL: process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL,
  },
};

export default nextConfig;
