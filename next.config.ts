import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (pdf.js) loads a worker file from node_modules at runtime,
  // so it must not be bundled — load it with Node's own `require`.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
