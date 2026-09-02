import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Campusly Next.js config */
};

export default nextConfig;

// Only initialize Cloudflare bindings for local Next.js dev when credentials exist.
// Production builds use OpenNext (`opennextjs-cloudflare build`) instead.
if (process.env.NODE_ENV === "development" && process.env.CLOUDFLARE_API_TOKEN) {
  void import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}
