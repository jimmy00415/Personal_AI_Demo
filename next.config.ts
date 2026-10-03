import type { NextConfig } from "next";

const repo = "Personal_AI_Demo";
const isGithubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: isGithubPages ? "export" : undefined,
  basePath: isGithubPages ? `/${repo}` : "",
  assetPrefix: isGithubPages ? `/${repo}/` : undefined,
  trailingSlash: isGithubPages,
  images: { unoptimized: true },
};

export default nextConfig;
