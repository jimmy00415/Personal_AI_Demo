import type { NextConfig } from "next";

const repo = "Personal_AI_Demo";
const isGithubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  // Keep the development overlay from covering the mobile bottom navigation.
  devIndicators: false,
  output: isGithubPages ? "export" : undefined,
  basePath: isGithubPages ? `/${repo}` : "",
  assetPrefix: isGithubPages ? `/${repo}/` : undefined,
  trailingSlash: isGithubPages,
  images: { unoptimized: true },
  // The static export has no API route, so the client must never probe for one.
  env: { NEXT_PUBLIC_STATIC_EXPORT: isGithubPages ? "true" : "false" },
};

export default nextConfig;
