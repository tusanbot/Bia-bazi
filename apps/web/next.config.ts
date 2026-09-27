import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bia-bazi/hokm-engine"],
  output: "export",
  trailingSlash: true
};

export default nextConfig;
